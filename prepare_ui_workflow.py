import json
from pathlib import Path
import urllib.request
w=json.loads(Path('.venv/Lib/site-packages/comfyui_workflow_templates_json/templates/image_sdxl_simple.json').read_text(encoding='utf-8'))
p=json.loads(Path('workflows/sdxl_text_to_image_api.json').read_text())
for n in w['nodes']:
    if n['id']==10: n['widgets_values']=[p['6']['inputs']['text']]
    if n['id']==11: n['widgets_values']=[p['7']['inputs']['text']]
    if n['id']==12: n['widgets_values']=[42,'fixed',20,7,'euler','normal',1]
    if n['id']==7: n['widgets_values']=['SDXL_test']
for target in [Path('workflows/sdxl_text_to_image.json'),Path('ComfyUI/user/default/workflows/sdxl_text_to_image.json')]:
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(w,indent=2),encoding='utf-8')
r=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8188/prompt',data=json.dumps({'prompt':p,'extra_data':{'extra_pnginfo':{'workflow':w}}}).encode(),headers={'Content-Type':'application/json'}))
print(json.load(r))
