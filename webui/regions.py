"""Reference crops and masked compositing for the local workbench."""
import storage_paths
import base64, io, math, uuid
from pathlib import Path
from PIL import Image, ImageFilter, ImageChops

ROOT=Path(__file__).resolve().parents[1]
INPUT=storage_paths.path('input')/'webui'
INPUT.mkdir(exist_ok=True)

def input_path(name):
    path=(storage_paths.path('input')/str(name)).resolve()
    if not str(name).startswith('webui/') or not path.is_relative_to(INPUT.resolve()) or not path.is_file():
        raise ValueError('请先上传参考图片')
    return path

def save_input(image,prefix):
    name=prefix+'_'+uuid.uuid4().hex+'.png'
    image.save(INPUT/name)
    return 'webui/'+name

def prepare_reference(name,resolution):
    """Match Qwen's 32px grid on CPU, with an independent budget per image."""
    with Image.open(input_path(name)) as source:
        ratio=source.width/source.height
        width=max(32,round(math.sqrt(resolution*resolution*ratio)/32)*32)
        height=max(32,round(math.sqrt(resolution*resolution/ratio)/32)*32)
        if max(width,height)>1536:
            factor=1536/max(width,height)
            width=max(32,round(width*factor/32)*32);height=max(32,round(height*factor/32)*32)
        destination=INPUT/(Path(name).stem+f'_ref_{width}x{height}.png')
        if not destination.exists():source.convert('RGBA' if 'A' in source.getbands() else 'RGB').resize((width,height),Image.Resampling.LANCZOS).save(destination)
    return 'webui/'+destination.name

def crop_reference(name,rect):
    if not isinstance(rect,list) or len(rect)!=4:raise ValueError('身份区域格式错误')
    coords=[float(v) for v in rect]
    if any(not math.isfinite(v) or v<0 or v>1 for v in coords):raise ValueError('身份区域须在图片内')
    x,y,w,h=coords
    if w<=0 or h<=0 or x+w>1.00001 or y+h>1.00001:raise ValueError('请重新框选身份区域')
    with Image.open(input_path(name)) as image:
        box=(round(x*image.width),round(y*image.height),min(image.width,round((x+w)*image.width)),min(image.height,round((y+h)*image.height)))
        if box[2]-box[0]<32 or box[3]-box[1]<32:raise ValueError('身份区域太小，请至少框选 32×32 像素')
        return save_input(image.convert('RGB').crop(box),'identity_crop')

def save_mask(name,data_url):
    if not isinstance(data_url,str) or not data_url.startswith('data:image/png;base64,'):raise ValueError('选区须为 PNG 图片')
    try:raw=base64.b64decode(data_url.split(',',1)[1],validate=True)
    except Exception:raise ValueError('选区数据无效')
    if len(raw)>8*1024*1024:raise ValueError('选区文件过大')
    with Image.open(io.BytesIO(raw)) as mask:
        if mask.width*mask.height>4_000_000:raise ValueError('选区画布过大')
        mask=mask.convert('L')
        with Image.open(input_path(name)) as original:
            ratio=original.width/original.height
            if abs(mask.width/mask.height-ratio)>max(0.01,ratio*0.01):raise ValueError('选区与参考图片比例不符')
            mask=mask.resize(original.size,Image.Resampling.NEAREST)
        mask=mask.point(lambda v:255 if v>=128 else 0)
        if mask.getbbox() is None:raise ValueError('请先涂抹需要修改的区域')
        return save_input(mask,'edit_mask')

def mask_reference(name,mask_name):
    with Image.open(input_path(name)) as im, Image.open(input_path(mask_name)) as mask:
        im=im.convert('RGB');mask=mask.convert('L')
        if im.size!=mask.size:raise ValueError('选区与参考图片尺寸不符')
        marked=Image.blend(im,Image.new('RGB',im.size,(255,70,80)),0.48)
        return save_input(Image.composite(marked,im,mask),'edit_region_hint')

