import urllib.request,json,base64,io
from pathlib import Path
from PIL import Image,ImageDraw
base='http://127.0.0.1:8190';config=json.load(urllib.request.urlopen(base+'/api/config'))
def post(path,data):
 request=urllib.request.Request(base+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-App-Token':config['token']});return json.load(urllib.request.urlopen(request))
image='webui/hat_test_teapot.png';mask='webui/edit_mask_test.png'
annotation=Image.open('ComfyUI/input/'+image).convert('RGB');draw=ImageDraw.Draw(annotation);draw.ellipse((205,280,370,455),outline='#ff4050',width=5);buf=io.BytesIO();annotation.save(buf,format='PNG');marked=post('/api/annotation',{'image':image,'annotation':'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()})['image']
base_payload={'preset':'03_image_edit','image':image,'prompt':'将茶壶正面标记区域的蓝色釉面改成绿色，其余保持不变。','quality':'pro','seed':42,'local_edit':True,'mask':mask,'feather':8}
tests=[('baseline',{}),('t8',{'t8_acceleration':True}),('crop',{'crop_edit':True}),('outpaint',{'frame':'outpaint','frame_ratio':'16:9','local_edit':False,'prompt':'自然延伸窗台和窗外背景，保持原有茶壶不变。'}),('transparent',{'local_edit':False,'transparent':True,'prompt':'移除背景，仅保留蓝色茶壶主体。输出透明背景。'}),('annotation',{'local_edit':False,'annotation':marked,'annotation_instructions':'红圈内茶壶釉面改成绿色，不要保留红色标注线。','prompt':'只修改红圈中的釉面颜色，其余保持不变。'})]
results=[]
for name,extra in tests:
 j=post('/api/generate',{**base_payload,**extra});results.append({'test':name,'prompt_id':j['prompt_id']});print(name,j['prompt_id'])
Path('webui/data/editor-acceptance-jobs.json').write_text(json.dumps(results,indent=2),encoding='utf8')
