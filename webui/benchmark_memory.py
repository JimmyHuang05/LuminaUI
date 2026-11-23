import json,time,subprocess,urllib.request,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def api(path,data=None):
    with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8188'+path,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'}),timeout=30) as response:
        raw=response.read()
        return json.loads(raw) if raw else {}
mode=sys.argv[1]
g=json.loads((ROOT/'workflows/presets/02_character_consistency_api.json').read_text(encoding='utf-8'))
from regions import crop_reference, prepare_reference
sample='webui/memory_benchmark_source.png'
import shutil
shutil.copyfile(ROOT/'ComfyUI/input/identity_reference_example.png',ROOT/'ComfyUI/input'/sample)
crop=crop_reference(sample,[.2,.15,.6,.4])
g['10']['inputs']['image']=sample
g['20']={'class_type':'LoadImage','inputs':{'image':crop}}
g['4']['inputs'].update(prompt='Keep the same extremely chubby blue whale from image 1, preserve its eyes, rounded face, blue skin and plump body. Image 2 is a close-up identity reference only. Move the whale to a beautiful underwater kelp forest, photorealistic wildlife photography, no text.',**{'images.image_2':['20',0]})
g['7']['inputs']['seed']=998137
g['9']['inputs']['filename_prefix']='MemoryBenchmark/'+mode
if mode!='before':
    g['10']['inputs']['image']=prepare_reference(sample,1024)
    g['20']['inputs']['image']=prepare_reference(crop,512)
    g['4']['inputs']['resolution']=0
    g['8']={'class_type':'VAEDecodeTiled','inputs':{'samples':['7',0],'vae':['3',0],'tile_size':512,'overlap':64,'temporal_size':64,'temporal_overlap':8}}
    if mode=='cpu':g['2']['inputs']['device']='cpu'
api('/free',{'unload_models':True,'free_memory':True})
time.sleep(2)
start=time.monotonic();pid=api('/prompt',{'prompt':g})['prompt_id'];peak=0
print(mode+' queued '+pid,flush=True)
while time.monotonic()-start<600:
    peak=max(peak,int(subprocess.check_output(['nvidia-smi','--query-gpu=memory.used','--format=csv,noheader,nounits'],text=True).strip()))
    history=api('/history/'+pid)
    if pid in history:break
    time.sleep(.4)
else:raise TimeoutError('Benchmark exceeded 10 minutes')
record=history[pid]
result={'mode':mode,'seconds':round(time.monotonic()-start,2),'peak_mib':peak,'status':record['status']['status_str'],'outputs':record['outputs'],'graph':g}
(ROOT/'webui/data'/('memory_'+mode+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
assert result['status']=='success',record['status']
print(json.dumps({k:v for k,v in result.items() if k not in ['graph','outputs']}),flush=True)
