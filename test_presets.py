import json,time,urllib.request
from pathlib import Path
from PIL import Image
root=Path(__file__).parent
folder=root/'workflows/presets'
def call(path,data=None):
    request=urllib.request.Request('http://127.0.0.1:8188'+path,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(request,timeout=30))
manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
for entry in manifest['presets']:
    g=json.loads((folder/entry['api_file']).read_text(encoding='utf-8'))
    w=json.loads((folder/entry['ui_file']).read_text(encoding='utf-8'))
    if entry['id']=='02_character_consistency':
        prompt='Keep the exact same chubby blue whale from the reference image, preserving its face, eye shape, blue skin, rounded belly and flippers. Photograph the same whale in a kelp forest underwater, slightly turned toward the camera. Photorealistic, no text.'
        g['4']['inputs']['prompt']=prompt
        next(n for n in w['nodes'] if n['id']==4)['widgets_values'][0]=prompt
    start=time.monotonic()
    response=call('/prompt',{'prompt':g,'extra_data':{'extra_pnginfo':{'workflow':w}}})
    pid=response['prompt_id'];print(entry['id']+' queued '+pid,flush=True)
    while time.monotonic()-start<900:
        h=call('/history/'+pid)
        if pid in h:break
        time.sleep(2)
    else:raise TimeoutError(pid)
    history=h[pid]
    if history['status']['status_str']!='success':raise RuntimeError(history['status'])
    images=history['outputs'][entry['output_node']]['images']
    sizes=[]
    for im in images:
        path=root/'ComfyUI/output'/im['subfolder']/im['filename']
        with Image.open(path) as pic:
            pic.load();sizes.append(list(pic.size))
    if entry['id']=='04_upscale':
        with Image.open(root/'ComfyUI/input/identity_reference_example.png') as original:
            assert sizes[0]==[original.width*2,original.height*2]
    entry.update(tested=True,test_seconds=round(time.monotonic()-start,2),test_sizes=sizes,test_images=images,test_reference='blue whale sample' if entry['id']!='01_text_to_image' else None)
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (folder/(entry['id']+'_test.json')).write_text(json.dumps(history,ensure_ascii=False,indent=2),encoding='utf-8')
    print(entry['id']+' passed '+str(entry['test_seconds'])+'s '+str(sizes),flush=True)
print('All four presets passed',flush=True)
