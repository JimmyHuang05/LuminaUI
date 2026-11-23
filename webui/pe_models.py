"""PE model registry. Cloud secrets stay server-side; legacy settings migrate on first save."""
import copy
import json
import uuid
from pathlib import Path
from urllib.parse import urlsplit
from aiohttp import web, ClientSession, ClientTimeout, ClientError
import storage_paths

PATH = storage_paths.path('data') / 'pe_models.json'
PRESETS = json.loads(Path(__file__).with_name('pe_presets.json').read_text(encoding='utf-8'))


def load():
    if PATH.exists():
        return json.loads(PATH.read_text(encoding='utf-8'))
    import deepseek_client
    old = deepseek_client.load_legacy()
    folder = storage_paths.path('local_pe')
    return {'version': 1, 'default_id': 'deepseek', 'models': [
        {'id': 'deepseek', 'kind': 'cloud', 'vendor': 'deepseek', 'protocol': 'openai',
         'name': old['model'], 'model': old['model'], 'base_url': old['base_url'], 'api_key': old['api_key'], 'vision': old['model'] == 'deepseek-flash'},
        {'id': 'qwen', 'kind': 'local', 'name': 'Qwen3.5-4B', 'model': 'Qwen3.5-4B',
         'model_path': str(folder / 'Qwen3.5-4B-Q4_K_M.gguf'), 'projector_path': str(folder / 'mmproj-F16.gguf'),
         'architecture': 'qwen35', 'context_length': 16384, 'vision': True}]}


def save(state):
    PATH.parent.mkdir(parents=True, exist_ok=True)
    temp = PATH.with_suffix('.tmp')
    temp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(PATH)


def get(model_id=None):
    state = load()
    model_id = model_id or state['default_id']
    for row in state['models']:
        if row['id'] == model_id:
            return copy.deepcopy(row)
    raise ValueError('模型配置已移除，请重新选择模型')


def available(row):
    if row['kind'] == 'cloud':
        return bool(row.get('api_key'))
    import local_vlm
    return (local_vlm.ROOT / 'tools/llama-b11345-cuda12/llama-server.exe').is_file() and Path(row['model_path']).is_file() and (not row.get('projector_path') or Path(row['projector_path']).is_file())


def public_row(row):
    result = {k: v for k, v in row.items() if k != 'api_key'}
    ready = available(row)
    return result | {'has_api_key': bool(row.get('api_key')), 'available': ready, 'label': row.get('name') or row['model'],
                     'description': ('云端' if row['kind'] == 'cloud' else '本地') + (' · 可用' if ready else ' · 配置不完整')}


def public():
    state = load()
    return {'models': [public_row(r) for r in state['models']], 'default_id': state['default_id'], **PRESETS}


def validate(body, existing=None):
    if not isinstance(body, dict):
        raise ValueError('模型配置无效')
    old = existing or {}
    vendor = body.get('vendor', old.get('vendor', 'custom'))
    preset = next((p for p in PRESETS['presets'] if p['id'] == vendor), None)
    if not preset:
        raise ValueError('请选择服务商')
    row = copy.deepcopy(old) if old else {'id': 'cloud-' + uuid.uuid4().hex, 'kind': 'cloud'}
    if row['kind'] != 'cloud':
        raise ValueError('请通过本地导入管理本地模型')
    row['vendor'] = vendor
    for key, default in [('base_url', preset['base_url']), ('protocol', preset['protocol']), ('model', ''), ('name', '')]:
        value = body.get(key, row.get(key, default))
        if not isinstance(value, str) or len(value) > 2048:
            raise ValueError('模型配置字段无效')
        row[key] = value.strip()
    row['base_url'] = row['base_url'].rstrip('/')
    url = urlsplit(row['base_url'])
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment or any(c.isspace() for c in row['base_url']):
        raise ValueError('API 地址需要完整的 HTTPS 地址')
    if row['protocol'] not in ('openai', 'responses', 'anthropic'):
        raise ValueError('接口协议无效')
    if not row['model'] or len(row['model']) > 200 or any(c.isspace() for c in row['model']):
        raise ValueError('请填写完整的模型 ID')
    row['name'] = row['name'] or row['model']
    if len(row['name']) > 100:
        raise ValueError('显示名称最多 100 字')
    key = body.get('api_key', '')
    if not isinstance(key, str) or len(key) > 2048 or '\n' in key or '\r' in key:
        raise ValueError('API Key 无效')
    # Never reuse a saved key after changing its destination or service.
    changed = existing and (row['base_url'] != old['base_url'] or vendor != old['vendor'])
    row['api_key'] = key.strip() or ('' if changed else old.get('api_key', ''))
    if body.get('clear_key'):
        row['api_key'] = ''
    if not row['api_key'] and not body.get('clear_key'):
        raise ValueError('请粘贴此服务的 API Key')
    model = next((m for m in preset['models'] if m['id'] == row['model']), None)
    row['vision'] = model['vision'] if model else body.get('vision', old.get('vision', False)) is True
    return row


