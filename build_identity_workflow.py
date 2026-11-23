import json, shutil
from pathlib import Path
root=Path(__file__).parent
name='qwen21_character_consistency'
prompt='以参考图中的人物为唯一身份参考，生成同一个人的一张新的写实照片。严格保留其脸型、五官比例、眼睛、鼻子、嘴唇、肤色、年龄和发型，不要换成另一个人，不要美化到改变身份。新场景：这个人穿着米白色针织衫，坐在窗边咖啡馆，手持一杯咖啡，正面看向镜头，半身构图，柔和自然光，真实皮肤纹理，专业人像摄影。可以改变服装、姿势、环境和光线，人物身份必须保持一致。无文字，无水印。'
g=json.loads((root/'workflows/qwen21_original_api.json').read_text())
g.pop('5')
g['10']={'class_type':'LoadImage','inputs':{'image':'identity_reference_example.png'}}
g['4']['inputs'].update(prompt=prompt, **{'images.image_1':['10',0]})
g['7']['inputs'].update(latent_image=['4',2],seed=2026093002)
g['9']['inputs']['filename_prefix']='Qwen21/character_consistency'
w=json.loads((root/'workflows/qwen21_original.json').read_text())
w['nodes']=[n for n in w['nodes'] if n['id']!=5]
w['links']=[l for l in w['links'] if l[1]!=5]
nodes={n['id']:n for n in w['nodes']}
nodes[4]['widgets_values'][0]=prompt
nodes[4]['title']='② 描述新场景，保留人物身份'
nodes[7]['widgets_values'][0]=2026093002
nodes[9]['widgets_values'][0]='Qwen21/character_consistency'
lid=max(l[0] for l in w['links'])+1
slot=next(i for i,x in enumerate(nodes[7]['inputs']) if x['name']=='latent_image')
nodes[7]['inputs'][slot]['link']=lid
nodes[4]['outputs'][2]['links']=[lid]
w['links'].append([lid,4,2,7,slot,'LATENT'])
lid+=1
nodes[4]['inputs'].append({'name':'images.image_1','type':'IMAGE','link':lid})
w['links'].append([lid,10,0,4,len(nodes[4]['inputs'])-1,'IMAGE'])
w['nodes'].append({'id':10,'type':'LoadImage','title':'① 上传人物参考图','pos':[0,560],'size':[330,400],'flags':{},'order':0,'mode':0,'inputs':[],'outputs':[{'name':'IMAGE','type':'IMAGE','links':[lid]},{'name':'MASK','type':'MASK','links':[]}],'properties':{'Node name for S&R':'LoadImage'},'widgets_values':['identity_reference_example.png','image']})
w['last_node_id']=10;w['last_link_id']=lid
for folder in [root/'workflows',root/'ComfyUI/user/default/workflows']:
    (folder/(name+'.json')).write_text(json.dumps(w,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'workflows'/(name+'_api.json')).write_text(json.dumps(g,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copyfile(root/'ComfyUI/output/Qwen21/deepseek_whale_original_00001_.png',root/'ComfyUI/input/identity_reference_example.png')
# Verify the reference-image execution path using the existing nonhuman sample.
test=json.loads(json.dumps(g))
test['4']['inputs']['prompt']='Keep the exact same extremely chubby blue whale from the reference image, preserving its face, blue skin, round body and flippers. Change only the environment to a magical underwater coral reef with colorful corals and small tropical fish. Photorealistic cinematic lighting, full body portrait, no text.'
(root/'workflows/identity_reference_smoke_api.json').write_text(json.dumps(test),encoding='utf-8')
(root/'workflows/identity_reference_smoke.json').write_text(json.dumps(w,ensure_ascii=False),encoding='utf-8')
(root/'workflows/人物一致性使用说明.txt').write_text('打开 qwen21_character_consistency 工作流。\n1. 在「① 上传人物参考图」选择 upload 上传一张清晰的单人照片。默认鲸鱼图片仅用于管线测试，请替换。\n2. 在「② 描述新场景，保留人物身份」修改「新场景」之后的服装、动作、环境描述。\n3. 点击运行。原版 INT8，无加速 LoRA，40 步，CFG 1。输出比例随参考图，参考图按约一百万像素缩放。\n4. 输出在 ComfyUI/output/Qwen21，文件名前缀 character_consistency。\n测试人物一致性时，先保持种子不变，分别尝试换背景、换衣服、换姿势，比较脸型和五官。单张参考图不能保证每次完全一致；极端侧脸、遮挡和大幅年龄变化更容易偏离。\n当前仅用鲸鱼参考图验证管线，真人一致性需上传你的照片后检验。\n',encoding='utf-8')
