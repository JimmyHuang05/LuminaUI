"""User-facing runtime and workflow preferences, separate from shipped defaults."""
import storage_paths
import asyncio
import copy
import json
import os
from pathlib import Path
from aiohttp import web
import workflow_controls

ROOT = Path(__file__).resolve().parents[1]
PATH = storage_paths.path('data') / 'user_settings.json'

def load():
    return json.loads(PATH.read_text(encoding='utf-8')) if PATH.exists() else {}

def save(data):
    PATH.parent.mkdir(exist_ok=True)
    temporary = PATH.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(PATH)

def schema():
    result = copy.deepcopy(workflow_controls.SCHEMA)
    for key, values in load().get('workflows', {}).items():
        if key in result['profiles']:
            result['profiles'][key]['defaults'] = values
    return result

def locations():
    return {'models': storage_paths.path('models'), 'workflows': storage_paths.path('workflows'),
            'output': storage_paths.path('output'), 'input': storage_paths.path('input'),
            'data': storage_paths.path('data'), 'local_pe': storage_paths.path('local_pe')}

def local_status():
    folder = locations()['local_pe']
    paths = [folder/'Qwen3.5-4B-Q4_K_M.gguf', folder/'mmproj-F16.gguf',
             ROOT/'tools/llama-b11345-cuda12/llama-server.exe']
    return {'name': 'Qwen3.5-4B', 'ready': all(p.is_file() for p in paths),
            'files': [{'name': p.name, 'installed': p.is_file()} for p in paths]}

async def settings(request):
    memory = request.app['runtime_memory']
    if request.method == 'POST':
        body = await request.json()
        if not isinstance(body, dict) or set(body) - {'idle_release_seconds', 'workflow', 'values'}:
            raise ValueError('设置格式无效')
        data = load()
        if 'idle_release_seconds' in body:
            value = body['idle_release_seconds']
            if type(value) is not int or value not in (0, 30, 60, 90, 180, 300, 600):
                raise ValueError('请选择有效的空闲释放时间')
            data['idle_release_seconds'] = value
        if 'workflow' in body:
            key = body['workflow']
            if not isinstance(key, str) or key not in workflow_controls.SCHEMA['profiles']:
                raise ValueError('未知工作流')
            values = body.get('values')
            if not isinstance(values, dict):
                raise ValueError('工作流参数格式错误')
            model = key if key in ('qwen', 'ray') else 'pro_mix' if key == 'moody_zit_simple' else 'cutie'
            # Use shipped defaults for omitted fields, including reset-to-default.
            values = workflow_controls.resolve({'generation_model': model, 'generation_workflow': key,
                                                'workflow_settings': values}, use_saved=False)
            data.setdefault('workflows', {})[key] = values
        save(data)
        if 'idle_release_seconds' in data:
            memory['idle_release_seconds'] = data['idle_release_seconds']
    return web.json_response({'idle_release_seconds': memory['idle_release_seconds'],
                              'schema': schema(), 'local_pe': local_status(),
                              'configured_locations': {k:str(p) for k,p in storage_paths.configured().items()},
                              'default_locations': {k:str(p) for k,p in storage_paths.DEFAULTS.items()},
                              'locations': {k: str(p) for k,p in locations().items()}},
                             headers={'Cache-Control': 'no-store'})

async def open_folder(request):
    body = await request.json()
    key = body.get('location') if isinstance(body, dict) else None
    folder = locations().get(key) if isinstance(key, str) else None
    if folder is None or not folder.is_dir():
        raise ValueError('文件夹不存在')
    await asyncio.to_thread(os.startfile, str(folder))
    return web.json_response({'opened': True})

async def update_paths(request):
    body = await request.json()
    saved = storage_paths.save(body)
    return web.json_response({'saved': True, 'configured_locations': {k:str(v) for k,v in saved.items()},
                              'restart_required': any(saved[k] != storage_paths.path(k) for k in saved)})