def config(model_id=None):
    import deepseek_client
    row = get(model_id)
    row['instructions'] = deepseek_client.load_legacy()['instructions']
    return row


async def manage(request):
    if request.method == 'GET':
        return web.json_response(public())
    body = await request.json()
    if not isinstance(body, dict):
        raise ValueError('模型配置无效')
    action = body.get('action', 'save')
    state = load()
    old = next((r for r in state['models'] if r['id'] == body.get('id')), None)
    if body.get('id') and not old:
        raise ValueError('模型配置已移除，请刷新')
    if action == 'save':
        row = validate(body, old)
        state['models'] = [r for r in state['models'] if r['id'] != row['id']] + [row]
        if body.get('make_default') or not state['default_id']:
            state['default_id'] = row['id']
    elif action == 'default':
        if not old or not available(old):
            raise ValueError('模型配置尚未完整')
        state['default_id'] = old['id']
    elif action == 'remove':
        if not old:
            raise ValueError('模型不存在')
        state['models'] = [r for r in state['models'] if r['id'] != old['id']]
        if state['default_id'] == old['id']:
            state['default_id'] = next((r['id'] for r in state['models'] if available(r)), '')
    else:
        raise ValueError('未知模型操作')
    save(state)
    return web.json_response(public())


async def test(request):
    import deepseek_client
    body = await request.json()
    old = get(body['id']) if body.get('id') else None
    row = old if old and old['kind'] == 'local' else validate(body, old)
    row['instructions'] = deepseek_client.load_legacy()['instructions']
    await deepseek_client.complete('Reply with {"ok":true}.', config=row,
                                   output_schema={'type': 'object', 'properties': {'ok': {'type': 'boolean'}}, 'required': ['ok'], 'additionalProperties': False})
    return web.json_response({'ok': True, 'message': '连接成功，可以使用'})


async def discover(request):
    body = await request.json()
    old = get(body['id']) if body.get('id') else None
    row = validate(body | {'model': body.get('model') or 'discovery'}, old)
    headers = {'Authorization': 'Bearer ' + row['api_key']}
    if row['protocol'] == 'anthropic':
        headers = {'x-api-key': row['api_key'], 'anthropic-version': '2023-06-01'}
    try:
        async with ClientSession(timeout=ClientTimeout(total=25)) as session:
            async with session.get(row['base_url'] + '/models', headers=headers, allow_redirects=False) as response:
                if response.status != 200:
                    raise ValueError('无法获取模型列表，请使用内置预设或填写模型 ID')
                data = await response.json()
        ids = sorted({r['id'] for r in data.get('data', []) if isinstance(r, dict) and isinstance(r.get('id'), str)})
        return web.json_response({'models': ids[:1000]})
    except (ClientError, TimeoutError):
        raise ValueError('模型列表连接失败，请使用内置预设') from None
