"""Versioned, local LoRA profiles and the opt-in Pro Mix text-to-image adapter."""
import storage_paths
import asyncio
import copy
import hashlib
import json
import math
import shutil
import threading
from pathlib import Path

from aiohttp import web
from safetensors import safe_open, SafetensorError
import lora_manager as legacy

REGISTRY = storage_paths.path('data') / 'lora_library_v2.json'
LOCK = threading.Lock()
RECIPE = 'moody_zit_simple'
MODEL_FILE = 'moodyProMix_collectorsEdition_fp8.safetensors'
RECIPE_VERSION = 1
CATEGORIES = {'character':'角色', 'style':'风格', 'concept':'概念', 'clothing':'服装',
              'base':'基础模型', 'background':'背景', 'pose':'姿势', 'tool':'工具',
              'vehicle':'车辆', 'asset':'资产', 'building':'建筑', 'object':'对象',
              'animal':'动物', 'action':'行动', 'other':'其他'}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode()).hexdigest()


def read_registry():
    if not REGISTRY.exists():
        return {'schema':2, 'revision':0, 'profiles':{}}
    data = json.loads(REGISTRY.read_text(encoding='utf-8'))
    if data.get('schema') != 2 or not isinstance(data.get('profiles'), dict):
        raise ValueError('LoRA 档案版本不支持；原文件已保留，请勿覆盖')
    return data


def inspect(path):
    result = {'error':'', 'declared':'', 'family':'unknown', 'has_clip':False}
    try:
        if path.suffix.lower() != '.safetensors':
            raise ValueError('仅支持 safetensors 文件')
        with safe_open(str(path), framework='numpy') as f:
            keys = list(f.keys())
            meta = f.metadata() or {}
        if not any('lora_' in k.lower() or '.lora.' in k.lower() for k in keys):
            raise ValueError('未发现普通 LoRA 权重；此版本尚不支持其他适配器格式')
        declared = ' '.join(str(meta.get(k, '')) for k in
                            ('ss_base_model_version', 'modelspec.architecture', 'ss_sd_model_name')).lower()
        normalized = declared.replace('_', '').replace('-', '').replace(' ', '')
        family = ('zimage_base' if 'zimagebase' in normalized else 'zimage' if 'zimage' in normalized else
                  'qwen' if 'qwen' in normalized else
                  'krea2' if 'krea2' in normalized else
                  'other' if any(x in normalized for x in ('sdxl','sdv1','sdv2','flux','sd3')) else 'unknown')
        result.update(declared=declared, family=family,
                      has_clip=any(k.lower().startswith(('lora_te','text_encoder','clip.')) for k in keys))
    except (SafetensorError, ValueError, OSError) as e:
        result['error'] = str(e)
    return result


def eligibility(file):
    if not file['installed']: return '文件未安装'
    if file['internal']: return '专用编辑扩展，不属于生图效果 LoRA'
    if file['inspection']['error']: return file['inspection']['error']
    if file['inspection']['family'] not in ('zimage', 'unknown'): return '文件声明的模型架构与 ZImage 不匹配'
    p = file['profile']
    if not p: return '待配置用途与兼容资料'
    if file['sha256'] != p['sha256']: return '文件已变更，请重新核对兼容资料'
    if p['category'] not in ('style', 'character'): return '当前试运行支持风格或人物 LoRA'
    if p['base_family'] != 'zimage_turbo': return '尚未声明适用于 ZImage Turbo'
    if p['models'] != ['pro_mix'] or p['recipes'] != [RECIPE]: return '尚未声明适用于 Pro Mix / ZIT Simple'
    if p['patch_target'] == 'model_only' and file['inspection']['has_clip']: return '检测到文本权重，请核对加载目标'
    return ''


def catalog():
    registry = read_registry()
    rows = []
    for group in legacy.model_inventory()['groups']:
        if group['name'] != 'loras': continue
        for item in group['files']:
            mid = item['id']
            p = registry['profiles'].get(mid)
            row = {k:item[k] for k in ('id','name','installed')}
            row.update(label=item.get('label',Path(item['name']).stem),profile=p,
                       internal=Path(item['name']).name in legacy.INTERNAL,sha256='')
            if row['installed']:
                try:
                    path = legacy.file_path(mid)
                    row['inspection'] = inspect(path)
                    if p: row['sha256'] = legacy.fingerprint(path)
                except (ValueError, OSError) as e:
                    row['inspection'] = {'error':str(e), 'has_clip':False, 'family':'unknown'}
            else:
                row['inspection'] = {'error':'文件未安装', 'has_clip':False, 'family':'unknown'}
            row['reason'] = eligibility(row)
            rows.append(row)
    return {'schema':2, 'revision':registry['revision'], 'items':rows, 'categories':CATEGORIES,
            'recipe':{'id':RECIPE, 'version':RECIPE_VERSION, 'model':'pro_mix',
                      'mode':'01_text_to_image', 'max_active':1,
                      'stages':['base','refine'], 'status':'awaiting_visual_validation'}}


