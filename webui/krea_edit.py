"""Krea2 single/dual reference, blue-mask editing and outpainting."""
import storage_paths
import json, math, secrets
from pathlib import Path
from PIL import Image
from regions import input_path, save_input

ROOT=Path(__file__).resolve().parents[1]
MODELS={'krea_cutie':'moodyCutieMixFreeKrea2_v60_nvfp4.safetensors',
        'krea_mix':'moodyKrea2MixUncensoredV8SEGoes_v80_nvfp4.safetensors'}
LORA='Krea2-编辑identity_edit_v1_2.safetensors'
TASKS={'general':'单图编辑','dual':'双图编辑','local':'局部重绘','outpaint':'扩图'}

def resize(image,megapixels):
    scale=math.sqrt(megapixels*1_000_000/(image.width*image.height))
    scale=min(scale,2048/max(image.size))
    size=tuple(max(8,round(v*scale/8)*8) for v in image.size)
    return image.resize(size,Image.Resampling.LANCZOS)

def build(body,sampling):
    model=body.get('edit_model','krea_cutie')
    if model not in MODELS:raise ValueError('Qwen 编辑已停用，请刷新页面选择 Krea2')
    task=body.get('edit_task','general')
    if task not in TASKS:raise ValueError('请选择 Krea2 的单图、双图、局部重绘或扩图')
    if any(body.get(k) for k in ('annotation','transparent','anti_shift','t8_acceleration')):
        raise ValueError('Krea2 编辑不使用旧版颜色标注、透明输出或 Qwen 扩展，请刷新页面')
    if body.get('frame','original')=='outpaint' and task!='outpaint':raise ValueError('请通过扩图入口选择画幅')
    if body.get('local_edit') and task!='local':raise ValueError('请通过局部重绘入口使用选区')
    refs=body.get('references',[])
    if not isinstance(refs,list) or len(refs)!=(1 if task=='dual' else 0):
        raise ValueError('双图编辑需要一张额外参考图；其他模式仅使用主图')
    prompt=str(body.get('prompt','')).strip()
    if not prompt and task!='outpaint':raise ValueError('请填写修改要求')
    pixels=float(body.get('edit_megapixels',1))
    if not math.isfinite(pixels) or pixels not in (0.5,1,1.5,2):raise ValueError('编辑分辨率请选择 0.5、1、1.5 或 2 百万像素')
    for folder,file in [('diffusion_models',MODELS[model]),('loras',LORA),('text_encoders','qwen3vl_4b_fp8_scaled.safetensors'),('vae','qwen_image_vae.safetensors')]:
        if not (storage_paths.path('models')/folder/file).is_file():raise ValueError('缺少模型文件：'+file)
    steps,cfg,sampler,scheduler=sampling(body,{'steps':10,'cfg':1,'sampler_name':'euler','scheduler':'simple'})
    seed=int(body['seed']) if body.get('seed') not in (None,'') else secrets.randbelow(2**32)
    if not 0<=seed<2**64:raise ValueError('种子须为有效非负整数')
    with Image.open(input_path(body.get('image'))) as im:source=im.convert('RGB')
    original_size=source.size
    composite_source=body['image'];composite_mask=None;frame_info=None
    if task=='local':
        with Image.open(input_path(body.get('mask'))) as im:mask=im.convert('L')
        if mask.size!=source.size or mask.getbbox() is None:raise ValueError('请重新涂抹有效选区')
        source=Image.composite(Image.new('RGB',source.size,(0,0,255)),source,mask)
        composite_mask=body['mask']
        prompt='Remove the blue placeholder area and follow the edit instruction. Preserve the rest of image 1. '+prompt
    elif task=='outpaint':
        ratios={'16:9':16/9,'4:3':4/3,'1:1':1,'3:4':3/4,'9:16':9/16}
        ratio=ratios.get(body.get('frame_ratio','16:9'))
        if ratio is None:raise ValueError('不支持的扩图比例')
        # Bound the source before padding, then bound the complete canvas again.
        source=resize(source,pixels)
        w,h=source.size;target=(max(w,round(h*ratio)),max(h,round(w/ratio)))
        if target==source.size:raise ValueError('目标比例与原图相同，请选择不同的扩图比例')
        offset=((target[0]-w)//2,(target[1]-h)//2)
        canvas=Image.new('RGB',target,(0,0,255));canvas.paste(source,offset)
        mask=Image.new('L',target,255);mask.paste(0,(*offset,offset[0]+w,offset[1]+h))
        composite_source=save_input(canvas,'krea_canvas');composite_mask=save_input(mask,'krea_outpaint_mask')
        source=canvas;frame_info={'size':target,'offset':offset,'source_size':(w,h)}
        prompt='Remove the blue placeholder area and extend the scene naturally. Preserve the existing picture, perspective, lighting and texture. '+prompt
    source=resize(source,pixels);image=save_input(source,'krea_reference')
    graph=json.loads((storage_paths.path('workflows')/'krea2_edit_api.json').read_text('utf-8'))
    graph['1']['inputs']['unet_name']=MODELS[model]
    graph['13']['inputs']['lora_name']=LORA
    graph['10']['inputs']['image']=image
    graph['4']['inputs'].update(prompt=prompt,grounding_px=768)
    graph['6']={'class_type':'Krea2EditGroundedEncode','inputs':{'clip':['2',0],'prompt':'','image':['10',0],'grounding_px':768}}
    graph['5']['inputs'].update(width=source.width,height=source.height)
    graph['7']['inputs'].update(seed=seed,steps=steps,cfg=cfg,sampler_name=sampler,scheduler=scheduler)
    if task=='dual':
        if not isinstance(refs[0],dict):raise ValueError('图2格式无效')
        with Image.open(input_path(refs[0].get('image'))) as im:second=resize(im.convert('RGB'),pixels)
        graph['20']={'class_type':'LoadImage','inputs':{'image':save_input(second,'krea_reference_b')}}
        graph['21']={'class_type':'VAEEncode','inputs':{'pixels':['20',0],'vae':['3',0]}}
        graph['4']['inputs']['image_b']=['20',0];graph['6']['inputs']['image_b']=['20',0]
        graph['12']['inputs'].update(source_latent_b=['21',0],source_image_b=['20',0])
    meta=dict(edit_model=model,generation_model=model,edit_task=task,label='图片编辑 · Krea2 · '+TASKS[task],
        seed=seed,steps=steps,cfg=cfg,sampler_name=sampler,scheduler=scheduler,quality='pro',
        image=body['image'],references=refs,prompt=str(body.get('prompt','')),final_prompt=prompt,
        original_prompt=str(body.get('original_prompt',body.get('prompt',''))),edit_megapixels=pixels,
        width=source.width,height=source.height,original_size=original_size,
        local_edit=task in ('local','outpaint'),mask=body.get('mask'),feather=body.get('feather',8),
        frame='outpaint' if task=='outpaint' else 'original',frame_ratio=body.get('frame_ratio','16:9'),
        frame_info=frame_info,composite_source=composite_source,composite_mask=composite_mask,
        hires_local=False,crop_box=None,t8_acceleration=False,anti_shift=False,
        edit_diagnostics={'route':'krea_'+task,'model':MODELS[model],'functional_lora':LORA,
                          'strict_composite':task in ('local','outpaint'),'experimental':task in ('local','outpaint')})
    return graph,meta
