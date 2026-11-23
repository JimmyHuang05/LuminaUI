"""Bounded GGUF metadata inspection and streamed, atomic local-model imports."""
import asyncio
import json
import shutil
import struct
import uuid
from pathlib import Path
from aiohttp import web
import pe_models
import storage_paths

MAX_FILE = 64 * 1024**3
IMPORT_LOCK = asyncio.Lock()


def inspect(path):
    path = Path(path)
    size = path.stat().st_size
    with path.open('rb') as f:
        def read(n):
            if n < 0 or f.tell() + n > min(size, 128 * 1024**2):
                raise ValueError('GGUF 元数据损坏或过大')
            data = f.read(n)
            if len(data) != n:
                raise ValueError('GGUF 文件不完整')
            return data
        def number(fmt):
            return struct.unpack('<' + fmt, read(struct.calcsize('<' + fmt)))[0]
        def string(keep=True):
            n = number('Q')
            if n > 16 * 1024**2:
                raise ValueError('GGUF 字段长度异常')
            data = read(n)
            return data.decode('utf-8', errors='replace') if keep else None
        def value(kind, keep, depth=0):
            formats = {0:'B',1:'b',2:'H',3:'h',4:'I',5:'i',6:'f',7:'?',10:'Q',11:'q',12:'d'}
            if kind in formats:
                result = number(formats[kind])
                return result if keep else None
            if kind == 8:
                return string(keep)
            if kind == 9 and depth < 2:
                element, count = number('I'), number('Q')
                if count > 2000000:
                    raise ValueError('GGUF 数组过大')
                for _ in range(count):
                    value(element, False, depth + 1)
                return None
            raise ValueError('无法识别的 GGUF 元数据类型')
        if read(4) != b'GGUF' or number('I') not in (2, 3):
            raise ValueError('请选择有效的 GGUF 模型文件（不支持 safetensors、压缩包或重命名文件）')
        tensors, count = number('Q'), number('Q')
        if not 0 < tensors < 200000 or count > 100000:
            raise ValueError('GGUF 文件头无效')
        metadata = {}
        for _ in range(count):
            key = string()
            keep = key.startswith(('general.', 'split.')) or key.endswith(('.context_length', '.embedding_length', '.projection_dim')) or key.startswith('clip.has_')
            result = value(number('I'), keep)
            if keep and result is not None:
                metadata[key] = result
        offsets = []
        for _ in range(tensors):
            string(False)
            dims = number('I')
            if not 1 <= dims <= 4:
                raise ValueError('GGUF 张量维度无效')
            for _ in range(dims):
                if not number('Q'):
                    raise ValueError('GGUF 张量为空')
            number('I')
            offsets.append(number('Q'))
        alignment = metadata.get('general.alignment', 32)
        if not isinstance(alignment, int) or alignment <= 0 or alignment > 4096:
            raise ValueError('GGUF 对齐参数无效')
        start = (f.tell() + alignment - 1) // alignment * alignment
        if start + max(offsets) >= size:
            raise ValueError('GGUF 文件不完整，缺少模型权重')
    arch = metadata.get('general.architecture')
    if not isinstance(arch, str) or not arch:
        raise ValueError('GGUF 缺少模型架构信息')
    if metadata.get('split.count', 1) > 1 or '-00001-of-' in path.name:
        raise ValueError('请先合并分片 GGUF，再导入单个完整模型')
    projector = arch in ('clip', 'siglip') or metadata.get('general.type') == 'mmproj'
    return {'architecture': arch, 'name': metadata.get('general.name') or path.stem,
            'projector': projector, 'bytes': size, 'metadata': metadata}


def register(files, target=None, inspected=None):
    inspected = inspected if inspected is not None else [(path, inspect(path)) for path in files]
    models = [(p, m) for p, m in inspected if not m['projector']]
    projectors = [(p, m) for p, m in inspected if m['projector']]
    state = pe_models.load()
    existing = next((r for r in state['models'] if r['id'] == target and r['kind'] == 'local'), None)
    if target and not existing:
        raise ValueError('目标本地模型不存在')
    if (not target and len(models) != 1) or (target and models) or len(projectors) > 1:
        raise ValueError('每次导入一个主模型，可同时选择一个配套 mmproj 视觉文件')
    if target and len(projectors) != 1:
        raise ValueError('请选择此模型配套的 mmproj 视觉文件')
    if existing:
        row = dict(existing)
    else:
        model, info = models[0]
        arch = info['architecture']
        context = info['metadata'].get(arch + '.context_length', 8192)
        if not isinstance(context, int) or context < 512:
            context = 8192
        row = {'id': 'local-' + uuid.uuid4().hex, 'kind': 'local', 'name': info['name'][:100],
               'model': info['name'][:200], 'architecture': arch, 'context_length': min(context, 16384),
               'embedding_length': info['metadata'].get(arch + '.embedding_length'), 'vision': False,
               'model_path': str(model), 'projector_path': ''}
    if projectors:
        projector, info = projectors[0]
        output = info['metadata'].get('clip.vision.projection_dim')
        embedding = row.get('embedding_length')
        if output and embedding and output != embedding:
            raise ValueError('视觉文件与主模型维度不匹配，请选择同一模型的 mmproj 文件')
        row.update(projector_path=str(projector), vision=True)
    row['verified'] = False
    state['models'] = [r for r in state['models'] if r['id'] != row['id']] + [row]
    if not state['default_id']:
        state['default_id'] = row['id']
    pe_models.save(state)
    return row


async def upload(request):
    if IMPORT_LOCK.locked():
        raise ValueError('已有模型正在导入，请等待完成')
    async with IMPORT_LOCK:
        folder = storage_paths.path('local_pe') / 'imports' / uuid.uuid4().hex
        folder.mkdir(parents=True)
        committed = False
        try:
            reader = await request.multipart()
            files = []
            total = 0
            while (part := await reader.next()) is not None:
                name = part.filename
                if not name or Path(name).name != name or '\\' in name or ':' in name or not name.lower().endswith('.gguf'):
                    raise ValueError('只能导入 .gguf 模型文件')
                if len(files) >= 2 or any(p.name == name for p in files):
                    raise ValueError('每次最多选择一个主模型和一个视觉文件')
                path = folder / name
                received = 0
                with path.open('xb') as output:
                    while chunk := await part.read_chunk(1024 * 1024):
                        received += len(chunk)
                        total += len(chunk)
                        if received > MAX_FILE or total > MAX_FILE:
                            raise ValueError('单次导入最多 64 GB')
                        await asyncio.to_thread(output.write, chunk)
                files.append(path)
            if not files:
                raise ValueError('请选择模型文件')
            # Inspection runs off the event loop; registry mutation stays serialized on it.
            metadata = await asyncio.gather(*(asyncio.to_thread(inspect, p) for p in files))
            row = register(files, request.query.get('target'), list(zip(files, metadata)))
            committed = True
            return web.json_response(pe_models.public() | {'imported_id': row['id']})
        finally:
            if not committed:
                await asyncio.to_thread(shutil.rmtree, folder, True)
