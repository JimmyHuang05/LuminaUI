import storage_paths
import json,re,time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=storage_paths.path('output')
MODES={'01_text_to_image':'文生图','02_character_consistency':'图生图','03_image_edit':'图片编辑','04_upscale':'图片放大'}
INPUT_NAMES=storage_paths.path('data')/'input_names.json'

def remember_input(name,original):
    data=json.loads(INPUT_NAMES.read_text(encoding='utf-8')) if INPUT_NAMES.exists() else {}
    data[name]=Path(original.replace('\\','/')).name
    temp=INPUT_NAMES.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(INPUT_NAMES)

def set_output_folder(graph,mode):
    for node in graph.values():
        if node['class_type']=='SaveImage':node['inputs']['filename_prefix']=MODES[mode]+'/pending'

def finalize_outputs(job):
    folder=OUTPUT/MODES[job['preset']];folder.mkdir(parents=True,exist_ok=True)
    if job['preset']=='04_upscale':
        names=json.loads(INPUT_NAMES.read_text(encoding='utf-8')) if INPUT_NAMES.exists() else {}
        source=names.get(job['image'],Path(job['image']).name)
        stem=Path(source).stem+'_'+str(job.get('scale','2x')).lower()
    else:
        model={'krea_cutie':'Krea2_Edit_Cutie','krea_mix':'Krea2_Edit_Mix_v8','cutie':'Krea2_Cutie_v6','mix_v8':'Krea2_Mix_v8','pro_mix':'ZIT_Moody_Pro_Mix','qwen':'Qwen_Image_2.1','ray':'Ray_Qwen2.1_v1_INT8_Convrot'}.get(job.get('generation_model'),'Qwen_Image_2.1')
        stem=model+'_'+time.strftime('%Y%m%d%H%M%S',time.localtime(job['finished']))
    stem=re.sub(r'[<>:"/\\|?*\x00-\x1f]','_',stem).rstrip(' .')[:180] or 'image'
    for image in job['images']:
        if image.get('type')!='output':continue
        source=(OUTPUT/image.get('subfolder','')/image['filename']).resolve()
        if not source.is_relative_to(OUTPUT.resolve()) or not source.is_file():raise ValueError('输出图片不存在或路径无效')
        target=folder/(stem+source.suffix);index=1
        while target.exists():target=folder/(stem+f'_{index:02d}'+source.suffix);index+=1
        source.rename(target)
        image.update(filename=target.name,subfolder=MODES[job['preset']])
        from urllib.parse import urlencode
        image['url']='/image?'+urlencode({k:image[k] for k in ['filename','subfolder','type']})
