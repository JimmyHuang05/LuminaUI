"""Generation LoRA inventory, configuration validation and workflow wiring."""
import storage_paths
import asyncio
import hashlib
import json
import math
import re
import struct
from pathlib import Path

from aiohttp import web
from model_library import inventory as model_inventory, metadata, METADATA

ROOT = Path(__file__).resolve().parents[1]
BASE = storage_paths.path('models')/'loras'
PROFILES = storage_paths.path('data') / 'lora_profiles.json'
MODELS = {'cutie': 'krea2', 'mix_v8': 'krea2', 'qwen': 'qwen', 'ray': 'qwen'}
MODES = ('01_text_to_image', '02_character_consistency')
KINDS = ('character', 'style', 'clothing', 'detail', 'slider', 'other')
INTERNAL = {
    'krea2_identity_edit_v1_2_r128.safetensors',
    'Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors',
    'Qwen21-换头bfs_head_v1.1_qwen_2.1.safetensors',
    'Qwen21-换身bfs_body_swap_v1.0_qwen_2.1.safetensors',
    'Qwen21-水印移除watermark_remover_v2.safetensors',
    'Qwen21-无位移一致性consistency.safetensors',
}
_headers = {}
_hashes = {}


def file_path(mid):
    if not isinstance(mid, str) or not mid.startswith('loras/'):
        raise ValueError('无效 LoRA 标识')
    path = (BASE / mid[6:]).resolve()
    if not path.is_relative_to(BASE.resolve()) or not path.is_file():
        raise ValueError('LoRA 文件缺失：' + mid)
    return path


def inspect_file(path):
    stat = path.stat(); key = (str(path), stat.st_size, stat.st_mtime_ns)
    if key in _headers:
        return _headers[key]
    try:
        if path.suffix.lower() != '.safetensors':
            raise ValueError('目前仅支持 safetensors 格式')
        with path.open('rb') as f:
            length = struct.unpack('<Q', f.read(8))[0]
            if not 0 < length <= min(stat.st_size - 8, 32_000_000):
                raise ValueError('无效文件头')
            header = json.loads(f.read(length))
        tensors = [k for k in header if k != '__metadata__']
        if not any('lora_' in k or '.lora.' in k or 'lokr_' in k for k in tensors):
            raise ValueError('未找到 LoRA 权重')
        payload = stat.st_size - length - 8
        for k in tensors:
            entry = header[k]; offsets = entry.get('data_offsets', [])
            if len(offsets) != 2 or not 0 <= offsets[0] <= offsets[1] <= payload:
                raise ValueError('权重文件不完整')
        meta = header.get('__metadata__', {})
        declared = ' '.join(str(meta.get(k, '')) for k in ('ss_base_model_version', 'modelspec.architecture')).lower()
        family = 'krea2' if 'krea2' in declared else 'qwen' if 'qwen' in declared else ''
        text_weights = any(k.startswith(('lora_te', 'text_encoder', 'clip.')) for k in tensors)
        result = {'family': family, 'has_clip': text_weights, 'error': '', 'declared': declared}
    except (ValueError, KeyError, TypeError, struct.error, UnicodeDecodeError) as e:
        result = {'family': '', 'has_clip': False, 'error': str(e), 'declared': ''}
    _headers[key] = result
    return result


def fingerprint(path):
    stat = path.stat(); key = (str(path), stat.st_size, stat.st_mtime_ns)
    if key not in _hashes:
        digest = hashlib.sha256()
        with path.open('rb') as f:
            for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
                digest.update(block)
        _hashes[key] = digest.hexdigest()
    return _hashes[key]


