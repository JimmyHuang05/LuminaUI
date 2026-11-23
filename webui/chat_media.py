"""Validated local image attachments for LuminaGPT conversations."""
import storage_paths
import asyncio
import re
import uuid
from pathlib import Path
from aiohttp import web
import image_reader

FOLDER = storage_paths.path('data') / 'chat-images'

def image_path(identity):
    if not isinstance(identity, str) or not re.fullmatch(r'[a-f0-9]{32}', identity):
        raise ValueError('图片标识无效')
    path = FOLDER / (identity + '.jpg')
    if not path.is_file():
        raise ValueError('参考图片已不存在，请重新添加')
    return path

async def upload(request):
    reader = await request.multipart()
    part = await reader.next()
    if part is None or part.name != 'image':
        raise ValueError('请先选择图片')
    raw = bytearray()
    while chunk := await part.read_chunk():
        raw.extend(chunk)
        if len(raw) > image_reader.LIMIT:
            raise ValueError('图片不能超过20MB')
    identity = uuid.uuid4().hex
    FOLDER.mkdir(parents=True, exist_ok=True)
    path = FOLDER / (identity + '.jpg')
    try:
        await asyncio.to_thread(image_reader.prepare, raw, path)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return web.json_response({'id': identity, 'url': '/api/pe-chat/images/' + identity})

async def image(request):
    return web.FileResponse(image_path(request.match_info['id']))
