"""Shared storage roots. Saved changes activate on process restart."""
import json
import os
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = Path(__file__).with_name('storage_paths.json')
DEFAULTS = {'models': ROOT/'ComfyUI/models', 'workflows': ROOT/'workflows',
            'output': ROOT/'ComfyUI/output', 'input': ROOT/'ComfyUI/input',
            'data': ROOT/'webui/data', 'local_pe': ROOT/'models/local-vlm/qwen3.5-4b'}

def configured():
    saved = json.loads(CONFIG.read_text(encoding='utf-8')) if CONFIG.exists() else {}
    return {key: Path(saved.get(key, str(value))).resolve() for key,value in DEFAULTS.items()}

def engine_roots(argv):
    def option(name, default):
        for index, arg in enumerate(argv):
            if arg == name and index+1 < len(argv): return Path(argv[index+1]).resolve()
            if arg.startswith(name+'='): return Path(arg.split('=',1)[1]).resolve()
        return default
    base = option('--base-directory', ROOT/'ComfyUI')
    return {key: option('--'+key+'-directory', base/key) for key in ('models','input','output')}

ACTIVE = configured()
# A running engine keeps its existing directories until it is restarted.
# Use those same roots in the library and uploads, avoiding split writes.
try:
    with urllib.request.urlopen('http://127.0.0.1:18288/system_stats', timeout=2) as response:
        system = json.load(response)['system']
    ACTIVE.update(engine_roots(system['argv']))
except (OSError, ValueError, KeyError):
    pass

def path(key):
    return ACTIVE[key]

def engine_arguments():
    return [arg for key in ('models','input','output') for arg in ('--'+key+'-directory', str(path(key)))]

def save(values):
    if not isinstance(values, dict) or set(values)-set(DEFAULTS):
        raise ValueError('无效的存储目录')
    result = configured()
    for key,value in values.items():
        if not isinstance(value,str) or not value.strip() or not Path(value).is_absolute():
            raise ValueError('请输入完整的绝对路径')
        target = Path(value.strip()).resolve()
        if not target.is_dir():
            raise ValueError('目录不存在，请先创建文件夹：'+str(target))
        if target == Path(target.anchor):
            raise ValueError('请选择专用文件夹，不要直接使用磁盘根目录')
        if key == 'workflows' and not (target/'presets/manifest.json').is_file():
            raise ValueError('请先将原工作流目录的内容复制到新目录')
        if key == 'local_pe' and not all((target/name).is_file() for name in ('Qwen3.5-4B-Q4_K_M.gguf','mmproj-F16.gguf')):
            raise ValueError('本地 PE 目录需要同时包含模型与 mmproj-F16.gguf')
        if key == 'data' and target != path('data'):
            # Avoid silently starting a new library or losing saved credentials.
            missing = [p.name for p in path('data').iterdir()
                       if (p.suffix == '.json' or p.is_dir()) and not (target/p.name).exists()]
            if missing:
                raise ValueError('请先完整复制原应用数据到新目录，缺少：'+'、'.join(missing[:4]))
        try:
            with tempfile.TemporaryFile(dir=target): pass
        except OSError as error:
            raise ValueError('目录不可写：'+str(target)) from error
        result[key] = target
    for key,target in result.items():
        for other,other_path in result.items():
            if key != other and (target == other_path or target.is_relative_to(other_path)):
                raise ValueError('各存储目录不能相同或互相嵌套')
    temporary = CONFIG.with_suffix('.tmp')
    temporary.write_text(json.dumps({k:str(v) for k,v in result.items()},ensure_ascii=False,indent=2),encoding='utf-8')
    temporary.replace(CONFIG)
    return result
