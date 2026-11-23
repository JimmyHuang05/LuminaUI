import json, urllib.request
from pathlib import Path
prompt_text='A square product photograph of a pale blue ceramic teapot on a walnut table. Soft natural window light enters from the left. The teapot has a curved handle, a fitted lid and delicate gold floral decoration. Behind it is a softly blurred warm grey plaster wall. Fine ceramic texture, realistic reflections, balanced composition, no text.'
base={
'1':{'class_type':'UNETLoader','inputs':{'unet_name':'qwen_image_2.1_int8_convrot.safetensors','weight_dtype':'default'}},
'2':{'class_type':'CLIPLoader','inputs':{'clip_name':'qwen3vl_8b_int8_convrot.safetensors','type':'qwen_image','device':'default'}},
'3':{'class_type':'VAELoader','inputs':{'vae_name':'qwen_image_2.1_vae_bf16.safetensors'}},
'4':{'class_type':'TextEncodeQwenImage21','inputs':{'clip':['2',0],'vae':['3',0],'prompt':prompt_text,'negative_prompt':'','resolution':1024}},
'5':{'class_type':'EmptyLatentImage','inputs':{'width':1024,'height':1024,'batch_size':1}},
'6':{'class_type':'QwenImage21Cache','inputs':{'model':['1',0],'device':'auto','dtype':'default'}},
'7':{'class_type':'KSampler','inputs':{'model':['6',0],'positive':['4',0],'negative':['4',1],'latent_image':['5',0],'seed':42,'steps':40,'cfg':1.0,'sampler_name':'euler','scheduler':'simple','denoise':1.0}},
'8':{'class_type':'VAEDecode','inputs':{'samples':['7',0],'vae':['3',0]}},
'9':{'class_type':'SaveImage','inputs':{'images':['8',0],'filename_prefix':'Qwen21/base'}}}
turbo=json.loads(json.dumps(base))
turbo.pop('7')
turbo.update({
'10':{'class_type':'ViggleTurboLora','inputs':{'model':['1',0],'lora_name':'Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors','strength':1.0}},
'11':{'class_type':'BasicGuider','inputs':{'model':['6',0],'conditioning':['4',0]}},
'12':{'class_type':'RandomNoise','inputs':{'noise_seed':42}},
'13':{'class_type':'KSamplerSelect','inputs':{'sampler_name':'euler'}},
'14':{'class_type':'ViggleTurboSigmas','inputs':{'latent':['5',0],'nodes':'1.0, 0.9375, 0.875, 0.75, 0.5, 0.25'}},
'15':{'class_type':'SamplerCustomAdvanced','inputs':{'noise':['12',0],'guider':['11',0],'sampler':['13',0],'sigmas':['14',0],'latent_image':['5',0]}}})
turbo['6']['inputs']['model']=['10',0]
turbo['8']['inputs']['samples']=['15',0]
turbo['9']['inputs']['filename_prefix']='Qwen21/turbo'
info=json.load(urllib.request.urlopen('http://127.0.0.1:8188/object_info'))
def ui(graph):
    nodes=[];links=[];byid={}
    positions={'1':[0,0],'2':[0,180],'3':[0,390],'4':[400,0],'5':[0,560],'6':[820,0],'7':[820,190],'8':[1250,0],'9':[1250,190],'10':[400,450],'11':[820,180],'12':[820,330],'13':[820,440],'14':[400,640],'15':[1050,450]}
    for key,g in graph.items():
        spec=info[g['class_type']];ins=[];widgets=[]
        for group in ['required','optional']:
            for name,schema in spec['input'].get(group,{}).items():
                if name not in g['inputs']:continue
                value=g['inputs'][name];connected=isinstance(value,list)
                typ=schema[0];widget=typ in ['INT','FLOAT','STRING','BOOLEAN','COMBO'] or isinstance(typ,list)
                if connected:ins.append({'name':name,'type':typ,'link':None})
                elif widget:
                    widgets.append(value)
                    if name in ['seed','noise_seed']:widgets.append('fixed')
        n={'id':int(key),'type':g['class_type'],'pos':positions[key],'size':[330, max(110,80+len(widgets)*30)],'flags':{},'order':len(nodes),'mode':0,'inputs':ins,'outputs':[{'name':name,'type':typ,'links':[]} for name,typ in zip(spec.get('output_name',spec['output']),spec['output'])],'properties':{'Node name for S&R':g['class_type']},'widgets_values':widgets}
        if key=='4':n['size']=[400,350]
        if key=='9':n['size']=[500,500]
        nodes.append(n);byid[key]=n
    for key,g in graph.items():
        for name,value in g['inputs'].items():
            if not isinstance(value,list):continue
            src,slot=value;target=byid[key];target_slot=next(i for i,x in enumerate(target['inputs']) if x['name']==name);lid=len(links)+1
            typ=byid[src]['outputs'][slot]['type'];links.append([lid,int(src),slot,int(key),target_slot,typ]);target['inputs'][target_slot]['link']=lid;byid[src]['outputs'][slot]['links'].append(lid)
    return {'last_node_id':max(map(int,graph)),'last_link_id':len(links),'nodes':nodes,'links':links,'groups':[],'config':{},'extra':{'ds':{'scale':0.65,'offset':[100,100]}},'version':0.4}
for name,g in [('qwen21_original',base),('qwen21_turbo_6step',turbo)]:
    Path('workflows/'+name+'_api.json').write_text(json.dumps(g,indent=2),encoding='utf-8')
    w=ui(g)
    for directory in ['workflows','ComfyUI/user/default/workflows']:
        Path(directory).mkdir(parents=True,exist_ok=True)
        Path(directory+'/'+name+'.json').write_text(json.dumps(w,indent=2),encoding='utf-8')
print('Saved original and turbo workflows')