def items():
    result = []
    for group in model_inventory()['groups']:
        if group['name'] != 'loras':
            continue
        for file in group['files']:
            info = inspect_file(file_path(file['id'])) if file['installed'] else {'family': '', 'has_clip': False, 'error': '文件尚未安装'}
            internal = file['name'] in INTERNAL
            profile = {'usage': 'internal' if internal else 'generation', 'family': info['family'], 'models': [],
                       'modes': list(MODES), 'kind': 'other', 'default_strength': 1.0, 'min_strength': 0.0,
                       'max_strength': 2.0, 'step': 0.05, 'recommended_min': None, 'recommended_max': None,
                       'triggers': '', 'trigger_required': False, 'presets_enabled': False, 'presets': [], 'notes': '', 'evidence': '',
                       'verification': 'unverified', 'verified_models': [], 'requires': [], 'conflicts': []}
            profile.update(file.get('lora', {}))
            if internal:
                profile['usage'] = 'internal'
            result.append({**file, 'label': file.get('label') or file['name'].removesuffix('.safetensors'),
                           'lora': profile, 'inspection': info})
    return result


def number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(label + '须为有限数字')
    return float(value)


def clean_profile(raw):
    if not isinstance(raw, dict):
        raise ValueError('无效 LoRA 配置')
    p = dict(raw)
    for key, allowed in [('family', ('', 'krea2', 'qwen')), ('kind', KINDS), ('usage', ('generation', 'internal')),
                         ('verification', ('unverified', 'verified'))]:
        if p.get(key) not in allowed:
            raise ValueError('无效配置：' + key)
    for key, allowed in [('models', MODELS), ('modes', MODES), ('verified_models', MODELS)]:
        if key == 'verified_models':p.setdefault(key, [])
        if not isinstance(p.get(key), list) or any(v not in allowed for v in p[key]):
            raise ValueError('无效适用模型或模式')
        p[key] = list(dict.fromkeys(p[key]))
    for key in ('default_strength', 'min_strength', 'max_strength', 'step'):
        p[key] = number(p.get(key), key)
    if not -100 <= p['min_strength'] <= p['default_strength'] <= p['max_strength'] <= 100 or not 0.001 <= p['step'] <= 10:
        raise ValueError('强度须在允许范围内，调整步长须为 0.001～10')
    for key in ('recommended_min', 'recommended_max'):
        if p.get(key) is not None:
            p[key] = number(p[key], key)
            if not p['min_strength'] <= p[key] <= p['max_strength']:
                raise ValueError('建议范围须在允许范围内')
    if p.get('recommended_min') is not None and p.get('recommended_max') is not None and p['recommended_min'] > p['recommended_max']:
        raise ValueError('建议范围上下限颠倒')
    for key in ('triggers', 'notes', 'evidence'):
        if not isinstance(p.get(key, ''), str) or len(p.get(key, '')) > 2000:
            raise ValueError('说明或触发词过长')
        p[key] = p.get(key, '').strip()
    p['trigger_required'] = p.get('trigger_required') is True
    p['presets_enabled'] = p.get('presets_enabled') is True
    presets = p.get('presets', [])
    if not isinstance(presets, list) or len(presets) > 100:
        raise ValueError('预设最多包含 100 项')
    cleaned = []; seen = set()
    for preset in presets:
        if not isinstance(preset, dict) or not isinstance(preset.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', preset['id']) or preset['id'] in seen:
            raise ValueError('无效或重复的预设标识')
        name, prompt = preset.get('name'), preset.get('prompt')
        if not isinstance(name, str) or not name.strip() or len(name) > 100 or not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 4000:
            raise ValueError('每项预设需要名称和提示词（名称最多 100 字，提示词最多 4000 字）')
        cleaned.append({'id': preset['id'], 'name': name.strip(), 'prompt': prompt.strip()});seen.add(preset['id'])
    p['presets'] = cleaned
    if p['verification'] == 'verified' and not p['evidence']:
        raise ValueError('请填写验证依据，不能仅标记已验证')
    if p['verification'] == 'verified' and not p['verified_models']:
        raise ValueError('请选择验证记录适用的主模型')
    if not isinstance(p.get('requires'), list) or len(p['requires']) > 20 or any(not isinstance(v, str) or not v.startswith('loras/') for v in p['requires']):
        raise ValueError('无效依赖清单')
    if not isinstance(p.get('conflicts'), list) or len(p['conflicts']) > 30:
        raise ValueError('无效冲突清单')
    rules = []
    for r in p['conflicts']:
        if not isinstance(r, dict) or not isinstance(r.get('id'), str) or not r['id'].startswith('loras/') or r.get('level') not in ('warning', 'error'):
            raise ValueError('无效冲突规则')
        if not isinstance(r.get('reason'), str) or not r['reason'].strip() or len(r['reason']) > 500:
            raise ValueError('请填写冲突原因')
        if not isinstance(r.get('models', []), list) or not isinstance(r.get('modes', []), list) or any(v not in MODELS for v in r.get('models', [])) or any(v not in MODES for v in r.get('modes', [])):
            raise ValueError('无效冲突适用范围')
        threshold = r.get('min_strength')
        if threshold is not None:
            threshold = number(threshold, '冲突阈值')
            if threshold < 0:
                raise ValueError('冲突阈值使用强度绝对值，不能为负')
        rules.append({'id': r['id'], 'level': r['level'], 'reason': r['reason'].strip(),
                      'models': r.get('models', []), 'modes': r.get('modes', []), 'min_strength': threshold})
    p['conflicts'] = rules
    return p


async def library(request):
    return web.json_response({'items': await asyncio.to_thread(items)})


async def edit_info(request):
    body = await request.json(); available = {f['id']: f for f in items()}
    mid = body.get('id')
    if mid not in available:
        raise ValueError('LoRA 不存在')
    profile = clean_profile(body.get('lora'))
    if available[mid]['name'] in INTERNAL and profile['usage'] != 'internal':
        raise ValueError('此扩展由编辑或加速工作流管理')
    declared = available[mid]['inspection']['family']
    if declared and profile['family'] != declared:
        raise ValueError('适用系列与文件声明不符：' + declared)
    label, source = body.get('label', ''), body.get('source', '')
    from urllib.parse import urlsplit
    if not isinstance(label, str) or len(label) > 100 or not isinstance(source, str) or len(source) > 2000:
        raise ValueError('备注或链接过长')
    parsed = urlsplit(source.strip())
    if source.strip() and (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password):
        raise ValueError('来源须为 HTTP 或 HTTPS 链接')
    rows = metadata(); rows[mid] = {**rows.get(mid, {}), 'label': label.strip(), 'source': source.strip(), 'lora': profile}
    tmp = METADATA.with_suffix('.tmp'); tmp.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8'); tmp.replace(METADATA)
    return web.json_response({'saved': True})


def config_key(mode, model):
    if mode not in MODES or model not in MODELS or (mode == MODES[1] and model != 'qwen'):
        raise ValueError('无效的模式或主模型')
    return mode + '/' + model


def selections(raw):
    if not isinstance(raw, list) or len(raw) > 20:
        raise ValueError('LoRA 配置最多包含 20 项')
    rows = []; seen = set()
    for row in raw:
        if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not row['id'].startswith('loras/') or row['id'] in seen:
            raise ValueError('无效或重复的 LoRA')
        seen.add(row['id'])
        clip = row.get('clip_strength')
        preset_id, preset_hash = row.get('preset_id', ''), row.get('preset_hash', '')
        if not isinstance(preset_id, str) or (preset_id and not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', preset_id)) or not isinstance(preset_hash, str) or (preset_hash and not re.fullmatch(r'[a-f0-9]{64}', preset_hash)):
            raise ValueError('无效预设选择')
        rows.append({'id': row['id'], 'enabled': row.get('enabled') is True,
                     'strength': number(row.get('strength', 1), 'LoRA 强度'),
                     'clip_strength': number(clip, '文本强度') if clip is not None else None,
                     'use_trigger': row.get('use_trigger') is True, 'sha256': row.get('sha256', ''),
                     'preset_id': preset_id, 'preset_hash': preset_hash})
    return rows


async def profiles(request):
    rows = json.loads(PROFILES.read_text(encoding='utf-8')) if PROFILES.exists() else {}
    if request.method == 'POST':
        body = await request.json(); key = config_key(body.get('mode'), body.get('model'))
        rows[key] = selections(body.get('items', []))
        tmp = PROFILES.with_suffix('.tmp'); tmp.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8'); tmp.replace(PROFILES)
    return web.json_response(rows)


def validate(raw, mode, model, prompt=''):
    config_key(mode, model)
    chosen = selections(raw); available = {f['id']: f for f in items()}
    errors = []; warnings = []; active = []
    def issue(target, code, message, ids):
        if not any(v['code'] == code for v in target):target.append({'code': code, 'message': message, 'ids': ids})
    for row in chosen:
        if not row['enabled'] or (row['strength'] == 0 and (row['clip_strength'] or 0) == 0):continue
        mid = row['id']; file = available.get(mid)
        if not file:
            issue(errors, 'missing:' + mid, 'LoRA 文件缺失：' + mid, [mid]);continue
        profile = file['lora']; label = file['label']; info = file['inspection']
        reason = info['error'] or ('此 LoRA 由专用工作流管理' if profile['usage'] != 'generation' else '')
        family = info['family'] or profile['family']
        if family and family != MODELS[model]:reason = '不适用于当前模型系列'
        if profile['models'] and model not in profile['models']:reason = '不适用于当前主模型版本'
        if mode not in profile['modes']:reason = '不支持当前模式'
        if reason:
            issue(errors, 'incompatible:' + mid, label + '：' + reason, [mid]);continue
        if not profile['min_strength'] <= row['strength'] <= profile['max_strength']:
            issue(errors, 'range:' + mid, label + '：强度超出允许范围', [mid])
        if row['clip_strength'] is not None and (not info['has_clip'] or not profile['min_strength'] <= row['clip_strength'] <= profile['max_strength']):
            issue(errors, 'clip:' + mid, label + '：无文本权重或文本强度超出范围', [mid])
        if not family or profile['verification'] != 'verified' or model not in profile['verified_models']:
            issue(warnings, 'unverified:' + mid, label + '：当前组合兼容性尚未验证', [mid])
        if (profile['recommended_min'] is not None and row['strength'] < profile['recommended_min']) or (profile['recommended_max'] is not None and row['strength'] > profile['recommended_max']):
            issue(warnings, 'recommended:' + mid, label + '：强度超出建议范围', [mid])
        if profile['trigger_required'] and profile['triggers'] and not row['use_trigger'] and profile['triggers'] not in prompt:
            issue(warnings, 'trigger:' + mid, label + '：未启用所需触发词', [mid])
        selected_preset = None
        if row['preset_id']:
            if profile['presets_enabled']:
                selected_preset = next((p for p in profile['presets'] if p['id'] == row['preset_id']), None)
                if selected_preset is None:
                    issue(errors, 'preset:' + mid, label + '：所选预设已移除，请重新选择或选「不使用预设」', [mid])
                elif row['preset_hash'] and row['preset_hash'] != preset_fingerprint(selected_preset):
                    issue(errors, 'preset:' + mid, label + '：预设提示词已变更，请重新选择后生成', [mid])
            elif row['preset_hash']:
                issue(errors, 'preset:' + mid, label + '：历史预设已关闭，请开启预设或取消原来的选择', [mid])
        active.append({**row, 'file': file, 'selected_preset': selected_preset})
    enabled = {r['id']: r for r in active}
    for row in active:
        profile = row['file']['lora']; mid = row['id']; label = row['file']['label']
        for dep in profile['requires']:
            if dep not in enabled:issue(errors, 'dependency:' + mid + ':' + dep, label + '：缺少已启用依赖 ' + (available.get(dep, {}).get('label') or dep), [mid, dep])
        for rule in profile['conflicts']:
            other = enabled.get(rule['id'])
            if not other or (rule['models'] and model not in rule['models']) or (rule['modes'] and mode not in rule['modes']):continue
            if rule['min_strength'] is not None and abs(row['strength']) < rule['min_strength']:continue
            code = 'conflict:' + ':'.join(sorted([mid, other['id']])) + ':' + rule['level']
            issue(errors if rule['level'] == 'error' else warnings, code, label + ' 与 ' + other['file']['label'] + '：' + rule['reason'], [mid, other['id']])
    for kind in ('character', 'style'):
        group = [r for r in active if r['file']['lora']['kind'] == kind]
        if len(group) > 1:issue(warnings, 'overlap:' + kind, '多个' + ('人物扩展可能混合身份特征' if kind == 'character' else '风格扩展可能互相干扰') + '，建议分别测试', [r['id'] for r in group])
        if kind == 'character' and group and mode == MODES[1]:issue(warnings, 'reference:character', '人物扩展可能与参考图身份互相干扰', [r['id'] for r in group])
    triggers = []
    for row in active:
        value = row['file']['lora']['triggers']
        if row['use_trigger'] and value and value not in prompt and value not in triggers:triggers.append(value)
        value = row['selected_preset']['prompt'] if row['selected_preset'] else ''
        if value and value not in prompt and value not in triggers:triggers.append(value)
    final_prompt = prompt + ('\n' + '\n'.join(triggers) if triggers else '')
    return {'errors': errors, 'warnings': warnings, 'active': active, 'items': chosen, 'final_prompt': final_prompt, 'triggers': triggers}


async def check(request):
    body = await request.json()
    result = await asyncio.to_thread(validate, body.get('items', []), body.get('mode'), body.get('model'), str(body.get('prompt', '')))
    return web.json_response({k: v for k, v in result.items() if k != 'active'})


def preset_fingerprint(preset):
    return hashlib.sha256(preset['prompt'].encode('utf-8')).hexdigest()


def prepare(body, model):
    result = validate(body.get('loras', []), body['preset'], model, str(body.get('prompt', '')))
    if result['errors']:raise ValueError(result['errors'][0]['message'])
    accepted = body.get('lora_acknowledged', [])
    if not isinstance(accepted, list) or any(w['code'] not in accepted for w in result['warnings']):
        raise ValueError('请在 LoRA 区域查看并确认兼容提示')
    snapshots = []
    for row in result['active']:
        file = row['file']; digest = fingerprint(file_path(row['id']))
        if row['sha256'] and row['sha256'] != digest:raise ValueError(file['label'] + '：文件已变更，请移除后重新添加')
        selected_preset = row['selected_preset']
        snapshots.append({**{k: v for k, v in row.items() if k not in ('file', 'selected_preset')}, 'sha256': digest,
                          'name': file['name'], 'label': file['label'], 'family': file['lora']['family'],
                          'trigger': file['lora']['triggers'] if row['use_trigger'] else '',
                          'verification': file['lora']['verification'], 'preset': selected_preset,
                          'preset_hash': preset_fingerprint(selected_preset) if selected_preset else ''})
    if len(result['final_prompt']) > 10000:raise ValueError('附加触发词后的提示词超过 10000 字')
    return {**result, 'snapshots': snapshots}


def apply(graph, snapshots):
    if not snapshots:return
    original = list(graph.values()); model = ['1', 0]; clip = ['2', 0]
    for i, row in enumerate(snapshots):
        node = 'generation_lora_' + str(i + 1)
        if node in graph:raise ValueError('LoRA 工作流节点冲突')
        clip_strength = row['clip_strength']
        if clip_strength is not None:
            graph[node] = {'class_type': 'WebUIGenerationLoraLoader', 'inputs': {'model': model, 'clip': clip, 'lora_name': row['name'], 'strength_model': row['strength'], 'strength_clip': clip_strength, 'file_sha256': row['sha256']}}
            clip = [node, 1]
        else:
            graph[node] = {'class_type': 'WebUIGenerationLoraLoaderModelOnly', 'inputs': {'model': model, 'lora_name': row['name'], 'strength_model': row['strength'], 'file_sha256': row['sha256']}}
        model = [node, 0]
    for entry in original:
        for key, value in list(entry['inputs'].items()):
            if value == ['1', 0]:entry['inputs'][key] = model
            elif value == ['2', 0]:entry['inputs'][key] = clip
