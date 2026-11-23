"""Local, durable prompt-card covers. Never starts an image generation job."""
import storage_paths
import asyncio
import io
import math
from functools import lru_cache
import json
import re
import uuid
from pathlib import Path
from urllib.parse import urlencode

from aiohttp import web
from PIL import Image, ImageOps, UnidentifiedImageError

DIRECTORY = storage_paths.path('data') / 'prompt_covers'
MAX_BYTES = 30 * 1024 * 1024
MAX_PIXELS = 25_000_000


def validate_id(value):
    if value is not None and (not isinstance(value,str) or not re.fullmatch(r'[a-f0-9]{32}',value)):
        raise ValueError('提示词封面标识无效，请重新选择图片')


RATIOS = ('1:1','2:3','3:2','3:4','4:3','9:16','9:21','16:9','21:9')


@lru_cache(maxsize=2048)
def _recommend(directory, cover_id):
    for suffix in ('original.png','original.jpg','original.webp','full.jpg'):
        path = Path(directory)/(cover_id+'-'+suffix)
        if not path.is_file(): continue
        try:
            with Image.open(path) as im:
                width, height = im.size
                if im.getexif().get(274) in (5,6,7,8): width,height=height,width
            ratio = min(RATIOS,key=lambda r: abs(math.log((width/height)/(int(r.split(':')[0])/int(r.split(':')[1])))))
            return ratio
        except (OSError, ValueError): continue
    return None


def recommended_ratio(cover_id):
    if not cover_id: return None
    validate_id(cover_id)
    return _recommend(str(DIRECTORY),cover_id)


def save_cover(source):
    if hasattr(source,'read'):
        source.seek(0)
        original_data=source.read()
    else:
        original_data=Path(source).read_bytes()
    try:
        with Image.open(io.BytesIO(original_data)) as im:
            if im.format not in ('PNG','JPEG','WEBP'):
                raise ValueError('封面仅支持 PNG、JPEG 或 WebP 图片')
            if im.width * im.height > MAX_PIXELS:
                raise ValueError('封面不能超过 2500 万像素，请先缩小')
            original_extension={'PNG':'png','JPEG':'jpg','WEBP':'webp'}[im.format]
            im = ImageOps.exif_transpose(im)
            im.thumbnail((1600,1600),Image.Resampling.LANCZOS)
            rgba = im.convert('RGBA')
            full = Image.new('RGB',rgba.size,(28,28,28))
            full.paste(rgba,mask=rgba.getchannel('A'))
            thumbnail = ImageOps.fit(full,(144,192),method=Image.Resampling.LANCZOS)
            full_data, thumb_data = io.BytesIO(), io.BytesIO()
            full.save(full_data,format='JPEG',quality=90)
            thumbnail.save(thumb_data,format='JPEG',quality=85)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ValueError('无法读取封面，请选择完整的 PNG、JPEG 或 WebP 图片') from e
    cover_id = uuid.uuid4().hex
    DIRECTORY.mkdir(parents=True,exist_ok=True)
    original_path=DIRECTORY/(cover_id+'-original.'+original_extension)
    original_temporary=original_path.with_suffix('.tmp')
    original_temporary.write_bytes(original_data)
    original_temporary.replace(original_path)
    for variant, data in (('full',full_data),('thumb',thumb_data)):
        path = DIRECTORY / (cover_id+'-'+variant+'.jpg')
        temporary = path.with_suffix('.tmp')
        temporary.write_bytes(data.getvalue())
        temporary.replace(path)
    return {'cover_id':cover_id,'width':full.width,'height':full.height,'recommended_ratio':recommended_ratio(cover_id)}


async def upload(request):
    reader = await request.multipart()
    part = await reader.next()
    if not part or part.name != 'image': raise ValueError('请选择封面图片')
    raw = bytearray()
    while chunk := await part.read_chunk():
        raw.extend(chunk)
        if len(raw)>MAX_BYTES: raise ValueError('封面不能超过 30MB')
    return web.json_response(await asyncio.to_thread(save_cover,io.BytesIO(raw)))


def copy_output(body, jobs, output_directory):
    if not isinstance(body,dict): raise ValueError('请选择生成结果')
    job = next((j for j in jobs if j['prompt_id']==body.get('prompt_id')),None)
    index = body.get('image_index')
    if (not job or job.get('status')!='success' or type(index) is not int
            or not 0<=index<len(job.get('images',[]))):
        raise ValueError('生成结果已失效，请刷新后重新选择')
    image = job['images'][index]
    filename = image.get('filename','')
    if image.get('type')!='output' or not filename or '/' in filename or '\\' in filename:
        raise ValueError('无效生成图片')
    base = output_directory.resolve()
    path = (base/image.get('subfolder','')/filename).resolve()
    if not path.is_relative_to(base) or not path.is_file():
        raise ValueError('原图已不存在，请选择其他生成结果或上传图片')
    if path.stat().st_size>MAX_BYTES: raise ValueError('图片超过 30MB，请缩小后上传封面')
    result=save_cover(path)
    metadata={'image':image,'job':job}
    (DIRECTORY/(result['cover_id']+'-source.json')).write_text(json.dumps(metadata,ensure_ascii=False),encoding='utf-8')
    return result


async def image(request):
    cover_id, variant = request.match_info['cover_id'], request.match_info['variant']
    validate_id(cover_id)
    if variant not in ('full','thumb','source'): raise web.HTTPNotFound()
    if variant=='source':
        metadata_path=DIRECTORY/(cover_id+'-source.json')
        if metadata_path.is_file():
            metadata=json.loads(metadata_path.read_text(encoding='utf-8'))
            record=metadata.get('image',{})
            base=(storage_paths.path('output')).resolve()
            original=(base/record.get('subfolder','')/record.get('filename','')).resolve()
            if record.get('type')=='output' and original.is_relative_to(base) and original.is_file():
                return web.json_response({'url':'/image?'+urlencode({k:record.get(k,'') for k in ('filename','subfolder','type')}),'job':metadata.get('job')})
        return web.json_response({'url':f'/api/prompt-covers/{cover_id}/full','job':None})
    path = DIRECTORY/(cover_id+'-'+variant+'.jpg')
    if variant=='full':
        for extension in ('png','jpg','webp'):
            original=DIRECTORY/(cover_id+'-original.'+extension)
            if original.is_file():
                path=original
                break
    if not path.is_file(): raise web.HTTPNotFound()
    return web.FileResponse(path,headers={'Cache-Control':'private, max-age=31536000, immutable'})
