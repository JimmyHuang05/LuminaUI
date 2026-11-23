"""Local configuration and cloud prompt assistant. Secrets never leave server responses."""
import storage_paths
import asyncio
import base64
import copy
import io
import json
import re
import hashlib
import logging
import pe_audit
import pe_transport
from pathlib import Path
from urllib.parse import urlsplit
from aiohttp import ClientSession, ClientTimeout, ClientError, web
from PIL import Image, ImageOps

PATH=storage_paths.path('data')/'assistant_config.json'
DEFAULTS={
    'base_url':'https://api.deepseek.com','model':'deepseek-flash','api_key':'',
    'instructions':{'describe': 'Describe visible subjects, clothing, pose, objects, framing, light and medium. Preserve important spatial relationships. Omit uncertain or hidden details. Return the eight-section English prompt.', 'format': 'Organize the source into the eight sections and normalize grammar. Preserve all distinct content and constraints. Do not expand, change the scene or add metadata. If already correct, return it unchanged.', 'modify': 'Apply only the requested changes. Keep unrelated content unchanged. Return the complete eight-section English prompt.', 'enhance': 'Improve wording and organization while preserving the source content. Do not add new facts or resolve conflicting requirements by guessing. Return the complete eight-section English prompt.', 'edit': 'Return only concise image-edit instructions in the user’s language. Specify the requested change; preserve all unmentioned content.'}}


def load_legacy():
    config=copy.deepcopy(DEFAULTS)
    if PATH.exists():
        saved=json.loads(PATH.read_text(encoding='utf-8'))
        config.update({k:saved[k] for k in ('base_url','model','api_key') if k in saved})
        config['instructions'].update(saved.get('instructions',{}))
    return config

def load():
    import pe_models
    if pe_models.PATH.exists():
        return pe_models.config()
    return load_legacy()

def public(config):
    return {k:v for k,v in config.items() if k!='api_key'}|{'has_api_key':bool(config.get('api_key')),'defaults':DEFAULTS['instructions']}

def validate(body,existing):
    if not isinstance(body,dict): raise ValueError('配置无效')
    config=copy.deepcopy(existing)
    for key in ('base_url','model','api_key'):
        if key in body:
            value=body[key]
            if not isinstance(value,str) or len(value)>2048: raise ValueError('配置字段无效')
            if key!='api_key' or value.strip():config[key]=value.strip()
    url=urlsplit(config['base_url'])
    if url.scheme!='https' or not url.hostname or url.username or url.password or url.query or url.fragment or any(c.isspace() for c in config['base_url']): raise ValueError('API 地址请使用完整 HTTPS 地址')
    config['base_url']=config['base_url'].rstrip('/')
    if not config['model']:raise ValueError('请填写模型名称')
    if body.get('clear_key') is True:config['api_key']=''
    instructions=body.get('instructions',{})
    if not isinstance(instructions,dict):raise ValueError('功能指令无效')
    for key,value in instructions.items():
        if key not in DEFAULTS['instructions'] or not isinstance(value,str) or not value.strip() or len(value)>12000:raise ValueError('功能指令不能为空，最多 12000 字')
        config['instructions'][key]=value.strip()
    return config

async def settings(request):
    config=load_legacy()
    if request.method=='POST':
        config=validate(await request.json(),config)
        PATH.parent.mkdir(exist_ok=True)
        temporary=PATH.with_suffix('.tmp')
        temporary.write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
        temporary.replace(PATH)
    return web.json_response(public(config))

def encode_image(path):
    with Image.open(path) as image:
        image=ImageOps.exif_transpose(image).convert('RGB')
        image.thumbnail((2048,2048))
        buffer=io.BytesIO();image.save(buffer,format='JPEG',quality=92)
    return 'data:image/jpeg;base64,'+base64.b64encode(buffer.getvalue()).decode('ascii')

class ModelRefusal(ValueError):
    pass

class NoExecutableEdit(ValueError):
    pass

class Completion(str):
    def __new__(cls,text,provider):
        obj=super().__new__(cls,text);obj.provider=provider;return obj

def check_refusal(result):
    text=result.strip().replace('’',"'")
    refused=re.match(r"(?is)^(?:(?:I'm sorry|Sorry)[,.!]?\s*(?:but\s+)?)?I (?:can't|cannot|am unable to|am not able to|must decline to) (?:help|assist|comply|generate|provide|describe|fulfill|process)\b",text)
    if refused or re.match(r'^(?:抱歉[，,。]?|对不起[，,。]?)?(?:我)?(?:无法|不能|不支持)(?:帮助|协助|处理|生成|描述|提供)',text):
        if re.search(r'explicit sexual|sexually explicit',text,re.I):
            raise ModelRefusal('模型服务拒绝反推：该图片被判定为露骨性内容，无法生成提示词；原内容已保留')
        raise ModelRefusal('模型服务明确拒绝处理此请求；原内容已保留')


