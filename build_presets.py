import json, urllib.request
from pathlib import Path

root=Path(__file__).parent
dest=root/'workflows/presets'
dest.mkdir(exist_ok=True)
info=json.load(urllib.request.urlopen('http://127.0.0.1:8188/object_info'))

def read(name):
    return json.loads((root/'workflows'/name).read_text(encoding='utf-8'))

def render(g, positions, titles):
    nodes=[]; links=[]; lookup={}
    for key, entry in g.items():
        spec=info[entry['class_type']]; inputs=[]; widgets=[]
        for group in ['required','optional']:
            for name,schema in spec['input'].get(group,{}).items():
                if name not in entry['inputs']: continue
                value=entry['inputs'][name];typ=schema[0]
                if isinstance(value,list):inputs.append({'name':name,'type':typ,'link':None})
                else:
                    widgets.append(value)
                    if name in ['seed','noise_seed']: widgets.append('fixed')
        for name,value in entry['inputs'].items():
            if name.startswith('images.'):
                inputs.append({'name':name,'type':'IMAGE','link':None})
        if entry['class_type']=='LoadImage':widgets.append('image')
        n={'id':int(key),'type':entry['class_type'],'title':titles.get(key,entry['class_type']),'pos':positions.get(key,[0,0]),'size':[340, max(110,80+len(widgets)*30)],'flags':{},'order':len(nodes),'mode':0,'inputs':inputs,'outputs':[{'name':name,'type':typ,'links':[]} for name,typ in zip(spec.get('output_name',spec['output']),spec['output'])],'properties':{'Node name for S&R':entry['class_type']},'widgets_values':widgets}
        if entry['class_type']=='TextEncodeQwenImage21': n['size']=[440,400]
        if entry['class_type'] in ['SaveImage','LoadImage']:n['size']=[360,430]
        nodes.append(n);lookup[key]=n
    for key,entry in g.items():
        for name,value in entry['inputs'].items():
            if not isinstance(value,list):continue
            src,slot=value;target=lookup[key];ts=next(i for i,v in enumerate(target['inputs']) if v['name']==name);lid=len(links)+1
            links.append([lid,int(src),slot,int(key),ts,lookup[src]['outputs'][slot]['type']])
            target['inputs'][ts]['link']=lid;lookup[src]['outputs'][slot]['links'].append(lid)
    return {'last_node_id':max(map(int,g)),'last_link_id':len(links),'nodes':nodes,'links':links,'groups':[],'config':{},'extra':{'ds':{'scale':0.7,'offset':[60,60]}},'version':0.4}

