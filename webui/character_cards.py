"""Character references, stored separately from the prompt library."""
import storage_paths
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from aiohttp import web
import prompt_covers

FILE = storage_paths.path('data') / 'character_cards.json'

def read():
    return json.loads(FILE.read_text(encoding='utf-8')) if FILE.exists() else []

def reference_image(image, card):
    """Crop only explicitly configured identity references; keep the original intact."""
    from PIL import ImageOps
    image=ImageOps.exif_transpose(image).convert('RGB')
    box=card.get('reference_crop')
    if box is None:return image
    if not isinstance(box,list) or len(box)!=4 or any(type(v) not in (int,float) or not 0<=v<=1 for v in box) or not (box[0]<box[2] and box[1]<box[3]):
        raise ValueError('人物参考裁切范围无效')
    return image.crop((round(box[0]*image.width),round(box[1]*image.height),round(box[2]*image.width),round(box[3]*image.height)))


def save_card(body):
    title = body.get('title', '')
    description = body.get('card_summary', '')
    prompt = body.get('prompt', '')
    if not isinstance(prompt, str) or len(prompt) > 10000:
        raise ValueError('人物提示词最多10000字')
    tags = body.get('tags', [])
    cover = body.get('cover_id')
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 60:
        raise ValueError('请输入人物名称（最多60字）')
    if not isinstance(description, str) or len(description) > 5000:
        raise ValueError('人物描述最多5000字')
    if not isinstance(tags, list) or len(tags) > 30 or any(not isinstance(t, str) or len(t) > 60 for t in tags):
        raise ValueError('标签格式无效')
    prompt_covers.validate_id(cover)
    if not cover or not (prompt_covers.DIRECTORY / (cover + '-full.jpg')).is_file():
        raise ValueError('请上传一张参考图片')
    level = body.get('content_rating', {}).get('level', 'sfw')
    if level not in ('sfw', 'r15', 'nsfw'):
        raise ValueError('分级无效')
    rows = read()
    old = next((r for r in rows if r['id'] == body.get('id')), None)
    if body.get('id') and old is None:
        raise ValueError('人物卡不存在，请刷新')
    if old and body.get('revision') != old['revision']:
        raise ValueError('人物卡已被修改，请重新打开后编辑')
    now = datetime.now(timezone.utc).isoformat()
    row = dict(id=old['id'] if old else uuid.uuid4().hex,
               revision=(old['revision'] if old else 0) + 1,
               title=title.strip(), card_summary=description.strip(), prompt=prompt.strip(),
               tags=list(dict.fromkeys(t.strip() for t in tags if t.strip())),
               cover_id=cover, content_rating={'level': level},
               created_at=old['created_at'] if old else now,
               updated_at=now, last_used_at=now)
    crop=body.get('reference_crop',old.get('reference_crop') if old else None)
    if crop is not None:
        from PIL import Image
        reference_image(Image.new('RGB',(100,100)),{'reference_crop':crop})
        row['reference_crop']=crop
    rows = [row if r['id'] == row['id'] else r for r in rows] if old else rows + [row]
    FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = FILE.with_suffix('.tmp')
    temporary.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(FILE)
    return row

async def list_cards(request):
    return web.json_response(read())

async def update_card(request):
    # No await during read/validate/write: updates cannot interleave on the event loop.
    body = await request.json()
    return web.json_response(save_card(body))
