"""Automatic caption + original-image redraw for Krea2 4KHD."""
import asyncio
import math
from PIL import Image, ImageOps
from regions import input_path, save_input
import image_reader

WORKFLOW = 'moody_krea2_i2i_4khd'

def validate(body):
    if body.get('preset')!='01_text_to_image':raise ValueError('请在生成图片入口使用图片重绘 4KHD')
    if body.get('generation_model') not in ('cutie','mix_v8'):
        raise ValueError('图片重绘 4KHD 仅支持 Krea2 Cutie / Mix')
    refs=body.get('generation_references',[])
    if not isinstance(refs,list) or len(refs)!=1 or not isinstance(refs[0],dict):
        raise ValueError('图片重绘 4KHD 需要一张场景原图；人物卡可另外选择')
    source=input_path(refs[0].get('image'))
    value=body.get('redraw_creativity',49)
    if isinstance(value,bool):raise ValueError('变化程度须为 1～100')
    try:value=float(value)
    except (ValueError,TypeError):raise ValueError('变化程度须为 1～100') from None
    if not math.isfinite(value) or not 1<=value<=100:raise ValueError('变化程度须为 1～100')
    body['redraw_creativity']=value
    return source

async def prepare(body):
    source=validate(body)
    caption,model=await image_reader.recognize(source,'qwen')
    if not caption.strip() or len(caption)>8000:raise ValueError('图片描述无效，请重试')
    user=str(body.get('prompt','')).strip()
    body.update(redraw_user_prompt=user,generated_caption=caption,caption_model=model)
    body['prompt']='Recreate the composition, pose, clothing, lighting and atmosphere described below.\n'+caption
    if user:body['prompt']+='\nAdditional instructions (take priority):\n'+user
    if len(body['prompt'])>10000:raise ValueError('自动描述与补充要求合计超过 10000 字')

def attach(graph,body,max_side):
    source=validate(body)
    with Image.open(source) as original:
        image=ImageOps.exif_transpose(original).convert('RGB')
        scale=max_side/max(image.size)
        width,height=(max(32,round(v*scale/32)*32) for v in image.size)
        image=image.resize((width,height),Image.Resampling.LANCZOS)
        name=save_input(image,'krea_redraw')
    graph['redraw_image']={'class_type':'LoadImage','inputs':{'image':name}}
    graph['5']={'class_type':'VAEEncode','inputs':{'pixels':['redraw_image',0],'vae':['3',0]}}
    value=body['redraw_creativity']
    graph['7']['inputs'].update(denoise=value/100,steps=7 if value<=50 else 9)
    # A card supplies identity; the original image supplies scene structure.
    reference_body={**body,'generation_references':[]}
    if body.get('character_card_id'):
        reference_body['generation_references']=[{'image':name,'role':'custom','description':'Use only the composition, pose, clothing, background and lighting. Do not copy the person identity.'}]
    return width,height,reference_body
