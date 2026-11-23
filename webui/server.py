import storage_paths
import asyncio, json, os, secrets, subprocess, sys, time, uuid, webbrowser
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from aiohttp import web, ClientSession, ClientTimeout, FormData
from PIL import Image
import io
from model_library import library as model_library, download as download_model
import lora_manager
import camera_presets
import lora_v2
import prompt_covers
import character_cards
import character_generation
import character_prompt
import krea_hd
import krea_i2i
import workflow_controls
import app_settings
import pe_models
import pe_local_import
import deepseek_client
import pe_chat
import chat_media
import image_reader
import local_vlm
import krea_edit
import prompt_identity
import prompt_gallery
import prompt_metadata
import content_rating
from windows_shell import reveal_file
FORMATTED_RATINGS={}
from output_files import remember_input, set_output_folder, finalize_outputs
from regions import input_path, crop_reference, save_mask, mask_reference, composite, composite_outpaint, prepare_reference, save_annotation, outpaint_reference, restore_size, local_crop, local_blend_pixels

ROOT=Path(__file__).resolve().parents[1]
HERE=Path(__file__).parent
DATA=storage_paths.path('data');DATA.mkdir(exist_ok=True)
BACKEND='http://127.0.0.1:8188'
MANIFEST=json.loads((storage_paths.path('workflows')/'presets/manifest.json').read_text(encoding='utf-8'))
PRESETS={p['id']:p for p in MANIFEST['presets']}
CLIENT=uuid.uuid4().hex
JOBSFILE=DATA/'jobs.json'
JOBS=json.loads(JOBSFILE.read_text(encoding='utf-8')) if JOBSFILE.exists() else []
for job in JOBS:
    if job['status'] in ['queued','running']:job['status']='queued'
PROGRESS={}
PREVIEWS={}
PREVIEW_LISTENERS=set()
TOKEN=secrets.token_urlsafe(32)
MEMORY=json.loads((HERE/'memory_settings.json').read_text(encoding='utf-8'))
MEMORY.update({k:v for k,v in app_settings.load().items() if k=='idle_release_seconds'})
MEMORY_LOCK=asyncio.Lock()
LAST_ACTIVITY=time.monotonic()
RELEASED=False
GENERATION_LORAS_ENABLED=False

SAMPLERS={'euler','euler_ancestral','dpmpp_2m','dpmpp_2m_sde','dpmpp_sde'}
SCHEDULERS={'simple','normal','karras','beta'}

def sampling_settings(body,defaults):
    steps=body.get('steps',defaults['steps'])
    cfg=body.get('cfg',defaults['cfg'])
    sampler=body.get('sampler_name',defaults['sampler_name'])
    scheduler=body.get('scheduler',defaults['scheduler'])
    if isinstance(steps,bool) or not isinstance(steps,int) or not 1<=steps<=100:raise ValueError('采样步数必须是 1–100 的整数')
    if isinstance(cfg,bool) or not isinstance(cfg,(int,float)) or not 0<=float(cfg)<=30:raise ValueError('CFG 必须在 0–30 之间')
    if sampler not in SAMPLERS:raise ValueError('不支持的采样器')
    if scheduler not in SCHEDULERS:raise ValueError('不支持的调度器')
    return steps,float(cfg),sampler,scheduler