def number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int,float)) or not math.isfinite(value):
        raise ValueError(name + '必须是有效数字')
    if not -100 <= value <= 100: raise ValueError(name + '超出加载器范围 -100～100')
    return float(value)


def save_profile(body):
    if not isinstance(body,dict): raise ValueError('档案内容无效')
    mid = body.get('id')
    path = legacy.file_path(mid)
    if path.name in legacy.INTERNAL: raise ValueError('专用编辑扩展不允许改为普通生图效果')
    info = inspect(path)
    if info['error']: raise ValueError(info['error'])
    raw = body.get('profile')
    if not isinstance(raw, dict): raise ValueError('档案内容无效')
    category = raw.get('category','other')
    if category not in CATEGORIES: raise ValueError('无效用途分类')
    family = raw.get('base_family','unknown')
    if family not in ('unknown','zimage_turbo','zimage_base','qwen','krea2','other'):
        raise ValueError('无效底模系列')
    if family == 'zimage_turbo' and info['family'] not in ('zimage','unknown'):
        raise ValueError('文件声明与所选 ZImage Turbo 架构冲突')
    target = raw.get('patch_target','model_only')
    if target not in ('model_only','model_clip'): raise ValueError('无效加载目标')
    low = number(raw.get('min_strength',0),'最小强度')
    high = number(raw.get('max_strength',2),'最大强度')
    default = number(raw.get('default_strength',1),'默认强度')
    if not low <= default <= high: raise ValueError('默认强度必须在配置范围内')
    evidence = str(raw.get('evidence','')).strip()
    trigger = str(raw.get('trigger','')).strip()
    label = str(raw.get('label',path.stem)).strip()
    if not label or len(label)>120 or len(evidence)>2000 or len(trigger)>2000:
        raise ValueError('名称或说明长度无效')
    confirmed = raw.get('pro_mix_compatible') is True
    if confirmed and (family != 'zimage_turbo' or not evidence):
        raise ValueError('请填写 ZImage Turbo / Pro Mix 的兼容依据；不能仅凭分类判断')
    sha = legacy.fingerprint(path)
    with LOCK:
        registry = read_registry()
        if body.get('revision') != registry['revision']:
            raise web.HTTPConflict(text=json.dumps({'error':'LoRA 档案已被其他页面更新，请刷新列表后重试'},ensure_ascii=False),content_type='application/json')
        previous = registry['profiles'].get(mid,{})
        p = {'label':label,'category':category,'base_family':family,'patch_target':target,
             'models':['pro_mix'] if confirmed else [], 'recipes':[RECIPE] if confirmed else [],
             'default_strength':default,'min_strength':low,'max_strength':high,
             'trigger':trigger,'evidence':evidence,'sha256':sha,
             'revision':previous.get('revision',0)+1,
             'verification':{'declared':bool(evidence),'runtime':False,'visual':False}}
        registry['profiles'][mid] = p
        registry['revision'] += 1
        REGISTRY.parent.mkdir(exist_ok=True, parents=True)
        if REGISTRY.exists(): shutil.copy2(REGISTRY, REGISTRY.with_suffix('.json.bak'))
        temporary = REGISTRY.with_suffix('.tmp')
        temporary.write_text(json.dumps(registry,ensure_ascii=False,indent=2),encoding='utf-8')
        temporary.replace(REGISTRY)
    return {'saved':True,'revision':registry['revision'],'profile':p}


def selections(raw):
    if not isinstance(raw,list) or len(raw)>20: raise ValueError('LoRA 选择列表无效')
    result = []
    seen = set()
    for row in raw:
        if not isinstance(row,dict) or not isinstance(row.get('id'),str): raise ValueError('LoRA 选择无效')
        if row['id'] in seen: raise ValueError('同一 LoRA 不能重复添加')
        seen.add(row['id'])
        if not isinstance(row.get('enabled',True),bool) or not isinstance(row.get('use_trigger',True),bool):
            raise ValueError('LoRA 开关值无效')
        result.append({'id':row['id'],'enabled':row.get('enabled',True),
                       'strength':number(row.get('strength',1),'模型强度'),
                       'clip_strength':None if row.get('clip_strength') is None else number(row['clip_strength'],'文本强度'),
                       'use_trigger':row.get('use_trigger',True), 'sha256':row.get('sha256',''),
                       'profile_revision':row.get('profile_revision')})
    return result