positions={'1':[0,0],'2':[0,180],'3':[0,380],'4':[400,0],'5':[0,560],'6':[900,0],'7':[900,180],'8':[1320,0],'9':[1320,200],'10':[0,560]}
titles={'4':'② 提示词 / 编辑指令','5':'① 输出宽高（默认 3:4）','7':'③ 种子与采样（原版 40 步）','10':'① 上传参考图片','9':'④ 保存结果'}
t2i=read('qwen21_original_api.json')
t2i['5']['inputs'].update(width=864,height=1152)
t2i['4']['inputs']['prompt']='一张写实摄影作品：圆滚滚的蓝色鲸鱼在清澈的海水中游泳，阳光穿透水面，皮肤纹理细腻，柔和电影光线，竖版构图，无文字，无水印。'
t2i['9']['inputs']['filename_prefix']='Presets/01_text_to_image'
identity=read('qwen21_character_consistency_api.json')
identity['9']['inputs']['filename_prefix']='Presets/02_character_consistency'
edit=read('qwen21_character_consistency_api.json')
edit['4']['inputs']['prompt']='编辑参考图片：保留主体的外形、面部特征、颜色、姿势和构图，把背景换成色彩丰富的水下珊瑚礁，周围增加少量热带小鱼。让光线与新环境协调，保持写实摄影风格。除明确要求修改的区域外，其余内容尽量保持不变，无文字，无水印。'
edit['9']['inputs']['filename_prefix']='Presets/03_image_edit'
upscale={
'1':{'class_type':'LoadImage','inputs':{'image':'identity_reference_example.png'}},
'2':{'class_type':'UpscaleModelLoader','inputs':{'model_name':'RealESRGAN_x4plus.pth'}},
'3':{'class_type':'ImageUpscaleWithModel','inputs':{'upscale_model':['2',0],'image':['1',0]}},
'4':{'class_type':'ImageScaleBy','inputs':{'image':['3',0],'upscale_method':'lanczos','scale_by':0.5}},
'5':{'class_type':'SaveImage','inputs':{'images':['4',0],'filename_prefix':'Presets/04_upscale'}}}
up_pos={'1':[0,0],'2':[0,480],'3':[420,0],'4':[820,0],'5':[1220,0]}
up_titles={'1':'① 上传待放大图片','2':'Real-ESRGAN 4× 模型','3':'② 分块 AI 放大','4':'③ 输出倍率：0.5=2×，1=4×','5':'④ 保存高清图片'}
manifest={'version':1,'backend':'http://127.0.0.1:8188','presets':[]}
for name,label,g,pos,t in [
('01_text_to_image','文字生图',t2i,positions,titles),
('02_character_consistency','人物一致性',identity,positions,titles),
('03_image_edit','图片编辑',edit,positions,titles),
('04_upscale','高清放大',upscale,up_pos,up_titles)]:
    w=render(g,pos,t)
    (dest/(name+'_api.json')).write_text(json.dumps(g,ensure_ascii=False,indent=2),encoding='utf-8')
    for folder in [dest,root/'ComfyUI/user/default/workflows']:
        (folder/(name+'.json')).write_text(json.dumps(w,ensure_ascii=False,indent=2),encoding='utf-8')
    fields={'image':{'node':'1' if name=='04_upscale' else '10','input':'image'}} if name!='01_text_to_image' else {}
    if name!='04_upscale':fields.update(prompt={'node':'4','input':'prompt'},seed={'node':'7','input':'seed'})
    if name=='01_text_to_image':fields.update(width={'node':'5','input':'width'},height={'node':'5','input':'height'})
    if name=='04_upscale':fields['post_scale']={'node':'4','input':'scale_by','values':{'2x':0.5,'4x':1.0}}
    manifest['presets'].append({'id':name,'label':label,'api_file':name+'_api.json','ui_file':name+'.json','fields':fields,'output_node':'5' if name=='04_upscale' else '9','tested':False})
(dest/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(dest/'使用说明.txt').write_text('四套预设工作流 v1\n在 ComfyUI 工作流列表打开 01～04，或将对应 JSON 拖入画布。每套有 UI JSON 和 API JSON，manifest.json 标明后续 WebUI 可修改的节点字段。\n\n01 文字生图：修改提示词和宽高，默认 864×1152（3:4）、单张、40 步、CFG 1。尺寸建议 32 的倍数。\n02 人物一致性：上传清晰单人照片，修改提示词的新场景段落。重点保留人物身份。默认示例为鲸鱼，真人一致性需要实际照片检验。\n03 图片编辑：上传图片，明确写出改哪里、保留哪里。默认换背景；这版为文字指令编辑，没有局部蒙版。\n02/03 输出尺寸随参考图片比例，按约一百万像素缩放；极端长宽比可能产生较大边长。\n04 高清放大：上传图片，Real-ESRGAN 分块 4 倍放大，再按比例缩小。最后缩放节点 scale_by=0.5 为最终 2 倍，1 为最终 4 倍。默认 2 倍。无需提示词。初次测试建议输入不超过约 1024 像素边长，超大图片会增加耗时和内存。\n\n生成结果在 D:\\Comfy UI\\ComfyUI\\output\\Presets。生成任务串行执行；采样种子默认固定，修改种子可生成新版本。\n前三套使用已安装的 Qwen Image 2.1 原版 INT8；高清放大使用官方 RealESRGAN_x4plus。没有额外人脸修复，避免改变人物五官。\nReal-ESRGAN 权重来源：https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth\n',encoding='utf-8')
print('Saved four presets and WebUI field manifest')