async def complete(prompt,image=None,system_prompt='',structured=False,task='enhance',config=None,validator=None,allow_fallback=False,output_schema=None):
    config=config or load()
    local=config.get('kind')=='local'
    name=config.get('name') or config.get('model','PE')
    if not local and not config.get('api_key'):raise ValueError('请先在设置中配置 API Key')
    if image and config.get('vision') is False:raise ValueError('当前模型不支持图片，请选择支持图片的模型')
    content=[{'type':'text','text':prompt}]
    if image:content.append({'type':'image_url','image_url':{'url':await asyncio.to_thread(encode_image,image)}})
    system=system_prompt+'\n\nTASK INSTRUCTIONS:\n'+config['instructions'][task]
    if structured:system+='\nReturn valid JSON with exactly title and prompt. title: short descriptive Chinese title; prompt: complete English prompt. No Markdown fences.'
    payload={'model':config['model'],'messages':[{'role':'system','content':system},{'role':'user','content':content}], 'max_tokens':6000,'stream':False,'thinking':{'type':'disabled'}}
    if structured:payload['response_format']={'type':'json_object'}
    if output_schema is not None:
        payload['tools']=[{'type':'function','function':{'name':'return_metadata','strict':True,'parameters':output_schema}}]
        payload['tool_choice']={'type':'function','function':{'name':'return_metadata'}}
    def parse(data,provider):
        choice=data['choices'][0]
        if choice.get('finish_reason')=='content_filter' or choice.get('message',{}).get('refusal'):
            raise ModelRefusal('模型服务拒绝处理此内容，原内容已保留')
        if choice.get('finish_reason')=='length':raise ValueError('回复未完成，超出长度限制，原内容已保留')
        result=choice['message'].get('content')
        if output_schema is not None:
            calls=choice['message'].get('tool_calls',[])
            if len(calls)!=1 or calls[0].get('function',{}).get('name')!='return_metadata':raise ValueError('DS 未返回指定结构')
            result=calls[0]['function'].get('arguments')
        if not isinstance(result,str) or not result.strip():raise ValueError('API 未返回有效内容，原内容已保留')
        check_refusal(result)
        if output_schema is not None:pe_transport.validate_schema(json.loads(result),output_schema)
        if structured:
            parsed=json.loads(result)
            if not isinstance(parsed,dict) or not isinstance(parsed.get('title'),str) or not isinstance(parsed.get('prompt'),str):raise ValueError('API 返回格式无效，原内容已保留')
        if validator:validator(result.strip())
        logging.getLogger(__name__).warning('PE completed provider=%s task=%s input_sha256=%s output_sha256=%s output_chars=%s',provider,task,hashlib.sha256(prompt.encode()).hexdigest()[:16],hashlib.sha256(result.strip().encode()).hexdigest()[:16],len(result.strip()))
        return Completion(result.strip(),provider)
    try:
        if local:
            import local_vlm
            if output_schema is not None:
                payload.pop('tools',None);payload.pop('tool_choice',None)
                payload['response_format']={'type':'json_object','schema':output_schema}
                payload['messages'][0]['content']+='\nReturn only JSON matching this schema: '+json.dumps(output_schema)
            data=await local_vlm.complete(payload,config=config)
            data=pe_transport.normalize(config,data,output_schema)
            return parse(data,config.get('id','local'))
        url,headers,payload=pe_transport.request(config,payload)
        async with ClientSession(timeout=ClientTimeout(total=150)) as session:
            async with session.post(url,headers=headers,json=payload,allow_redirects=False) as response:
                if response.status!=200:
                    # Policy denials are terminal, including denials returned as HTTP errors.
                    error_text=await response.text()
                    pe_audit.capture(response.status,error_text,config['api_key'])
                    if response.status==403 or re.search(r'content_filter|content_policy|safety|moderation|policy_violation|拒绝|内容审核',error_text,re.I):
                        raise ModelRefusal('模型服务拒绝处理此请求，原内容已保留')
                    reason={401:'API Key 无效或服务区域不匹配',402:'账户余额不足',404:'模型名称或 API 地址不可用',429:'请求过于频繁或额度不足'}.get(response.status,'请检查模型与接口配置')
                    raise ValueError(f'{name} 请求失败（HTTP {response.status}）：{reason}')
                try:data=await response.json()
                except (ValueError,ClientError):
                    pe_audit.capture(response.status,await response.text(),config['api_key'])
                    raise
                pe_audit.capture(response.status,data,config['api_key'])
        data=pe_transport.normalize(config,data,output_schema)
        return parse(data,config.get('id','deepseek'))
    except (ModelRefusal,NoExecutableEdit):raise
    except (asyncio.TimeoutError,ClientError,ValueError,KeyError,IndexError,TypeError) as error:
        message=str(error) or type(error).__name__
        if config.get('api_key'):message=message.replace(config['api_key'],'[已隐藏]')
        raise ValueError(name+' 请求失败：'+message+'；原内容已保留') from error

async def test(request):
    config=validate(await request.json(),load())
    await complete('Reply OK.',system_prompt='Connection test. Reply briefly.',config=config,allow_fallback=False)
    return web.json_response({'ok':True,'message':'连接成功'})