def validate(body):
    if not isinstance(body,dict): raise ValueError('LoRA 请求无效')
    config = body.get('lora_v2',{'schema':2,'recipe':RECIPE,'items':[]})
    if not isinstance(config,dict) or config.get('schema') != 2: raise ValueError('LoRA 配置版本无效')
    rows = selections(config.get('items',[]))
    active = [r for r in rows if r['enabled'] and (r['strength'] or r['clip_strength'])]
    result = {'schema':2,'recipe':RECIPE,'recipe_version':RECIPE_VERSION,'items':rows,
              'snapshots':[],'warnings':[],'original_prompt':str(body.get('prompt','')),
              'trigger_prompt':'','final_prompt':str(body.get('prompt','')),'acknowledgement':''}
    if not active: return result
    if (body.get('preset') != '01_text_to_image' or body.get('generation_model') != 'pro_mix'
            or body.get('generation_workflow') != RECIPE or config.get('recipe') != RECIPE):
        raise ValueError('LoRA 试运行仅支持 Pro Mix 文生图 / Moody ZIT Simple')
    if len(active)>1: raise ValueError('当前试运行只支持同时启用一个风格或人物 LoRA；请关闭其他效果')
    files = {f['id']:f for f in catalog()['items']}
    triggers = []
    for row in active:
        f = files.get(row['id'])
        if not f: raise ValueError('LoRA 已不存在：'+row['id'])
        if f['reason']: raise ValueError(f['label']+'：'+f['reason'])
        p = f['profile']
        if row['sha256'] != f['sha256'] or row['profile_revision'] != p['revision']:
            raise ValueError(p['label']+'：档案或文件已变更，请重新添加此效果')
        if p['patch_target']=='model_only' and row['clip_strength'] not in (None,0):
            raise ValueError('此 LoRA 仅作用于模型，没有文本编码器强度')
        if p['patch_target']=='model_clip' and row['clip_strength'] is None:
            raise ValueError('请明确设置文本编码器强度')
        weights = [row['strength']] + ([row['clip_strength']] if row['clip_strength'] is not None else [])
        if any(not p['min_strength']<=v<=p['max_strength'] for v in weights):
            raise ValueError('强度超出此 LoRA 档案范围')
        trigger = p['trigger'] if row['use_trigger'] else ''
        if trigger and trigger.casefold() not in result['original_prompt'].casefold(): triggers.append(trigger)
        snapshot = {**copy.deepcopy(row),'label':p['label'],'name':row['id'][6:],
                    'category':p['category'],'family':p['base_family'],'patch_target':p['patch_target'],
                    'stages':['base','refine'],'trigger':trigger,'profile':copy.deepcopy(p),
                    'recipe_version':RECIPE_VERSION,'base_model_file':MODEL_FILE}
        result['snapshots'].append(snapshot)
        result['warnings'].append('仅依据兼容资料，尚未完成当前组合的实图验证；首次生成可能因参数不匹配而失败。')
    result['trigger_prompt'] = '\n'.join(triggers)
    if triggers: result['final_prompt'] += '\n' + result['trigger_prompt']
    if len(result['final_prompt'])>10000: raise ValueError('附加触发词后提示词超过 10000 字')
    result['acknowledgement'] = digest({'snapshots':result['snapshots'],'warnings':result['warnings']})
    return result


def prepare(body):
    result = validate(body)
    if result['warnings'] and body['lora_v2'].get('acknowledgement') != result['acknowledgement']:
        raise ValueError('请先确认此 LoRA 尚未实图验证的提示')
    return result


def apply(graph, result):
    if not result['snapshots']: return
    expected = {'1':'UNETLoader','2':'CLIPLoader','4':'CLIPTextEncode','6':'ModelSamplingAuraFlow',
                '7':'KSamplerAdvanced','12':'KSamplerAdvanced'}
    if any(graph.get(k,{}).get('class_type') != v for k,v in expected.items()):
        raise ValueError('ZIT Simple 工作流结构已变更，LoRA 接口需要重新验证')
    if (graph['1']['inputs'].get('unet_name') != MODEL_FILE
            or graph['2']['inputs'].get('clip_name') != 'qwen_3_4b.safetensors'
            or graph['6']['inputs'].get('model') != ['1',0]
            or graph['4']['inputs'].get('clip') != ['2',0]
            or any(graph[k]['inputs'].get('model') != ['6',0] for k in ('7','12'))
            or 'generation_v2_lora' in graph):
        raise ValueError('ZIT Simple 模型或接线不符合 LoRA 适配器约定')
    row = result['snapshots'][0]
    inputs = {'model':['1',0],'lora_name':row['name'],'strength_model':row['strength'],
              'file_sha256':row['sha256']}
    kind = 'WebUIGenerationLoraLoaderModelOnly'
    if row['patch_target']=='model_clip':
        kind = 'WebUIGenerationLoraLoader'
        inputs.update(clip=['2',0],strength_clip=row['clip_strength'])
        graph['4']['inputs']['clip'] = ['generation_v2_lora',1]
    graph['generation_v2_lora'] = {'class_type':kind,'inputs':inputs}
    graph['6']['inputs']['model'] = ['generation_v2_lora',0]


async def library(request):
    return web.json_response(await asyncio.to_thread(catalog))


async def edit_profile(request):
    return web.json_response(await asyncio.to_thread(save_profile,await request.json()))


async def check(request):
    return web.json_response(await asyncio.to_thread(validate,await request.json()))
