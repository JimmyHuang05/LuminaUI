import storage_paths
import asyncio
import json
import hashlib
from pathlib import Path

from aiohttp import ClientSession, ClientTimeout, web

ROOT=Path(__file__).resolve().parents[1]
CATALOG=Path(__file__).with_name('model_catalog.json')
DOWNLOADS={}
TASKS=set()
METADATA=storage_paths.path('data')/'model_metadata.json'

def metadata():
    return json.loads(METADATA.read_text(encoding='utf-8')) if METADATA.exists() else {}

async def edit_metadata(request):
    from urllib.parse import urlsplit
    body=await request.json()
    mid=body.get('id')
    if not any(f['id']==mid for group in inventory()['groups'] for f in group['files']):raise ValueError('模型不存在，请刷新模型库')
    label=body.get('label','');source=body.get('source','')
    if not isinstance(label,str) or not isinstance(source,str) or len(label)>100 or len(source)>2000:raise ValueError('备注最多 100 字，来源链接最多 2000 字')
    label=label.strip();source=source.strip()
    parsed=urlsplit(source)
    if source and (parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password):raise ValueError('请输入有效的 HTTP 或 HTTPS 来源链接')
    rows=metadata();rows[mid]={**rows.get(mid,{}),'label':label,'source':source}
    tmp=METADATA.with_suffix('.tmp');tmp.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(METADATA)
    return web.json_response({'saved':True})

def catalog():
    return json.loads(CATALOG.read_text(encoding='utf-8'))

def destination(model):
    base=(storage_paths.path('models')).resolve()
    path=(base/model['category']/model['name']).resolve()
    if not path.is_relative_to(base):raise ValueError('无效模型路径')
    return path

def inventory():
    data=catalog();groups={}
    for model in data['models']:
        path=destination(model);installed=path.is_file() and path.stat().st_size==model['bytes']
        group=groups.setdefault(model['category'],{'name':model['category'],**data['categories'].get(model['category'],{}),'files':[]})
        group['files'].append({**model,'installed':installed,'download':DOWNLOADS.get(model['id'])})
    base=storage_paths.path('models')
    known={m['id'] for m in data['models']}
    if base.exists():
        for path in sorted(base.rglob('*')):
            relative=path.relative_to(base);parts=relative.parts
            if len(parts)<2 or any(p.startswith('.') for p in parts) or not path.is_file() or path.suffix.lower() not in {'.safetensors','.gguf','.pt','.pth','.ckpt','.bin','.onnx'}:continue
            name=Path(*parts[1:]).as_posix();mid=parts[0]+'/'+name
            if mid in known:continue
            groups.setdefault(parts[0],{'name':parts[0],'files':[]})['files'].append({'id':mid,'name':name,'bytes':path.stat().st_size,'installed':True})
    edits=metadata()
    for group in groups.values():
        for model in group['files']:
            if model['id'] in edits:model.update(edits[model['id']])
    return {'groups':list(groups.values())}

async def library(request):
    return web.json_response(await asyncio.to_thread(inventory))

async def transfer(model):
    state=DOWNLOADS[model['id']];path=destination(model);partial=path.with_suffix(path.suffix+'.download');digest=hashlib.sha256()
    try:
        path.parent.mkdir(parents=True,exist_ok=True)
        async with ClientSession(timeout=ClientTimeout(total=None,sock_connect=60,sock_read=120)) as session:
            async with session.get(model['download_url']) as response:
                if response.status!=200:raise ValueError(f'下载失败（HTTP {response.status}），请查看来源页面是否需要登录')
                if 'text/html' in response.headers.get('Content-Type',''):raise ValueError('下载地址返回网页，未保存为模型')
                with partial.open('wb') as output:
                    async for chunk in response.content.iter_chunked(1024*1024):
                        output.write(chunk);digest.update(chunk);state['received']+=len(chunk)
                        if state['received']>model['bytes']:raise ValueError('文件大小与清单不匹配')
        if partial.stat().st_size!=model['bytes']:raise ValueError('文件未完整下载，大小与清单不匹配')
        if model.get('sha256') and digest.hexdigest()!=model['sha256']:raise ValueError('文件校验失败，请重新下载')
        partial.replace(path);state['status']='complete'
    except Exception as error:
        state.update(status='error',error=str(error))

async def download(request):
    body=await request.json();model=next((m for m in catalog()['models'] if m['id']==body.get('id')),None)
    if not model or not model.get('download_url'):raise ValueError('尚未配置直接下载地址，请使用查看来源')
    path=destination(model)
    if path.exists():raise ValueError('文件已存在，不会覆盖，请先打开所在文件夹检查')
    if DOWNLOADS.get(model['id'],{}).get('status')=='downloading':return web.json_response({'started':True})
    DOWNLOADS[model['id']]={'status':'downloading','received':0,'total':model['bytes']}
    task=asyncio.create_task(transfer(model));TASKS.add(task);task.add_done_callback(TASKS.discard)
    return web.json_response({'started':True})