def composite(original,generated,mask_name,feather,destination,crop_box=None,inset_feather=False,smooth_edges=False):
    with Image.open(input_path(original)) as src,Image.open(generated) as result,Image.open(input_path(mask_name)) as mask:
        src=src.convert('RGBA' if 'A' in src.getbands() else 'RGB');result=result.convert(src.mode);mask=mask.convert('L')
        if crop_box:
            x,y,right,bottom=crop_box;patch=result.resize((right-x,bottom-y),Image.Resampling.LANCZOS);result=src.copy();result.paste(patch,(x,y))
        else:result=result.resize(src.size,Image.Resampling.LANCZOS)
        if mask.size!=src.size:raise ValueError('选区与原图尺寸不符')
        # Feather strictly inside the selected region; outside stays pixel-identical.
        bounds=mask.getbbox()
        radius=max(1,min(round(feather),max(1,min(bounds[2]-bounds[0],bounds[3]-bounds[1])//8))) if bounds else 1
        # Blur the original selection, not an eroded one: erosion brought old
        # objects back several pixels inside the selected boundary.
        # Clamp to the original mask so pixels outside remain untouched.
        alpha=ImageChops.darker(mask,mask.filter(ImageFilter.GaussianBlur(max(.5,radius/2)))) if feather else mask
        if feather and smooth_edges and not inset_feather:
            import numpy as np
            from scipy.ndimage import distance_transform_edt
            # Ramp from the inside boundary instead of abruptly clipping a ~50%
            # Gaussian alpha at the mask edge. Never write outside the user mask.
            selected=np.asarray(mask)>0
            distance=distance_transform_edt(np.pad(selected,1,mode='edge'))[1:-1,1:-1] if not selected.all() else np.full(selected.shape,radius)
            t=np.clip(distance/max(1,radius/2),0,1)
            alpha=ImageChops.darker(mask,Image.fromarray(np.rint(255*t*t*(3-2*t)).astype('uint8')))
        if feather and inset_feather:
            inner=mask.filter(ImageFilter.MinFilter(radius*2+1))
            alpha=ImageChops.darker(mask,inner.filter(ImageFilter.GaussianBlur(max(.5,radius/2))))
        Image.composite(result,src,alpha).save(destination)


def composite_outpaint(original,generated,mask_name,destination):
    # The expanded canvas contains placeholder gray, not real pixels to feather.
    composite(original,generated,mask_name,0,destination)


def local_blend_pixels(mask,resolution):
    bounds=mask.getbbox()
    if bounds is None:return 32
    span=(max(bounds[2]-bounds[0],bounds[3]-bounds[1])+100)*1.2
    # Stitch blurs again in processing pixels; compensate only when cropping down.
    return max(1,min(32,round(32/max(1,span/resolution))))


def save_annotation(name,data_url):
    input_path(name)
    if not isinstance(data_url,str) or not data_url.startswith('data:image/png;base64,'):raise ValueError('标注须为 PNG')
    raw=base64.b64decode(data_url.split(',',1)[1],validate=True)
    if len(raw)>8*1024*1024:raise ValueError('标注图过大')
    with Image.open(io.BytesIO(raw)) as image:
        if image.width*image.height>4_000_000:raise ValueError('标注画布过大')
        return save_input(image.convert('RGB'),'annotation')


def outpaint_reference(name,ratio):
    ratios={'3:4':3/4,'4:3':4/3,'1:1':1,'9:16':9/16,'16:9':16/9,'2:3':2/3,'3:2':3/2,'9:21':9/21,'21:9':21/9}
    if ratio not in ratios:raise ValueError('无效扩图比例')
    with Image.open(input_path(name)) as image:
        image=image.convert('RGB');r=ratios[ratio];w,h=image.size
        if w/h<r:w=round(h*r)
        else:h=round(w/r)
        if w*h>25_000_000:raise ValueError('扩图画幅过大，请先缩小图片')
        x=(w-image.width)//2;y=(h-image.height)//2
        canvas=Image.new('RGB',(w,h),(128,128,128));canvas.paste(image,(x,y));mask=Image.new('L',(w,h),255)
        mask.paste(0,(x,y,x+image.width,y+image.height))
        if mask.getextrema()[0]==255 or mask.getbbox() is None:raise ValueError('所选比例与原图相同，请选择其他比例')
        return save_input(canvas,'outpaint_canvas'),save_input(mask,'edit_mask'),[x,y,image.width,image.height]


def local_crop(name,mask_name,padding=96):
    with Image.open(input_path(name)) as image,Image.open(input_path(mask_name)) as mask:
        mask=mask.convert('L')
        if mask.size!=image.size:raise ValueError('选区与原图尺寸不符')
        bbox=mask.getbbox()
        if bbox is None:raise ValueError('选区为空')
        x,y,right,bottom=bbox
        cx=(x+right)//2;cy=(y+bottom)//2;w=max(256,right-x+padding*2);h=max(256,bottom-y+padding*2)
        x=max(0,min(image.width-w,cx-w//2));y=max(0,min(image.height-h,cy-h//2));right=min(image.width,x+w);bottom=min(image.height,y+h)
        box=(x,y,right,bottom)
        # Work at about one megapixel; bound extreme aspect ratios and align VAE geometry.
        patch=image.crop(box);selection=mask.crop(box)
        ratio=patch.width/patch.height
        scale=min(1024/math.sqrt(patch.width*patch.height),1536/max(patch.size))
        size=tuple(max(32,round(v*scale/32)*32) for v in patch.size)
        patch=patch.resize(size,Image.Resampling.LANCZOS)
        selection=selection.resize(size,Image.Resampling.NEAREST)
        return save_input(patch,'local_crop'),save_input(selection,'edit_mask'),list(box)


def restore_size(original,generated,destination):
    with Image.open(input_path(original)) as source,Image.open(generated) as result:
        result.resize(source.size,Image.Resampling.LANCZOS).save(destination)