def save():
    tmp=JOBSFILE.with_suffix('.tmp');tmp.write_text(json.dumps(JOBS,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(JOBSFILE)

@web.middleware
async def guard(request, handler):
    if request.method=='POST' and request.headers.get('X-App-Token')!=TOKEN:
        raise web.HTTPForbidden(text='请刷新网页后重试')
    try:
        if request.method=='POST' and request.path=='/api/generate':
            incoming=await request.json()
            if incoming.get('generation_workflow')==krea_i2i.WORKFLOW:
                combine_prompt_parts(incoming)
                workflow_controls.resolve(incoming)
                await krea_i2i.prepare(incoming)
                request['krea_i2i_body']=incoming
        if request.method=='POST' and request.path in ('/api/generate','/api/release'):
            async with local_vlm.GPU_LOCK:
                return await handler(request)
        return await handler(request)
    except web.HTTPException:raise
    except (ValueError,KeyError) as e:return web.json_response({'error':str(e)},status=400)
    except Exception as e:return web.json_response({'error':'服务连接失败：'+str(e)},status=502)

async def backend(app,path,data=None):
    async with app['session'].request('GET' if data is None else 'POST',BACKEND+path,json=data) as r:
        result=await r.json()
        if r.status>=400:raise ValueError(json.dumps(result,ensure_ascii=False))
        return result

async def index(request):return web.FileResponse(HERE/('index.html' if request.query.get('studio')=='1' else 'home.html'),headers={'Cache-Control':'no-cache'})
async def prompt_library(request):
    path=DATA/'prompt_library.json'
    previous=json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    original=json.dumps(previous,ensure_ascii=False)
    prompt_identity.normalize(previous)
    if json.dumps(previous,ensure_ascii=False)!=original:
        if path.exists() and not path.with_suffix('.pre-id.json').exists():path.with_suffix('.pre-id.json').write_text(original,encoding='utf-8')
        tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(previous,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(path)
    if prompt_identity.link_jobs(JOBS,previous):save()
    for row in previous: row['recommended_ratio']=prompt_covers.recommended_ratio(row.get('cover_id'))
    if request.method=='POST':
        rows=await request.json()
        if not isinstance(rows,list) or len(rows)>1000:raise ValueError('提示词清单无效')
        for row in rows:
            if not isinstance(row,dict) or not isinstance(row.get('title'),str) or not isinstance(row.get('prompt'),str) or not row['title'].strip() or not row['prompt'].strip() or len(row['title'])>100 or len(row['prompt'])>10000:raise ValueError('请填写标题和提示词，标题最多 100 字')
            tags=row.get('tags',[])
            if not isinstance(tags,list) or len(tags)>20 or any(not isinstance(tag,str) or not tag.strip() or len(tag)>40 for tag in tags):raise ValueError('标签最多 20 个，每个最多 40 字')
            row['tags']=list(dict.fromkeys(tag.strip() for tag in tags))
            if 'prompt_series' in row and row['prompt_series'] not in ('moody_krea2','qwen'):raise ValueError('提示词模型系列无效')
            prompt_covers.validate_id(row.get('cover_id'))
            row['recommended_ratio']=prompt_covers.recommended_ratio(row.get('cover_id'))
            source=row.get('source_url','')
            if not isinstance(source,str) or len(source)>2048:raise ValueError('来源链接最多 2048 字')
            source=source.strip()
            if source:
                try:
                    parsed=urlsplit(source)
                    valid=parsed.scheme in ('http','https') and bool(parsed.hostname) and not parsed.username and not parsed.password and not any(c.isspace() or ord(c)<32 for c in source)
                except ValueError:valid=False
                if not valid:raise ValueError('来源请填写完整的 http:// 或 https:// 网页链接')
            row['source_url']=source
        previous_by_id={r['id']:r for r in previous}
        for row in rows:
            old=previous_by_id.get(row.get('id'),{})
            for key in ('card_summary','module_summaries'):
                if key not in row and key in old:row[key]=old[key]
            prompt_metadata.validate(row.get('card_summary',''),row.get('module_summaries',{}))
            row.pop('rating_override',None)
            rating=FORMATTED_RATINGS.get(content_rating.digest(row['prompt']))
            supplied=row.get('content_rating')
            if isinstance(supplied,dict) and supplied.get('source')=='manual':
                if supplied.get('level') not in content_rating.LEVELS:raise ValueError('分级无效')
                row['content_rating']={'level':supplied['level'],'source':'manual','reason':'手动设置','hash':content_rating.digest(row['prompt'])}
            elif isinstance(supplied,dict) and supplied.get('source') in ('deepseek','qwen3.5-local') and supplied.get('hash')==content_rating.digest(row['prompt']):
                if supplied.get('level') not in content_rating.LEVELS or not isinstance(supplied.get('reason'),str):raise ValueError('分级无效')
                row['content_rating']={k:supplied[k] for k in ('level','source','hash','reason')}
            elif 'content_rating' in row and supplied is None:row.pop('content_rating',None)
            elif rating:row['content_rating']=dict(rating)
            elif old.get('content_rating'):row['content_rating']=old['content_rating']
            else:row.pop('content_rating',None)
        prompt_identity.normalize(rows,previous)
        tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(path)
        return web.json_response({'saved':True,'rows':rows})
    return web.json_response(previous)

def mark_prompt_used(identity):
    from datetime import datetime, timezone
    path=DATA/'prompt_library.json'
    rows=json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    row=next((r for r in rows if r.get('id')==identity),None)
    if row is None:return None
    row['last_used_at']=datetime.now(timezone.utc).isoformat()
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(path)
    return row['last_used_at']

async def prompt_use(request):
    stamp=mark_prompt_used(request.match_info['id'])
    if stamp is None:raise web.HTTPNotFound(text='提示词不存在')
    return web.json_response({'last_used_at':stamp})

async def generated_images(request):
    images=await asyncio.to_thread(prompt_gallery.collect,list(JOBS),None,media_path,True)
    query=request.query.get('q','').strip().casefold()
    if query:
        images=[r for r in images if query in ' '.join(str(r.get(k) or '') for k in ('title','prompt','filename','library_prompt_id','model')).casefold()]
    offset=max(0,int(request.query.get('offset','0')))
    return web.json_response({'images':images[offset:offset+60],'total':len(images),'next':offset+60 if offset+60<len(images) else None},headers={'Cache-Control':'no-store'})

async def prompt_images(request):
    try:identity=str(uuid.UUID(request.match_info['id']))
    except ValueError:raise ValueError('提示词 ID 无效') from None
    images=await asyncio.to_thread(prompt_gallery.collect,list(JOBS),identity,media_path)
    return web.json_response({'prompt_id':identity,'images':images,'total':len(images)},headers={'Cache-Control':'no-store'})

def record_generation_usage(job):
    identity=job.get('library_prompt_id') or (job.get('library_prompt') or {}).get('id')
    if not identity:return
    try:mark_prompt_used(identity)
    except (OSError,ValueError):
        import logging
        logging.getLogger(__name__).exception('Could not record prompt usage for submitted generation')

async def prompt_cover_from_output(request):
    body=await request.json()
    result=await asyncio.to_thread(prompt_covers.copy_output,body,JOBS,storage_paths.path('output'))
    return web.json_response(result)

async def asset(request):return web.FileResponse(HERE/request.match_info['file'],headers={'Cache-Control':'no-cache'})
async def cancel_generation(request):
    pid=request.match_info['pid']
    job=next((j for j in JOBS if j['prompt_id']==pid),None)
    if not job:raise web.HTTPNotFound()
    if job['status'] not in ('queued','running'):return web.json_response({'cancelled':False})
    result=await backend(request.app,'/api/jobs/'+pid+'/cancel',{})
    if result.get('cancelled') and job['status'] in ('queued','running'):
        job.update(status='cancelled',finished=time.time());PROGRESS.pop(pid,None);PREVIEWS.pop(pid,None);save()
    return web.json_response(result)

async def config(request):return web.json_response({'token':TOKEN,'workflow_controls':app_settings.schema(),'presets':[{'id':p['id'],'label':p['label']} for p in PRESETS.values()]})

async def dashboard_summary(request):
    from dashboard import summarize
    def collect():
        jobs = list(JOBS)
        path = DATA/'prompt_library.json'
        prompts = json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
        images = prompt_gallery.collect(jobs, None, media_path, True)
        return summarize(jobs, images, prompts)
    result = await asyncio.to_thread(collect)
    try:
        await asyncio.wait_for(backend(request.app, '/queue'), timeout=3)
        result['online'] = True
    except Exception:
        result['online'] = False
    return web.json_response(result, headers={'Cache-Control':'no-store'})


async def hardware(request):
    from hardware_info import snapshot
    return web.json_response(await asyncio.to_thread(snapshot), headers={'Cache-Control':'no-store'})

async def open_model_folder(request):
    body=await request.json();base=(storage_paths.path('models')).resolve()
    path=(base/str(body.get('category',''))/str(body.get('name',''))).resolve()
    if not path.is_relative_to(base) or not path.is_file():raise ValueError('模型文件不存在')
    await asyncio.to_thread(reveal_file,path)
    return web.json_response({'opened':True})

def media_path(body):
    kind=body.get('type')
    if kind not in ['input','output']:raise ValueError('无效媒体类型')
    base=(storage_paths.path(kind)).resolve()
    path=(base/str(body.get('subfolder',''))/str(body.get('filename',''))).resolve()
    if not path.is_relative_to(base) or not path.is_file() or path.suffix.lower() not in ['.png','.jpg','.jpeg','.webp','.gif']:raise ValueError('媒体文件不存在或路径无效')
    return path

def recycle_media(path):
    import ctypes
    from ctypes import wintypes
    class Operation(ctypes.Structure):
        _fields_=[('hwnd',wintypes.HWND),('func',wintypes.UINT),('source',wintypes.LPCWSTR),('target',wintypes.LPCWSTR),('flags',wintypes.WORD),('aborted',wintypes.BOOL),('mapping',ctypes.c_void_p),('title',wintypes.LPCWSTR)]
    operation=Operation();operation.func=3;operation.source=str(path)+'\0\0';operation.flags=0x40|0x10|0x4|0x400
    code=ctypes.windll.shell32.SHFileOperationW(ctypes.byref(operation))
    if code or operation.aborted or path.exists():raise ValueError('移入回收站失败，文件已保留')

def queued_media_in_use(path, queue):
    def values(value):
        if isinstance(value,str):yield value
        elif isinstance(value,dict):
            for child in value.values():yield from values(child)
        elif isinstance(value,list):
            for child in value:yield from values(child)
    for item in queue.get('queue_running',[])+queue.get('queue_pending',[]):
        graph=item[2] if len(item)>2 else {}
        for node in graph.values():
            for value in values(node.get('inputs',{})):
                # ComfyUI filenames can include a directory and an annotated root.
                name=value.replace('\\','/');kind='input'
                for root_type in ('input','output','temp'):
                    suffix=' ['+root_type+']'
                    if name.endswith(suffix):name=name[:-len(suffix)];kind=root_type;break
                if (storage_paths.path(kind)/name).resolve()==path:return True
    return False

async def media_action(request):
    body=await request.json();path=media_path(body)
    if request.path.endswith('open-folder'):
        await asyncio.to_thread(reveal_file,path)
        return web.json_response({'opened':True})
    async with MEMORY_LOCK:
        q=await backend(request.app,'/queue')
        if queued_media_in_use(path,q):raise ValueError('这张图片正在被任务使用，请等该任务完成后再删除')
        await asyncio.to_thread(recycle_media,path)
        for job in JOBS:
            job['images']=[im for im in job['images'] if not (im.get('type')==body['type'] and im.get('filename')==body.get('filename') and im.get('subfolder','')==body.get('subfolder',''))]
        save()
    return web.json_response({'deleted':True})

async def status(request):
    online=True;queue=0;memory=None
    changed=False
    for job in list(JOBS):
        if job['status']!='success':continue
        existing=[]
        for image in job.get('images',[]):
            try:media_path(image)
            except ValueError:continue
            existing.append(image)
        if existing!=job.get('images',[]):job['images']=existing;changed=True
        if not existing:JOBS.remove(job);changed=True
    if changed:save()
    missing_inputs=[]
    for name in {name for job in JOBS for name in [job.get('image'),*[r.get('image') for r in job.get('references',[])]] if name}:
        try:input_path(name)
        except ValueError:missing_inputs.append(name)
    try:
        q=await backend(request.app,'/queue');queue=len(q['queue_running'])+len(q['queue_pending'])
        stats=await backend(request.app,'/system_stats')
        device=next((d for d in stats.get('devices',[]) if d.get('type')=='cuda'),None)
        if device:memory={'used_gb':round((device['vram_total']-device['vram_free'])/1024**3,1),'total_gb':round(device['vram_total']/1024**3,1),'released':RELEASED}
    except Exception:online=False
    return web.json_response({'online':online,'queue':queue,'memory':memory,'missing_inputs':missing_inputs,'jobs':[{**j,'progress':PROGRESS.get(j['prompt_id']),'preview_url':('/api/live-preview/'+j['prompt_id']+'?v='+str(PREVIEWS[j['prompt_id']][0])) if j['prompt_id'] in PREVIEWS and j['status'] in ('queued','running') else None} for j in reversed(JOBS[-100:])]})

async def release_models(app):
    global RELEASED
    async with MEMORY_LOCK:
        q=await backend(app,'/queue')
        if q['queue_running'] or q['queue_pending']:return False
        async with app['session'].post(BACKEND+'/free',json={'unload_models':True,'free_memory':True}) as response:
            if response.status!=200:raise ValueError('模型释放失败')
            await response.read()
        RELEASED=True
    return True

async def release(request):
    if not await release_models(request.app):return web.json_response({'error':'还有任务正在运行或排队，请完成后再释放'},status=409)
    return web.json_response({'released':True})

async def idle_memory(app):
    global LAST_ACTIVITY,RELEASED
    while True:
        try:
            q=await backend(app,'/queue')
            if q['queue_running'] or q['queue_pending']:
                LAST_ACTIVITY=time.monotonic();RELEASED=False
            elif MEMORY['idle_release_seconds'] and not RELEASED and time.monotonic()-LAST_ACTIVITY>=MEMORY['idle_release_seconds']:await release_models(app)
        except Exception:pass
        await asyncio.sleep(5)

async def upload(request):
    reader=await request.multipart();part=await reader.next()
    if not part or part.name!='image':raise ValueError('请选择图片')
    raw=await part.read()
    if len(raw)>30*1024*1024:raise ValueError('图片不能超过 30MB')
    with Image.open(io.BytesIO(raw)) as im:
        if im.width*im.height>25_000_000:raise ValueError('图片不能超过 2500 万像素，请先缩小')
        im.verify()
    # Normalize to a lossless local input, independent of the original filename.
    with Image.open(io.BytesIO(raw)) as im:
        from PIL import ImageOps
        im=ImageOps.exif_transpose(im);im=im.convert('RGBA' if 'A' in im.getbands() or 'transparency' in im.info else 'RGB');buf=io.BytesIO();im.save(buf,format='PNG')
    form=FormData();form.add_field('image',buf.getvalue(),filename='webui_'+uuid.uuid4().hex+'.png',content_type='image/png')
    form.add_field('subfolder','webui');form.add_field('type','input')
    async with request.app['session'].post(BACKEND+'/upload/image',data=form) as r:
        result=await r.json()
        if r.status!=200:raise ValueError('上传失败')
    name=result['subfolder']+'/'+result['name']
    remember_input(name,part.filename or result['name'])
    return web.json_response({'image':name,'url':'/image?'+urlencode({'filename':result['name'],'subfolder':result['subfolder'],'type':'input'})})

async def upload_mask(request):
    body=await request.json()
    name=await asyncio.to_thread(save_mask,body.get('image',''),body.get('mask',''))
    return web.json_response({'mask':name})

async def upload_annotation(request):
    body=await request.json()
    name=await asyncio.to_thread(save_annotation,body.get('image',''),body.get('annotation',''))
    return web.json_response({'image':name})

def reference_instruction(reference,index):
    roles={'identity':'人物身份和五官','clothing':'服装和配饰','scene':'场景背景','style':'画风、材质、色彩和光线','pose':'姿势和动作','composition':'构图与镜头角度','subject':'主体外观','custom':'用途说明指定的内容'}
    if not isinstance(reference,dict) or reference.get('role') not in roles:raise ValueError('请指定每张参考图的用途')
    description=reference.get('description','')
    if not isinstance(description,str) or len(description)>1000:raise ValueError('每张参考图用途说明最多 1000 字')
    if reference['role']=='custom' and not description.strip():raise ValueError('自由描述用途需要填写说明')
    return f" 图{index}（<image{index}>）：仅参考{roles[reference['role']]}。"+(description.strip()+'。' if description.strip() else '')

def combine_prompt_parts(body):
    if body.get('preset') not in ('01_text_to_image','02_character_consistency') or 'base_prompt' not in body:return
    base,extra=body['base_prompt'],body.get('prompt_supplement','')
    if not isinstance(base,str) or not isinstance(extra,str):raise ValueError('提示词内容无效')
    extra=extra.strip();combined=base+('\n\n'+extra if extra else '')
    if (not combined.strip() and body.get('generation_workflow')!=krea_i2i.WORKFLOW) or len(combined)>10000:raise ValueError('主提示词与补充内容合计最多 10000 字')
    row=body.get('library_prompt')
    if row is not None:
        if not isinstance(row,dict) or row.get('prompt')!=base or not isinstance(row.get('title'),str) or len(row['title'])>100:raise ValueError('已选提示词卡片无效')
        tags=row.get('tags',[])
        if not isinstance(tags,list) or len(tags)>20 or any(not isinstance(t,str) or len(t)>40 for t in tags):raise ValueError('提示词标签无效')
        if row.get('prompt_series') not in (None,'moody_krea2','qwen'):raise ValueError('提示词系列无效')
        if row.get('id'):
            uuid.UUID(row['id'])
            if type(row.get('revision')) is not int or row['revision']<1:raise ValueError('提示词版本无效')
            body.update(library_prompt_id=row['id'],library_prompt_revision=row['revision'])
        body['library_prompt']={k:row[k] for k in ('id','revision','title','prompt','tags','prompt_series') if k in row}
    body.update(prompt=combined,prompt_supplement=extra)

async def generate(request):
    global LAST_ACTIVITY,RELEASED
    body=request.get('krea_i2i_body') or await request.json();character_generation.route(body);preset=PRESETS[body['preset']]
    if 'krea_i2i_body' not in request:combine_prompt_parts(body)
    if body.get("character_card_id") and body["preset"] != "01_text_to_image" and not body.get("character_card_snapshot"):
        raise ValueError("人物卡请在文生图入口使用")
    if body['preset']=='03_image_edit':
        if body.get('edit_task')=='outpaint' and body.get('edit_model') not in ('qwen','ray'):raise ValueError('扩图仅支持 Qwen 或 Ray Qwen，请刷新页面')
        if body.get('edit_model') not in ('qwen','ray'):return await generate_krea_edit(request,body)
        task=body.get('edit_task')
        if task not in ('general','dual','local','outpaint','face','head','body'):raise ValueError('未知 Qwen 编辑模式')
        if any(body.get(k) for k in ('annotation','transparent','anti_shift','t8_acceleration')):raise ValueError('当前 Qwen 编辑不与颜色标注、透明背景或加速扩展组合')
        body.update(quality='pro',crop_edit=False)
        if task=='outpaint':
            if body.get('local_edit'):raise ValueError('扩图不使用局部选区')
            body.update(frame='outpaint',local_content='preserve')
            if not str(body.get('prompt','')).strip():body['prompt']='Extend the existing scene naturally.'
        elif task=='local':
            body.update(frame='original',local_edit=True)
            if body.get('references'):raise ValueError('局部重绘仅使用原图和选区')
        else:
            refs=body.get('references',[])
            if not isinstance(refs,list) or len(refs)!=(0 if task=='general' else 1):raise ValueError('单图编辑仅使用原图；双图及人物替换需要恰好一张额外参考图')
            if task in ('general','dual') and body.get('local_edit'):raise ValueError('请通过局部重绘入口使用选区')
            body.update(frame='original',local_content='preserve')
            if task in ('face','head','body') and not str(body.get('prompt','')).strip():body['prompt']='Match the lighting and preserve the target scene.'

    camera_presets.apply(body)
    generation_loras_v2=await asyncio.to_thread(lora_v2.prepare,body) if 'lora_v2' in body else None
    generation_loras=None
    if body['preset']=='02_character_consistency' and body.get('i2i_workflow')=='moody_zit_i2i':
        if body.get('references'):raise ValueError('参考图重绘仅支持一张参考图')
        body['generation_model']='pro_mix'
        return await generate_krea(request,body,generation_loras_v2)
    if body['preset']=='01_text_to_image':return await generate_krea(request,body,generation_loras_v2)
    if body['preset']=='02_character_consistency' and GENERATION_LORAS_ENABLED:
        generation_loras=await asyncio.to_thread(lora_manager.prepare,body,'qwen')
    if body['preset']=='03_image_edit':
        edit_model=body.get('edit_model','qwen')
        if edit_model not in ('qwen','ray'):raise ValueError('未知编辑模型，请刷新页面后重试')
    if body['preset']=='04_upscale':return await generate_seedvr2(request,body)
    g=json.loads((storage_paths.path('workflows')/'presets'/preset['api_file']).read_text(encoding='utf-8'))
    if body['preset']=='03_image_edit' and edit_model=='ray':
        model_file='rayQwen21_v1Int8Convrot.safetensors'
        if not (storage_paths.path('models')/'diffusion_models'/model_file).is_file():raise ValueError('Ray Qwen 2.1 模型未安装')
        g['1']['inputs']['unet_name']=model_file
        g['7']['inputs'].update(sampler_name='euler_ancestral',scheduler='simple',cfg=2.0)
    edit_task=body.get('edit_task','general') if body['preset']=='03_image_edit' else 'general'
    if edit_task not in ('general','watermark','face','head','body','local','cutout','style','fusion','outpaint','dual'):raise ValueError('未知图片编辑模式，请刷新页面后重试')
    # Task semantics are authoritative, even for stale UI state or API clients.
    # "Local" must never silently fall through to whole-image generation.
    if edit_task=='local':
        if body.get('frame','original')!='original' or body.get('annotation') or body.get('transparent'):raise ValueError('局部修改请使用原画幅和涂抹选区，不与扩图、颜色标注或透明背景组合')
        if not body.get('mask'):raise ValueError('请先涂抹需要修改的区域')
        body['local_edit']=True
    functional_lora=None
    if body['preset']=='03_image_edit' and (edit_task=='fusion' or body.get('frame')=='outpaint'):
        if edit_task=='fusion':
            if body.get('frame','original')!='original' or body.get('local_edit') or body.get('transparent') or body.get('annotation'):raise ValueError('图像融合请上传已摆放好对象的合成图，使用直接编辑')
            functional_lora='Qwen21-图像融合Fusion_2000.safetensors'
        else:
            if edit_task in ('face','head','body','watermark','cutout'):raise ValueError('扩图不能同时使用其他专用编辑模式')
            functional_lora='Qwen21-图像扩展qwen-image-2.1-outpaint-v2.safetensors'
        if body.get('references'):raise ValueError('扩图和图像融合仅使用一张主图，请移除额外参考图')
        if not (storage_paths.path('models')/'loras'/functional_lora).is_file():raise ValueError('对应功能 LoRA 尚未安装')
        g['50']={'class_type':'LoraLoaderModelOnly','inputs':{'model':['1',0],'lora_name':functional_lora,'strength_model':1.0}}
        g['6']['inputs']['model']=['50',0]
    swaps={'face':'Qwen21-换头bfs_head_v1.1_qwen_2.1.safetensors','head':'Qwen21-换头bfs_head_v1.1_qwen_2.1.safetensors','body':'Qwen21-换身bfs_body_swap_v1.0_qwen_2.1.safetensors'}
    if edit_task in ('face','head','body'):
        refs=body.get('references',[])
        if not isinstance(refs,list) or len(refs)!=1 or not isinstance(refs[0],dict):raise ValueError('请上传要修改的原图（图1）和一张参考人物图（图2）')
        if edit_task=='face':refs[0]['role']='identity'
    if edit_task=='face':
        if body.get('transparent') or body.get('annotation') or body.get('frame','original')!='original':raise ValueError('换脸请使用面部选区，不与颜色标注、透明背景或扩图组合')
        if not body.get('mask'):raise ValueError('请先涂抹原图的面部五官区域，避开头发，再进行换脸')
        body['local_edit']=True
    if edit_task in swaps:
        refs=body.get('references',[])
        if not isinstance(refs,list) or len(refs)!=1:raise ValueError('换头或换身需要恰好一张参考图（图2）')
        if body.get('transparent') or body.get('annotation') or body.get('frame','original')!='original':raise ValueError('人物替换请使用原画幅，不与扩图、透明背景或颜色标注组合')
        if body.get('local_edit') and not body.get('mask'):raise ValueError('请先涂抹需要替换的区域')
        if not (storage_paths.path('models')/'loras'/swaps[edit_task]).is_file():raise ValueError('对应换头或换身 LoRA 尚未安装')
        g['50']={'class_type':'LoraLoaderModelOnly','inputs':{'model':['1',0],'lora_name':swaps[edit_task],'strength_model':1.0}}
        g['6']['inputs']['model']=['50',0]
    if edit_task=='watermark':
        watermark_lora='Qwen21-水印移除watermark_remover_v2.safetensors'
        if body.get('transparent') or body.get('annotation') or body.get('frame','original')!='original':raise ValueError('去水印请使用原画幅，不与透明背景、颜色标注或扩图组合')
        if body.get('references'):raise ValueError('去水印只需要原图，请移除额外参考图')
        if not (storage_paths.path('models')/'loras'/watermark_lora).is_file():raise ValueError('水印移除 LoRA 尚未安装')
        g['50']={'class_type':'LoraLoaderModelOnly','inputs':{'model':['1',0],'lora_name':watermark_lora,'strength_model':1.0}}
        g['6']['inputs']['model']=['50',0]
    quality=body.get('quality','pro')
    if quality not in ['lite','pro','pro_plus']:raise ValueError('无效生成档位')
    if quality=='lite' and body['preset'] not in ['01_text_to_image','04_upscale']:raise ValueError('Lite 暂仅支持文字生图，请选择 Pro 或 Pro+')
    fields=preset['fields']
    steps=None
    if body['preset']!='04_upscale':
        default_steps={'lite':6,'pro':25 if body['preset']=='03_image_edit' and edit_model=='ray' else 30,'pro_plus':40}[quality]
        if quality=='lite':
            g=json.loads((storage_paths.path('workflows')/'qwen21_turbo_6step_api.json').read_text(encoding='utf-8'))
            fields={**fields,'seed':{'node':'12','input':'noise_seed'}}
        defaults={'steps':default_steps,'cfg':2.0 if body['preset']=='03_image_edit' and edit_model=='ray' else 1.0,'sampler_name':'euler_ancestral' if body['preset']=='03_image_edit' and edit_model=='ray' else 'euler','scheduler':'simple'}
        steps,cfg,sampler_name,scheduler=sampling_settings(body,defaults)
        g['7']['inputs'].update(steps=steps,cfg=cfg,sampler_name=sampler_name,scheduler=scheduler)
    def setfield(name,value):
        f=fields[name];g[f['node']]['inputs'][f['input']]=value
    if 'image' in fields:
        image=body.get('image','')
        input_path(image)
        setfield('image',image)
    frame=body.get('frame','original');crop_box=None;composite_source=body.get('image');generation_mask=body.get('mask');frame_info=None
    transparent=bool(body.get('transparent'))
    hires_local=body['preset']=='03_image_edit' and bool(body.get('local_edit')) and edit_task!='face' and frame=='original'
    local_content=body.get('local_content','preserve')
    local_resolution=body.get('local_resolution',768)
    if body['preset']=='03_image_edit':
        if local_content not in ('preserve','rebuild'):raise ValueError('无效的选区处理方式')
        if type(local_resolution) is not int or local_resolution not in (512,768,1024):raise ValueError('局部处理尺寸须为 512、768 或 1024')
        if local_content=='rebuild' and (not hires_local or edit_task in swaps):raise ValueError('重建选区仅适用于普通精确局部编辑')
    if body['preset']=='03_image_edit':
        if frame not in ['original','outpaint']:raise ValueError('无效画幅模式')
        if transparent and (body.get('local_edit') or frame=='outpaint'):raise ValueError('透明背景请使用直接编辑，不与严格选区或扩图组合')
        if frame=='outpaint':
            if body.get('annotation'):raise ValueError('扩图暂不与颜色标注组合')
            image,generation_mask,frame_info=await asyncio.to_thread(outpaint_reference,image,body.get('frame_ratio','16:9'))
            composite_source=image;body['local_edit']=True;setfield('image',image)
        elif hires_local:
            with Image.open(input_path(image)) as source,Image.open(input_path(generation_mask)) as mask:
                if mask.size!=source.size or mask.convert('L').getbbox() is None:raise ValueError('选区为空或与原图尺寸不符，请重新涂抹')
                crop_blend=local_blend_pixels(mask,local_resolution)
        elif edit_task=='face':
            with Image.open(input_path(image)) as source,Image.open(input_path(generation_mask)) as mask:
                if mask.size!=source.size or mask.convert('L').getbbox() is None:raise ValueError('面部选区为空或与原图尺寸不符，请重新涂抹')
            # A tiny face inside a full-body image must not be encoded at ~80px.
            # Generate a clean, enlarged head-context crop and constrain sampling
            # as well as final pasteback; otherwise the model may zoom/reframe.
            image,generation_mask,crop_box=await asyncio.to_thread(local_crop,image,generation_mask)
    prompt=(generation_loras['final_prompt'] if generation_loras else str(body.get('prompt',''))).strip()
    if body.get('character_card_snapshot'):
        prompt=character_prompt.compose(prompt,body['character_card_snapshot'])
    if edit_task=='fusion' and not prompt.startswith('Blend '):prompt='Blend the inserted object into the image seamlessly. '+prompt
    if edit_task=='watermark' and not prompt.startswith('Remove the watermarks'):prompt='Remove the watermarks. '+prompt
    if edit_task in ('face','head','body'):
        swap_instructions={
            'face':'head_swap: Edit <image1> only. This is a cropped close-up: keep its exact framing, scale, face position and head angle. Replace only its facial features using the identity from <image2>. Keep the hairstyle, expression, lighting and visible surroundings of <image1>. Do not zoom out, add body parts, or copy the composition or background of <image2>.',
            'head':'head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the hair, eye color, nose structure from <image2>. copy the direction of the eye, head rotation, micro expressions from <image1>, high quality, sharp details, 4k',
            'body':'body_swap: start with <image1> as the base image, keeping its lighting, environment, and background. replace the body from <image1> with the body from <image2>, strictly preserving the clothing, body shape and proportions from <image2>. copy the pose, direction of the eye, head rotation, micro expressions from <image1>'
        }
        prompt=swap_instructions[edit_task]+'\nAdditional requirements: '+prompt
    if 'prompt' in fields:
        if not prompt or len(prompt)>10000:raise ValueError('请输入提示词（最多 10000 字）')
        if body['preset']=='02_character_consistency':
            primary=body.get('primary_reference',{'image':image,'role':'identity'})
            if not isinstance(primary,dict) or primary.get('image')!=image:raise ValueError('图1参考图片不匹配')
            prompt='根据参考图生成新的画面。各图只提供其指定用途的视觉参考，不自动保留图1的背景、服装、构图或动作。最终画面要求：'+prompt+'。'+reference_instruction(primary,1)
        if body['preset']=='03_image_edit' and transparent:prompt+=' 输出具有真实 alpha 通道的透明背景 PNG，仅保留主体，背景完全透明，不要白底或棋盘格。'
        if body['preset']=='03_image_edit' and frame=='outpaint':prompt='Outpaint the image: replace the solid gray areas with a seamless continuation of the scene, keeping the existing picture unchanged. '+prompt
        if body['preset']=='03_image_edit' and body.get('local_edit'):
            mask_name=generation_mask;input_path(mask_name)
            if not Path(mask_name).name.startswith('edit_mask_'):raise ValueError('请先绘制有效选区')
            feather=float(body.get('feather',8))
            if not 0<=feather<=32:raise ValueError('羽化范围须为 0～32 像素')
            if edit_task!='face' and not hires_local and frame!='outpaint':
                hint=body['image'] if frame=='outpaint' else await asyncio.to_thread(mask_reference,image,mask_name)
                g['20']={'class_type':'LoadImage','inputs':{'image':hint}}
                g['4']['inputs']['images.image_2']=['20',0]
                prompt=('图1是扩展后的画布，白色边缘是待生成区域；图2是原始内容，仅用于参考主体和背景。根据原图实际场景自然延展画布边缘，保持透视、光线、材质与边界连续，不要纯色填充，不要改变中间原始内容。修改要求：' if frame=='outpaint' else '编辑图1：图2的红色涂层仅用于标记编辑位置，实际输出不要红色涂层。只修改标记区域，保留原图主体的位置、姿态和构图。修改要求：')+prompt
        if body['preset']=='03_image_edit' and body.get('annotation'):
            if body.get('local_edit'):raise ValueError('颜色标注与严格遮罩请选择一种')
            annotation=body['annotation'];input_path(annotation)
            if body.get('annotation_base'):input_path(body['annotation_base'])
            if not Path(annotation).name.startswith('annotation_'):raise ValueError('标注图无效')
            instructions=str(body.get('annotation_instructions','')).strip()
            if not instructions or len(instructions)>2000:raise ValueError('请填写颜色标注要求，最多 2000 字')
            g['20']={'class_type':'LoadImage','inputs':{'image':annotation}}
            g['4']['inputs']['images.image_2']=['20',0]
            prompt+=' 图1是干净原图，图2仅使用彩色线条定位修改位置。输出不得包含彩色线条。颜色标注要求：'+instructions
        references=body.get('references',[])
        if not isinstance(references,list) or len(references)>(2 if body['preset']=='02_character_consistency' else 3):raise ValueError('图生图最多 3 张参考图（含图1）')
        roles={'identity':'仅参考人物身份和五官，不参考服装或背景','clothing':'仅参考服装和配饰，不替换主图人物身份或背景','scene':'仅参考场景背景，不替换主图人物身份或服装','style':'仅参考画风、材质、色彩和光线','pose':'仅参考姿势和动作','composition':'仅参考构图与镜头角度','subject':'仅参考主体外观','custom':'按用途说明参考'}
        next_index=3 if '20' in g else 2
        for offset,reference in enumerate(references):
            if not isinstance(reference,dict) or reference.get('role') not in roles:raise ValueError('请指定参考图用途')
            ref_name=reference.get('image','');input_path(ref_name)
            if reference.get('crop_rect') is not None:
                if edit_task not in ('face','head'):raise ValueError('参考头部框选仅用于换脸或换头；人物替换请使用完整全身参考图')
                ref_name=await asyncio.to_thread(crop_reference,ref_name,reference['crop_rect'])
            node=str(30+offset);g[node]={'class_type':'LoadImage','inputs':{'image':await asyncio.to_thread(prepare_reference,ref_name,768 if edit_task=='body' else 512)}}
            g['4']['inputs'][f'images.image_{next_index+offset}']=[node,0]
            if edit_task not in ('face','head','body'):
                prompt+='\n'+character_prompt.reference(reference,next_index+offset,True) if body.get('character_card_snapshot') else reference_instruction(reference,next_index+offset)
        setfield('prompt',prompt)
    seed=body.get('seed','')
    seed=secrets.randbelow(2**53) if seed in ['',None] else int(seed)
    if not 0<=seed<2**53:raise ValueError('种子须为 0～9007199254740991 的整数')
    if 'seed' in fields:setfield('seed',seed)
    if 'width' in fields:
        sizes={'3:4':(576,768),'4:3':(768,576),'1:1':(704,704),'9:16':(512,896),'16:9':(896,512),'2:3':(512, 768),'3:2':(768, 512),'9:21':(384, 896),'21:9':(896, 384)}
        width,height=sizes[body.get('ratio','3:4')];setfield('width',width);setfield('height',height)
    if body['preset']=='02_character_consistency':
        ratio=body.get('ratio','3:4');resolution=body.get('image_resolution','medium')
        sizes={'low':{'3:4':(576,768),'4:3':(768,576),'1:1':(768,768),'9:16':(576,1024),'16:9':(1024,576),'2:3':(512, 768),'3:2':(768, 512),'9:21':(384, 896),'21:9':(896, 384)},'medium':{'3:4':(768,1024),'4:3':(1024,768),'1:1':(1024,1024),'9:16':(720,1280),'16:9':(1280,720),'2:3':(768, 1152),'3:2':(1152, 768),'9:21':(480, 1120),'21:9':(1120, 480)},'high':{'3:4':(1152,1536),'4:3':(1536,1152),'1:1':(1536,1536),'9:16':(864,1536),'16:9':(1536,864),'2:3':(1024, 1536),'3:2':(1536, 1024),'9:21':(672, 1568),'21:9':(1568, 672)}}
        if resolution not in sizes or ratio not in sizes[resolution]:raise ValueError('无效的图片形状或图像质量')
        width,height=sizes[resolution][ratio]
        g['5']={'class_type':'EmptyLatentImage','inputs':{'width':width,'height':height,'batch_size':1}}
        g['7']['inputs']['latent_image']=['5',0]
    upscale_model=body.get('upscale_model','realesrgan')
    if 'post_scale' in fields:
        models={'realesrgan':'RealESRGAN_x4plus.pth','hat':'Real_HAT_GAN_SRx4.pth'}
        if upscale_model not in models:raise ValueError('无效放大模型')
        g['2']['inputs']['model_name']=models[upscale_model]
        setfield('post_scale',fields['post_scale']['values'][body.get('scale','2x')])
    memory_mode=body.get('memory_mode','balanced')
    if memory_mode not in ['balanced','cpu']:raise ValueError('无效显存策略')
    if body['preset']!='04_upscale':
        g['8']={'class_type':'VAEDecodeTiled','inputs':{'samples':['15' if quality=='lite' else '7',0],'vae':['3',0],'tile_size':MEMORY['vae_tile_size'],'overlap':MEMORY['vae_overlap'],'temporal_size':64,'temporal_overlap':8}}
        if memory_mode=='cpu':g['2']['inputs']['device']='cpu'
        if 'image' in fields:
            # The first reference sets the output geometry; other references get smaller independent budgets.
            setfield('image',image if hires_local or crop_box else await asyncio.to_thread(prepare_reference,image,1440 if edit_task=='body' else MEMORY['reference_resolution']))
            if '20' in g:
                budget=1024 if crop_box else MEMORY['identity_resolution'] if body['preset']=='02_character_consistency' else MEMORY['region_hint_resolution']
                g['20']['inputs']['image']=await asyncio.to_thread(prepare_reference,g['20']['inputs']['image'],budget)
            # LoadImage separates alpha as an inverted mask; rejoin it for RGBA references.
            for node,entry in list(g.items()):
                if entry.get('class_type')!='LoadImage':continue
                with Image.open(input_path(entry['inputs']['image'])) as ref:
                    has_alpha='A' in ref.getbands()
                if has_alpha:
                    joined=str(100+int(node));g[joined]={'class_type':'JoinImageWithAlpha','inputs':{'image':[node,0],'alpha':[node,1]}}
                    for key,value in list(g['4']['inputs'].items()):
                        if key.startswith('images.') and value==[node,0]:g['4']['inputs'][key]=[joined,0]
                    if node=='10' and '22' in g:g['22']['inputs']['pixels']=[joined,0]
            g['4']['inputs']['resolution']=0
            if body['preset']=='03_image_edit' and body.get('local_edit') and frame!='outpaint':
                g['21']={'class_type':'LoadImageMask','inputs':{'image':mask_name,'channel':'red'}}
                g['22']={'class_type':'VAEEncode','inputs':{'pixels':['110' if '110' in g else '10',0],'vae':['3',0]}}
                g['23']={'class_type':'SetLatentNoiseMask','inputs':{'samples':['22',0],'mask':['21',0]}}
                g['7']['inputs']['latent_image']=['23',0]
            if hires_local:
                g['24']={'class_type':'InpaintCropImproved','inputs':{
                    'image':['10',0],'mask':['21',0],
                    'downscale_algorithm':'bilinear','upscale_algorithm':'bicubic',
                    'preresize':False,'preresize_mode':'ensure minimum resolution',
                    'preresize_min_width':1024,'preresize_min_height':1024,
                    'preresize_max_width':16384,'preresize_max_height':16384,
                    'mask_fill_holes':True,'mask_expand_pixels':50,'mask_invert':False,
                    'mask_blend_pixels':crop_blend,'mask_hipass_filter':0.1,
                    'extend_for_outpainting':False,'extend_up_factor':1.0,'extend_down_factor':1.0,
                    'extend_left_factor':1.0,'extend_right_factor':1.0,
                    'context_from_mask_extend_factor':1.2,'output_resize_to_target_size':True,
                    'output_target_width':local_resolution,'output_target_height':local_resolution,
                    'output_padding':'32','device_mode':'cpu (compatible)'}}
                g['4']['inputs']['images.image_1']=['24',1]
                g['22']['inputs']['pixels']=['24',1]
                g['23']['inputs']['mask']=['24',2]
                if local_content=='rebuild':
                    # Hide old content from visual conditioning only. Keep the clean
                    # source latent: soft noise-mask edges otherwise retain blue fill.
                    # Keep crop/stitch metadata and the final user mask unchanged.
                    # Hide only the user's selection, not the expanded generation
                    # mask. Surrounding pixels are needed to match the background.
                    g['26']={'class_type':'DrawMaskOnImage','inputs':{'image':['10',0],'mask':['21',0],'color':'0, 0, 255','device':'cpu'}}
                    g['27']={'class_type':'InpaintCropImproved','inputs':{**g['24']['inputs'],'image':['26',0]}}
                    g['4']['inputs']['images.image_1']=['27',1]
                    g['4']['inputs']['prompt']='Reconstruct the blue-covered area according to the following instructions. The blue fill is a placeholder, not an object or desired output color. Preserve the surrounding scene. '+g['4']['inputs']['prompt']
                g['25']={'class_type':'InpaintStitchImproved','inputs':{'stitcher':['24',0],'inpainted_image':['8',0]}}
                g['9']['inputs']['images']=['25',0]
    anti_shift=body.get('anti_shift') is True and body['preset']=='03_image_edit'
    if anti_shift:
        consistency_lora='Qwen21-无位移一致性consistency.safetensors'
        if not (storage_paths.path('models')/'loras'/consistency_lora).is_file():raise ValueError('抗位移一致性 LoRA 尚未安装')
        g['51']={'class_type':'LoraLoaderModelOnly','inputs':{'model':g['6']['inputs']['model'],'lora_name':consistency_lora,'strength_model':1.0}}
        g['6']['inputs']['model']=['51',0]
    if body.get('t8_acceleration') and body['preset'] in ['02_character_consistency','03_image_edit']:
        g['40']={'class_type':'QwenImage21BlockCacheT8','inputs':{'model':['6',0],'residual_diff_threshold':0.03,'start_percent':0.1,'end_percent':0.85,'max_consecutive_hits':2,'cache_device':'cpu','metric_stride':8,'max_cache_mb':512}}
        g['7']['inputs']['model']=['40',0]
    if generation_loras:lora_manager.apply(g,generation_loras['snapshots'])
    set_output_folder(g,body['preset'])
    async with MEMORY_LOCK:
        result=await backend(request.app,'/prompt',{'prompt':g,'client_id':CLIENT})
        LAST_ACTIVITY=time.monotonic();RELEASED=False
    job={'prompt_id':result['prompt_id'],'preset':body['preset'],'label':preset['label'],'prompt':str(body.get('prompt','')),'seed':seed,'ratio':body.get('ratio'),'scale':body.get('scale'),'image':body.get('image'),'status':'queued','created':time.time(),'images':[]}
    if body['preset']!='04_upscale':job.update(steps=steps,cfg=cfg,sampler_name=sampler_name,scheduler=scheduler)
    if body['preset']=='02_character_consistency':job.update(primary_reference=body.get('primary_reference',{'image':image,'role':'identity'}),image_resolution=resolution,width=width,height=height,generation_model='qwen',loras=generation_loras['snapshots'] if generation_loras else [],lora_config=generation_loras['items'] if generation_loras else [],lora_warnings=generation_loras['warnings'] if generation_loras else [],final_prompt=g['4']['inputs']['prompt'])
    job['t8_acceleration']=bool(body.get('t8_acceleration'))
    job['anti_shift']=anti_shift
    job['hires_local']=hires_local
    if body['preset']=='03_image_edit':
        job['edit_diagnostics']={'route':'hires_local' if hires_local else 'outpaint' if frame=='outpaint' else 'face_crop' if edit_task=='face' else edit_task,
            'model':g['1']['inputs'].get('unet_name'),'functional_lora':g.get('50',{}).get('inputs',{}).get('lora_name'),
            'experimental':edit_task=='face','local_content':local_content if hires_local else None,
            'crop_blend_pixels':crop_blend if hires_local else None,
            'local_resolution':local_resolution if hires_local else None,'strict_composite':bool(body.get('local_edit'))}
        job.update(local_content=local_content if hires_local else 'preserve',local_resolution=local_resolution)
    job.update(frame=frame,frame_ratio=body.get('frame_ratio','16:9'),frame_info=frame_info,transparent=transparent,crop_edit=bool(crop_box),crop_box=crop_box,composite_source=composite_source,composite_mask=body.get('mask') if crop_box else generation_mask)
    job.update(traits=body.get('traits',''),preserve=body.get('preserve','hair'),identity_rect=body.get('identity_rect'),local_edit=bool(body.get('local_edit')) if body['preset']=='03_image_edit' else False,mask=body.get('mask'),feather=body.get('feather',8))
    if body['preset']=='04_upscale':job['upscale_model']=upscale_model
    job.update(annotation_base=body.get('annotation_base'),annotation=body.get('annotation'),annotation_strokes=body.get('annotation_strokes',[]),annotation_instructions=body.get('annotation_instructions',''))
    job['references']=body.get('references',[]) if body['preset'] in ['02_character_consistency','03_image_edit'] else []
    job['original_prompt']=str(body.get('original_prompt',body.get('prompt','')))
    if body['preset']=='03_image_edit':
        model_label='Ray Qwen 2.1' if edit_model=='ray' else 'Qwen 2.1'
        job.update(edit_model=edit_model,generation_model=edit_model,edit_task=edit_task,label='图片编辑 · '+model_label,final_prompt=g['4']['inputs']['prompt'])
        if functional_lora:job.update(lora=functional_lora,label='图片编辑 · '+model_label+' · '+('图像融合' if edit_task=='fusion' else '扩图'))
        if edit_task in swaps:job.update(label='图片编辑 · '+model_label+' · '+{'face':'BFS 局部换脸 · 实验','head':'换头','body':'人物替换'}[edit_task],lora=swaps[edit_task])
        if edit_task=='watermark':job.update(label='图片编辑 · '+model_label+' · 去水印',lora=watermark_lora)
    if body.get('character_card_snapshot'):
        job.update(character_card_id=body['character_card_id'],character_card_snapshot=body['character_card_snapshot'],generation_references=body.get('requested_generation_references',[]))
    job['memory_mode']=memory_mode
    if steps is not None:job.update(quality=quality,steps=steps)
    job.update({k:body[k] for k in ('base_prompt','prompt_supplement','library_prompt','library_prompt_id','library_prompt_revision','camera_preset','camera_original_prompt','camera_prompt') if k in body})
    JOBS.append(job);save();record_generation_usage(job);return web.json_response(job)

async def generate_krea_edit(request,body):
    global LAST_ACTIVITY,RELEASED
    graph,meta=await asyncio.to_thread(krea_edit.build,body,sampling_settings)
    set_output_folder(graph,'03_image_edit')
    async with MEMORY_LOCK:
        result=await backend(request.app,'/prompt',{'prompt':graph,'client_id':CLIENT})
        LAST_ACTIVITY=time.monotonic();RELEASED=False
    job=dict(meta,prompt_id=result['prompt_id'],preset='03_image_edit',status='queued',created=time.time(),images=[])
    JOBS.append(job);save();record_generation_usage(job);return web.json_response(job)

async def generate_seedvr2(request,body):
    global LAST_ACTIVITY,RELEASED
    image=body.get('image','');path=input_path(image)
    scale=body.get('scale','2x')
    if scale not in ['2x','4x']:raise ValueError('无效放大倍率')
    factor=int(scale[0])
    with Image.open(path) as im:width,height=im.size
    graph=json.loads((storage_paths.path('workflows')/'seedvr2_3b_upscale_api.json').read_text(encoding='utf-8'))
    for model in ['seedvr2_ema_3b_fp8_e4m3fn.safetensors','ema_vae_fp16.safetensors']:
        if not (storage_paths.path('models')/'SEEDVR2'/model).is_file():raise ValueError('SeedVR2 尚未安装完整，请在模型库下载模型和解码组件')
    graph['1']['inputs']['image']=image
    graph['4']['inputs']['resolution']=min(width,height)*factor
    async with MEMORY_LOCK:
        async with request.app['session'].post(BACKEND+'/free',json={'unload_models':True,'free_memory':True}) as response:
            if response.status>=400:raise ValueError('释放显存失败，请稍后重试')
        set_output_folder(graph,'04_upscale')
        result=await backend(request.app,'/prompt',{'prompt':graph,'client_id':CLIENT})
        LAST_ACTIVITY=time.monotonic();RELEASED=False
    job={'prompt_id':result['prompt_id'],'preset':'04_upscale','label':'高清放大 · SeedVR2 3B','upscale_model':'seedvr2','prompt':'','seed':42,'scale':scale,'width':width*factor,'height':height*factor,'image':image,'status':'queued','created':time.time(),'images':[],'memory_mode':'cpu'}
    job.update({k:body[k] for k in ('base_prompt','prompt_supplement','library_prompt','library_prompt_id','library_prompt_revision','camera_preset','camera_original_prompt','camera_prompt') if k in body})
    JOBS.append(job);save();record_generation_usage(job);return web.json_response(job)

async def generate_krea(request,body,generation_loras_v2=None):
    global LAST_ACTIVITY,RELEASED
    workflow_settings=workflow_controls.resolve(body)
    redraw=body.get('preset')=='02_character_consistency' and body.get('i2i_workflow')=='moody_zit_i2i'
    variants={'cutie':'krea2_cutie','mix_v8':'krea2_mix_v8','pro_mix':'zimage_pro_mix','qwen':'presets/01_text_to_image','ray':'presets/01_text_to_image'}
    variant=body.get('generation_model','cutie')
    if variant not in variants:raise ValueError('请选择有效的生图模型')
    generation_loras=await asyncio.to_thread(lora_manager.prepare,body,variant) if GENERATION_LORAS_ENABLED else None
    model_defaults=workflow_controls.SCHEMA['models'][variant]
    defaults=dict(steps=model_defaults['steps'],cfg=model_defaults['cfg'],sampler_name=model_defaults['sampler'],scheduler=model_defaults['scheduler'])
    steps,cfg,sampler_name,scheduler=sampling_settings(body,defaults)
    rain_city=body.get('generation_workflow')=='moody_krea2_rain_city'
    if rain_city and variant!='cutie':raise ValueError('雨城飞鸟工作流当前使用 Cutie 主模型')
    path=storage_paths.path('workflows')/(variants[variant]+'_api.json')
    if rain_city:path=storage_paths.path('workflows')/'rain_city_cutie_api.json'
    if not path.exists():raise ValueError('Krea2 配置尚未完成，请稍后重试')
    if variant=='pro_mix':
        required=[storage_paths.path('models')/'diffusion_models/moodyProMix_collectorsEdition_fp8.safetensors',storage_paths.path('models')/'text_encoders/qwen_3_4b.safetensors',storage_paths.path('models')/'vae/ae.safetensors']
        if any(not item.is_file() for item in required):raise ValueError('Moody Pro Mix 配套模型不完整，请在模型库检查主模型、Qwen 3 文本编码器和 AE 解码组件')
    graph=json.loads(path.read_text(encoding='utf-8'))
    prompt=(generation_loras_v2['final_prompt'] if generation_loras_v2 else generation_loras['final_prompt'] if generation_loras else str(body.get('prompt',''))).strip()
    if not prompt or len(prompt)>10000:raise ValueError('请输入画面描述（最多 10000 字）')
    ratio=body.get('ratio','3:4')
    resolution=body.get('image_resolution','medium')
    tiers={'low':{'3:4':(576,768),'4:3':(768,576),'1:1':(768,768),'9:16':(576,1024),'16:9':(1024,576),'2:3':(512, 768),'3:2':(768, 512),'9:21':(384, 896),'21:9':(896, 384)},'medium':{'3:4':(768,1024),'4:3':(1024,768),'1:1':(1024,1024),'9:16':(720,1280),'16:9':(1280,720),'2:3':(768, 1152),'3:2':(1152, 768),'9:21':(480, 1120),'21:9':(1120, 480)},'high':{'3:4':(1152,1536),'4:3':(1536,1152),'1:1':(1536,1536),'9:16':(864,1536),'16:9':(1536,864),'2:3':(1024, 1536),'3:2':(1536, 1024),'9:21':(672, 1568),'21:9':(1568, 672)}}
    if resolution not in tiers:raise ValueError('无效图像质量')
    sizes=tiers[resolution]
    if ratio not in sizes:raise ValueError('无效图片比例')
    raw_seed=body.get('seed','');seed=int(raw_seed) if str(raw_seed).strip() else secrets.randbelow(2**32)
    if not 0<=seed<2**64:raise ValueError('种子超出范围')
    generation_workflow=str(body.get('generation_workflow','moody_krea2_simple'))
    if variant in ('cutie','mix_v8') and generation_workflow not in ('moody_krea2_simple','moody_krea2_rain_city','moody_krea2_4khd',krea_i2i.WORKFLOW):raise ValueError('请选择有效的 Krea2 工作流')
    simple_mode=str(body.get('krea_simple_mode',model_defaults.get('simple_mode','standard')))
    if simple_mode not in ('standard','refine','upscale'):raise ValueError('请选择有效的 Krea2 处理方式')
    if variant not in ('cutie','mix_v8') or generation_workflow in ('moody_krea2_4khd',krea_i2i.WORKFLOW):simple_mode='standard'
    if rain_city:simple_mode='standard'
    refine_scale=float(body.get('refine_scale',1.5)) if simple_mode!='standard' else 1.5
    refine_strength=float(body.get('refine_strength',0.39 if variant=='mix_v8' else 0.33)) if simple_mode!='standard' else model_defaults.get('refine_strength',0.33)
    if not 1.0<=refine_scale<=2.0:raise ValueError('细化倍率需要在 1.0 到 2.0 之间')
    if not 0.1<=refine_strength<=0.7:raise ValueError('细化强度需要在 0.1 到 0.7 之间')
    graph['4']['inputs']['prompt' if variant in ('qwen','ray') else 'text']=prompt
    if variant=='pro_mix':
        graph['7']['inputs']['noise_seed']=seed;graph['12']['inputs']['noise_seed']=seed
        graph['11']['inputs']['scale_by']=workflow_settings['zit_scale']
    else:graph['7']['inputs']['seed']=seed
    if variant in ('qwen','ray'):
        graph['2']['inputs']['device']='cpu'
        graph['8']={'class_type':'VAEDecodeTiled','inputs':{'samples':['7',0],'vae':['3',0],'tile_size':512,'overlap':64,'temporal_size':64,'temporal_overlap':8}}
    if variant=='ray':
        model_file='rayQwen21_v1Int8Convrot.safetensors'
        if not (storage_paths.path('models')/'diffusion_models'/model_file).is_file():raise ValueError('Ray Qwen 2.1 模型未安装')
        graph['1']['inputs']['unet_name']=model_file
    graph['7']['inputs'].update(steps=steps,cfg=cfg,sampler_name=sampler_name,scheduler=scheduler)
    if variant=='pro_mix':
        generation_workflow='moody_zit_simple'
        graph['7']['inputs']['end_at_step']=max(1,steps-2)
        graph['12']['inputs'].update(steps=steps,cfg=cfg,start_at_step=max(0,steps-5))
    graph['5']['inputs'].update(width=sizes[ratio][0],height=sizes[ratio][1])
    reference_body=body
    if generation_workflow==krea_i2i.WORKFLOW:
        width,height,reference_body=await asyncio.to_thread(krea_i2i.attach,graph,body,{'low':768,'medium':1024,'high':1536}[resolution])
        sizes={**sizes,ratio:(width,height)}
        steps=graph['7']['inputs']['steps']
    if redraw:
        source=str(body.get('image',''))
        with Image.open(input_path(source)) as reference:
            w,h=reference.size
        max_side={'low':768,'medium':1024,'high':1536}[resolution]
        width=max(32,round(w*max_side/max(w,h)/8)*8)
        height=max(32,round(h*max_side/max(w,h)/8)*8)
        sizes={**sizes,ratio:(width,height)}
        graph['13']={'class_type':'LoadImage','inputs':{'image':source}}
        graph['14']={'class_type':'ImageScale','inputs':{'image':['13',0],'upscale_method':'lanczos','width':width,'height':height,'crop':'disabled'}}
        graph['5']={'class_type':'VAEEncode','inputs':{'pixels':['14',0],'vae':['3',0]}}
        # Author V3.1: partial first-stage sampling, then 1.7x latent refinement.
        graph['7']['inputs'].update(start_at_step=max(0,steps-4),end_at_step=max(1,steps-1))
        graph['12']['inputs'].update(steps=steps+1,start_at_step=max(0,steps-4))
        generation_workflow='moody_zit_i2i'
    if simple_mode in ('refine','upscale'):
        graph['10']={'class_type':'LatentUpscaleBy','inputs':{'samples':['7',0],'upscale_method':'bicubic','scale_by':refine_scale}}
        graph['11']={'class_type':'KSampler','inputs':{'model':['1',0],'positive':['4',0],'negative':['6',0],'latent_image':['10',0],'seed':seed,'steps':workflow_settings.get('refine_steps',4),'cfg':1.0,'sampler_name':'euler_ancestral','scheduler':'beta','denoise':refine_strength}}
        graph['8']['inputs']['samples']=['11',0]
    if generation_loras:lora_manager.apply(graph,generation_loras['snapshots'])
    if generation_loras_v2:
        lora_v2.apply(graph,generation_loras_v2)
        if generation_loras_v2['snapshots']:
            loader=graph['generation_v2_lora']['class_type']
            if loader not in await backend(request.app,'/object_info/'+loader):
                raise ValueError('严格 LoRA 加载器尚未启动，请重启 ComfyUI 后重试')
    prompt,character_snapshot=await asyncio.to_thread(character_generation.apply,graph,reference_body,prompt)
    hd_size=None
    if generation_workflow in ('moody_krea2_4khd',krea_i2i.WORKFLOW) and variant in ('cutie','mix_v8'):
        hd_size=krea_hd.build(graph,*sizes[ratio],seed,workflow_settings)
    elif simple_mode=='upscale':
        krea_hd.seedvr(graph,['8',0],sizes[ratio][0]*workflow_settings['upscale_factor'],sizes[ratio][1]*workflow_settings['upscale_factor'],seed)
    if generation_workflow==krea_i2i.WORKFLOW and 'character_patch' in graph:
        graph['character_patch']['inputs'].update(ref_boost=1.0,ref_boost_a=4.0)
        if 'hd_character_patch' in graph:graph['hd_character_patch']['inputs'].update(ref_boost=1.0,ref_boost_a=4.0)
    if character_snapshot and 'character_strength' in workflow_settings:
        character_generation.set_reference_strength(graph,workflow_settings['character_strength'],generation_workflow==krea_i2i.WORKFLOW)
    set_output_folder(graph,'02_character_consistency' if redraw else '01_text_to_image')
    async with MEMORY_LOCK:
        result=await backend(request.app,'/prompt',{'prompt':graph,'client_id':CLIENT})
        LAST_ACTIVITY=time.monotonic();RELEASED=False
    output_scale=workflow_settings['zit_scale'] if variant=='pro_mix' else workflow_settings['upscale_factor'] if simple_mode=='upscale' else refine_scale if simple_mode=='refine' else 1
    job={'prompt_id':result['prompt_id'],'preset':'01_text_to_image','label':'文字生图 · '+{'cutie':'Krea2 Moody Cutie','mix_v8':'Krea2 Moody Mix','pro_mix':'ZIT · Moody Pro Mix','qwen':'Qwen 2.1','ray':'Ray Qwen 2.1'}[variant],'generation_model':variant,'generation_workflow':generation_workflow if variant in ('cutie','mix_v8','pro_mix') else None,'image_resolution':resolution,'width':round(sizes[ratio][0]/8*output_scale)*8 if variant=='pro_mix' else round(sizes[ratio][0]*output_scale),'height':round(sizes[ratio][1]/8*output_scale)*8 if variant=='pro_mix' else round(sizes[ratio][1]*output_scale),'prompt':prompt,'original_prompt':prompt,'seed':seed,'ratio':ratio,'image':None,'status':'queued','created':time.time(),'images':[],'steps':steps,'cfg':cfg,'sampler_name':sampler_name,'scheduler':scheduler,'quality':'pro','memory_mode':'cpu','krea_simple_mode':simple_mode,'refine_scale':refine_scale,'refine_strength':refine_strength}
    job['workflow_settings']=workflow_settings
    if hd_size:job.update(width=hd_size[0],height=hd_size[1])
    job.update(prompt=str(body.get('prompt','')).strip(),original_prompt=str(body.get('prompt','')).strip(),loras=generation_loras['snapshots'] if generation_loras else [],lora_config=generation_loras['items'] if generation_loras else [],lora_warnings=generation_loras['warnings'] if generation_loras else [],final_prompt=prompt)
    if generation_loras_v2:
        job.update(loras=generation_loras_v2['snapshots'],lora_warnings=generation_loras_v2['warnings'],
                   lora_v2={'schema':2,'recipe':lora_v2.RECIPE,'items':generation_loras_v2['items']},
                   lora_v2_snapshot={**generation_loras_v2,'graph_sha256':lora_v2.digest(graph)})
    job.update({k:body[k] for k in ('base_prompt','prompt_supplement','library_prompt','library_prompt_id','library_prompt_revision','camera_preset','camera_original_prompt','camera_prompt') if k in body})
    job['generation_references']=body.get('generation_references',[])
    if character_snapshot:
        job.update(character_card_id=character_snapshot['id'],character_card_snapshot=character_snapshot,
                   final_prompt=prompt,prompt=body.get('prompt',''),original_prompt=body.get('original_prompt',body.get('prompt','')),
                   generation_references=body.get('requested_generation_references',body.get('generation_references',[])))
    if redraw:
        job.update(preset='02_character_consistency',label='参考图重绘 · ZIT Moody Pro Mix',i2i_workflow='moody_zit_i2i',image=source,references=[],primary_reference={'image':source,'role':'subject'},auto_caption=bool(body.get('auto_caption')))
    if generation_workflow==krea_i2i.WORKFLOW:
        job.update(prompt=body['redraw_user_prompt'],original_prompt=body['redraw_user_prompt'],generated_caption=body['generated_caption'],caption_model=body['caption_model'],redraw_creativity=body['redraw_creativity'],label='图片重绘 4KHD · Krea2',image=body['generation_references'][0]['image'],generation_references=body['generation_references'])
    JOBS.append(job);save();record_generation_usage(job);return web.json_response(job)

async def prompt_assistant(request):
    import simple_pe
    body=await request.json()
    return web.json_response(await simple_pe.run(body.get('task'),body.get('prompt',''),body.get('instruction'),body.get('current_rating')))

async def enhance_edit(request):
    body=await request.json();image_path=input_path(str(body.get('image','')))
    prompt=str(body.get('prompt','')).strip()
    if not prompt or len(prompt)>10000:raise ValueError('请输入修改要求')
    rewritten=await deepseek_client.complete(prompt,image_path,task='edit')
    if len(rewritten)>10000:raise ValueError('优化结果过长，原内容已保留')
    return web.json_response({'prompt':rewritten,'original_prompt':prompt})

async def image(request):
    params={k:request.query.get(k,'') for k in ['filename','subfolder','type']}
    if params['type'] not in ['input','output']:raise ValueError('无效图片类型')
    base=(storage_paths.path(params['type'])).resolve()
    filename=params['filename']
    if not filename or '/' in filename or '\\' in filename:raise web.HTTPNotFound()
    path=(base/params['subfolder']/filename).resolve()
    if not path.is_relative_to(base) or not path.is_file() or path.suffix.lower() not in ('.png','.jpg','.jpeg','.webp','.gif','.bmp','.avif'):raise web.HTTPNotFound()
    return web.FileResponse(path)

def compose_edit_result(job,generated,destination):
    source=job.get('composite_source') or job['image']
    mask=job.get('composite_mask') or job['mask']
    if job.get('frame')=='outpaint':
        # The extension's gray pixels are placeholders, not original content.
        # Blending them into the generated border manufactures a gray seam.
        composite_outpaint(source,generated,mask,destination)
    else:
        composite(source,generated,mask,float(job.get('feather',8)),destination,
                  job.get('crop_box'),False,
                  smooth_edges=bool(job.get('hires_local')) or job.get('edit_task')=='face')

async def monitor(app):
    while True:
        try:
            q=await backend(app,'/queue');running={x[1] for x in q['queue_running']};pending={x[1] for x in q['queue_pending']}
            for job in JOBS:
                if job['status'] not in ['queued','running']:continue
                pid=job['prompt_id']
                h=await backend(app,'/history/'+pid)
                if job['status']=='cancelled':continue
                if pid in h:
                    record=h[pid];job['status']='success' if record['status']['status_str']=='success' else 'error'
                    job['images']=[{'url':'/image?'+urlencode(im),**im} for out in record['outputs'].values() for im in out.get('images',[])]
                    if job['status']=='success' and job.get('local_edit'):
                        try:
                            (storage_paths.path('output')/'图片编辑').mkdir(exist_ok=True);original_outputs=job['images'];outputs=[]
                            for im in original_outputs:
                                generated=(storage_paths.path('output')/im['subfolder']/im['filename']).resolve()
                                if not generated.is_relative_to((storage_paths.path('output')).resolve()):raise ValueError('无效输出路径')
                                dest=storage_paths.path('output')/'图片编辑'/('local_edit_'+pid+'_'+str(len(outputs))+'.png')
                                await asyncio.to_thread(compose_edit_result,job,generated,dest)
                                final={'filename':dest.name,'subfolder':'图片编辑','type':'output'}
                                outputs.append({'url':'/image?'+urlencode(final),**final})
                            job['raw_images']=original_outputs;job['images']=outputs
                        except Exception as e:job.update(status='error',error='局部合成失败：'+str(e),images=[])
                    if job['status']=='success' and job['preset']=='03_image_edit' and not job.get('local_edit') and job.get('frame','original')=='original':
                        try:
                            (storage_paths.path('output')/'图片编辑').mkdir(exist_ok=True);outputs=[]
                            for index,im in enumerate(job['images']):
                                generated=(storage_paths.path('output')/im['subfolder']/im['filename']).resolve()
                                if not generated.is_relative_to((storage_paths.path('output')).resolve()):raise ValueError('无效输出路径')
                                dest=storage_paths.path('output')/'图片编辑'/f'edit_original_size_{pid}_{index}.png'
                                await asyncio.to_thread(restore_size,job['image'],generated,dest)
                                final={'filename':dest.name,'subfolder':'图片编辑','type':'output'};outputs.append({'url':'/image?'+urlencode(final),**final})
                            job['raw_images']=job['images'];job['images']=outputs
                        except Exception as e:job.update(status='error',error='原尺寸恢复失败：'+str(e),images=[])
                    job['finished']=time.time()
                    if job['status']=='success':
                        try:finalize_outputs(job)
                        except Exception as e:job['file_error']='文件整理失败：'+str(e)
                    if job['status']=='error' and not job.get('error'):job['error']=str(record['status']['messages'])[-2000:]
                    save()
                elif pid in running:job['status']='running'
                elif pid not in pending and time.time()-job['created']>15:job.update(status='error',error='任务已被清除或 ComfyUI 已重启');save()
        except Exception:pass
        await asyncio.sleep(2)

def decode_preview(data, active_pid):
    if len(data)<8:return None
    kind=int.from_bytes(data[:4],'big')
    if kind==1:
        image_type=int.from_bytes(data[4:8],'big')
        if image_type not in (1,2):return None
        return active_pid, data[8:], 'image/jpeg' if image_type==1 else 'image/png'
    if kind==4:
        size=int.from_bytes(data[4:8],'big')
        if size>len(data)-8:return None
        metadata=json.loads(data[8:8+size])
        mime=metadata.get('image_type')
        if mime not in ('image/jpeg','image/png'):return None
        return metadata.get('prompt_id') or active_pid,data[8+size:],mime
    return None

async def live_preview_image(request):
    frame=PREVIEWS.get(request.match_info['pid'])
    if not frame:raise web.HTTPNotFound()
    return web.Response(body=frame[1],content_type=frame[2],headers={'Cache-Control':'no-store'})

async def live_preview_events(request):
    response=web.StreamResponse(headers={'Content-Type':'text/event-stream','Cache-Control':'no-cache'})
    await response.prepare(request)
    queue=asyncio.Queue(maxsize=1);PREVIEW_LISTENERS.add(queue)
    try:
        while True:
            try:payload=await asyncio.wait_for(queue.get(),timeout=15)
            except asyncio.TimeoutError:await response.write(b': keepalive\n\n');continue
            await response.write(('data: '+json.dumps(payload)+'\n\n').encode())
    except (ConnectionError,asyncio.CancelledError):pass
    finally:PREVIEW_LISTENERS.discard(queue)
    return response

async def events(app):
    while True:
        try:
            active_pid=None
            async with app['session'].ws_connect(BACKEND+'/ws?clientId='+CLIENT) as ws:
                async for message in ws:
                    if message.type.name=='TEXT':
                        event=json.loads(message.data);d=event.get('data',{});pid=d.get('prompt_id')
                        if event['type'] in ('execution_start','executing','progress') and pid:active_pid=pid
                        if event['type']=='executing' and d.get('node') is None:active_pid=None
                        if event['type']=='progress' and pid:PROGRESS[pid]={'value':d['value'],'max':d['max']}
                    elif message.type.name=='BINARY':
                        try:frame=decode_preview(message.data,active_pid)
                        except (ValueError,UnicodeError):continue
                        if not frame:continue
                        pid,image,mime=frame
                        if not pid or not image or not any(j['prompt_id']==pid for j in JOBS):continue
                        version=time.time_ns();PREVIEWS[pid]=(version,image,mime)
                        while len(PREVIEWS)>8:PREVIEWS.pop(next(iter(PREVIEWS)))
                        payload={'prompt_id':pid,'preview_url':'/api/live-preview/'+pid+'?v='+str(version),'progress':PROGRESS.get(pid)}
                        for queue in PREVIEW_LISTENERS:
                            if queue.full():queue.get_nowait()
                            queue.put_nowait(payload)
        except Exception:await asyncio.sleep(3)

async def lifecycle(app):
    await asyncio.to_thread(local_vlm.cleanup_orphans)
    app['session']=ClientSession(timeout=ClientTimeout(total=30))
    tasks=[asyncio.create_task(monitor(app)),asyncio.create_task(events(app)),asyncio.create_task(idle_memory(app))]
    yield
    for task in tasks:task.cancel()
    await asyncio.gather(*tasks,return_exceptions=True)
    await app['session'].close()

def ensure_comfy():
    import urllib.request
    def ready():
        try:urllib.request.urlopen(BACKEND+'/system_stats',timeout=2).close();return True
        except Exception:return False
    if ready():return
    env=os.environ.copy()
    for k,v in {'TEMP':'tmp','TMP':'tmp','HF_HOME':'cache/huggingface','TORCH_HOME':'cache/torch','XDG_CACHE_HOME':'cache','PIP_CACHE_DIR':'cache/pip'}.items():env[k]=str(ROOT/v)
    log=open(DATA/'comfyui.log','a',encoding='utf-8')
    subprocess.Popen([str(ROOT/'.venv/Scripts/python.exe'),'-X','utf8',str(ROOT/'ComfyUI/main.py'),'--listen','127.0.0.1','--port','8188','--preview-method','auto','--disable-async-offload','--reserve-vram',str(MEMORY['reserve_vram_gb']),'--vram-headroom',str(MEMORY['extra_headroom_gb'])]+storage_paths.engine_arguments(),cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    print('正在启动 ComfyUI…',flush=True)
    for _ in range(120):
        if ready():return
        time.sleep(1)
    raise RuntimeError('ComfyUI 启动超时，请查看 webui/data/comfyui.log')

if __name__=='__main__':
    import urllib.request
    try:
        urllib.request.urlopen('http://127.0.0.1:8190/api/config',timeout=2).close()
    except Exception:pass
    else:
        if '--desktop' not in sys.argv:webbrowser.open('http://127.0.0.1:8190')
        sys.exit(0)
    ensure_comfy()
    app=web.Application(middlewares=[guard],client_max_size=32*1024*1024)
    app.cleanup_ctx.append(lifecycle)
    app.router.add_get('/api/hardware',hardware)
    app.router.add_get('/api/dashboard',dashboard_summary)
    app.router.add_get('/home.css',lambda request:web.FileResponse(HERE/'home.css',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/studio-shell.css',lambda request:web.FileResponse(HERE/'studio-shell.css',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/prompt-composer.css',lambda request:web.FileResponse(HERE/'prompt-composer.css',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/studio-shell.js',lambda request:web.FileResponse(HERE/'studio-shell.js',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/home.js',lambda request:web.FileResponse(HERE/'home.js',headers={'Cache-Control':'no-cache'}))
    app.router.add_post('/api/jobs/{pid}/cancel',cancel_generation)
    app.router.add_get('/api/pe-models',pe_models.manage)
    app.router.add_post('/api/pe-models',pe_models.manage)
    app.router.add_post('/api/pe-models/test',pe_models.test)
    app.router.add_post('/api/pe-models/discover',pe_models.discover)
    app.router.add_post('/api/pe-models/import',pe_local_import.upload)
    app.router.add_get('/api/assistant/settings',deepseek_client.settings)
    app['runtime_memory']=MEMORY
    app.router.add_get('/api/settings',app_settings.settings)
    app.router.add_post('/api/settings',app_settings.settings)
    app.router.add_post('/api/settings/open-folder',app_settings.open_folder)
    app.router.add_post('/api/settings/paths',app_settings.update_paths)
    app.router.add_get('/settings',lambda request:web.FileResponse(HERE/'settings.html',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/settings.js',lambda request:web.FileResponse(HERE/'settings.js',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/settings.css',lambda request:web.FileResponse(HERE/'settings.css',headers={'Cache-Control':'no-cache'}))
    app.router.add_post('/api/assistant/settings',deepseek_client.settings)
    app.router.add_post('/api/assistant/test',deepseek_client.test)
    app.router.add_get('/api/pe-chat',pe_chat.conversation)
    app.router.add_post('/api/pe-chat',pe_chat.conversation)
    app.router.add_post('/api/pe-chat/images',chat_media.upload)
    app.router.add_get('/api/pe-chat/images/{id}',chat_media.image)
    app.router.add_get('/pe-chat',lambda request:web.FileResponse(HERE/'pe-chat.html',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/pe-chat.js',lambda request:web.FileResponse(HERE/'pe-chat.js',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/pe-chat.css',lambda request:web.FileResponse(HERE/'pe-chat.css',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/api/models',model_library)
    app.router.add_get('/api/loras',lora_manager.library)
    app.router.add_post('/api/camera-presets/rewrite',camera_presets.rewrite_endpoint)
    app.router.add_post('/api/camera-presets/preview',camera_presets.preview)
    app.router.add_get('/api/lora-v2',lora_v2.library)
    app.router.add_post('/api/lora-v2/profile',lora_v2.edit_profile)
    app.router.add_post('/api/lora-v2/validate',lora_v2.check)
    app.router.add_post('/api/loras/info',lora_manager.edit_info)
    app.router.add_post('/api/loras/validate',lora_manager.check)
    app.router.add_get('/api/loras/profiles',lora_manager.profiles)
    app.router.add_post('/api/loras/profiles',lora_manager.profiles)
    app.router.add_get('/api/live-preview-events',live_preview_events)
    app.router.add_get('/api/live-preview/{pid}',live_preview_image)
    app.router.add_get('/api/prompts',prompt_library)
    app.router.add_get('/api/characters',character_cards.list_cards)
    app.router.add_post('/api/characters',character_cards.update_card)
    app.router.add_post('/api/prompts',prompt_library)
    app.router.add_post('/api/prompts/{id}/use',prompt_use)
    app.router.add_get('/api/prompts/{id}/images',prompt_images)
    app.router.add_get('/prompt-fields.js',lambda request:web.Response(text='window.promptFieldGroups='+ (HERE/'prompt_fields.json').read_text(encoding='utf-8')+';',content_type='application/javascript',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/prompt-section-editor.js',lambda request:web.FileResponse(HERE/'prompt-section-editor.js',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/prompt-search.js',lambda request:web.FileResponse(HERE/'prompt-search.js',headers={'Cache-Control':'no-cache'}))
    app.router.add_post('/api/prompt-covers/upload',prompt_covers.upload)
    app.router.add_post('/api/prompt-covers/from-output',prompt_cover_from_output)
    app.router.add_get('/api/prompt-covers/{cover_id:[a-f0-9]{32}}/{variant:full|thumb|source}',prompt_covers.image)
    app.router.add_post('/api/enhance-prompt',prompt_assistant)
    app.router.add_get('/image-reader',image_reader.page)
    app.router.add_get('/workflow-controls.js',lambda request:web.FileResponse(HERE/'workflow-controls.js',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/workbench',lambda request:web.FileResponse(HERE/'index.html',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/backup-preview',lambda request:web.HTTPFound('/backup-preview/index.html'))
    if (ROOT/'backups/prompt-preview-20261007').is_dir():
        app.router.add_static('/backup-preview/',ROOT/'backups/prompt-preview-20261007',show_index=False)
    app.router.add_get('/resources',lambda request:web.FileResponse(HERE/'resources.html',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/generated',lambda request:web.FileResponse(HERE/'generated.html',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/generated.js',lambda request:web.FileResponse(HERE/'generated.js',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/api/generated-images',generated_images)
    app.router.add_get('/resources.css',lambda request:web.FileResponse(HERE/'resources.css',headers={'Cache-Control':'no-cache'}))
    app.router.add_get('/resources.js',lambda request:web.FileResponse(HERE/'resources.js',headers={'Cache-Control':'no-cache'}))
    app.router.add_post('/api/image-reader',image_reader.describe)
    app.router.add_post('/api/models/download',download_model)
    from model_library import edit_metadata
    app.router.add_post('/api/models/edit',edit_metadata)
    app.router.add_post('/api/models/open-folder',open_model_folder)
    app.router.add_post('/api/media/open-folder',media_action)
    app.router.add_post('/api/media/delete',media_action)
    app.router.add_get('/{file:camera-presets\\.js|camera-presets\\.json|prompt-ratings\\.js|assistant-settings\\.js|app\\.js|editor\\.js|orb-loader\\.js|lora-v2\\.js|lora-v2\\.css|prompt-covers\\.js|prompt-covers\\.css}',asset)
    app.add_routes([web.get('/',index),web.get('/api/config',config),web.get('/api/status',status),web.post('/api/upload',upload),web.post('/api/annotation',upload_annotation),web.post('/api/mask',upload_mask),web.post('/api/generate',generate),web.post('/api/enhance-edit',enhance_edit),web.post('/api/release',release),web.get('/image',image)])
    if '--open' in sys.argv:
        import threading
        threading.Timer(1,lambda:webbrowser.open('http://127.0.0.1:8190')).start()
    web.run_app(app,host='127.0.0.1',port=8190)
