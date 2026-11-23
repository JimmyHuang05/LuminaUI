import json,time,subprocess,urllib.request,sys
from pathlib import Path
name=sys.argv[1]
g=json.loads(Path('workflows/'+name+'_api.json').read_text())
w=json.loads(Path('workflows/'+name+'.json').read_text())
start=time.monotonic()
r=json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8188/prompt',data=json.dumps({'prompt':g,'extra_data':{'extra_pnginfo':{'workflow':w}}}).encode(),headers={'Content-Type':'application/json'})))
print('Queued',r,flush=True)
pid=r['prompt_id'];peak=0
while True:
    usage=int(subprocess.check_output(['nvidia-smi','--query-gpu=memory.used','--format=csv,noheader,nounits'],text=True).strip())
    peak=max(peak,usage)
    h=json.load(urllib.request.urlopen('http://127.0.0.1:8188/history/'+pid))
    if pid in h:
        result={'workflow':name,'elapsed_seconds':round(time.monotonic()-start,2),'peak_gpu_memory_mib':peak,'history':h[pid]}
        Path('workflows/'+name+'_test.json').write_text(json.dumps(result,indent=2))
        print(json.dumps({'elapsed':result['elapsed_seconds'],'peak_mib':peak,'status':h[pid]['status'],'outputs':h[pid]['outputs']}),flush=True)
        break
    time.sleep(1)
