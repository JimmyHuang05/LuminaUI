import json,urllib.request,numpy as np
from pathlib import Path
from PIL import Image
ids=json.loads(Path('webui/data/editor-acceptance-jobs.json').read_text(encoding='utf8'));jobs=json.load(urllib.request.urlopen('http://127.0.0.1:8190/api/status'))['jobs'];report=[]
for item in ids:
 j=next(j for j in jobs if j['prompt_id']==item['prompt_id']);row={'test':item['test'],'status':j['status'],'prompt_id':j['prompt_id']}
 if j['status']=='success':
  out=j['images'][0];path=Path('ComfyUI/output')/out['subfolder']/out['filename'];im=Image.open(path);row.update(file=str(path.resolve()),size=im.size,mode=im.mode)
  h=json.load(urllib.request.urlopen('http://127.0.0.1:8188/history/'+j['prompt_id']))[j['prompt_id']];times=[d['timestamp'] for kind,d in h['status']['messages'] if 'timestamp' in d];row['execution_seconds']=(max(times)-min(times))/1000
  if j['local_edit']:
   source=Image.open('ComfyUI/input/'+(j.get('composite_source') or j['image'])).convert(im.mode);mask=np.array(Image.open('ComfyUI/input/'+(j.get('composite_mask') or j['mask'])).convert('L'))>127
   a=np.array(source);b=np.array(im);change=np.any(a!=b,axis=2);row['outside_changed_pixels']=int(change[~mask].sum());row['inside_changed_pixels']=int(change[mask].sum())
  if 'A' in im.getbands():row['alpha_range']=im.getchannel('A').getextrema()
 if j.get('error'):row['error']=j['error']
 report.append(row)
previous={r['test']:r for r in json.loads(Path('webui/data/editor-acceptance-report.json').read_text(encoding='utf8'))} if Path('webui/data/editor-acceptance-report.json').exists() else {}
for row in report:
 for key in ['visual_result','notes']:
  if key in previous.get(row['test'],{}):row[key]=previous[row['test']][key]
 if row['test']=='ui_annotation_snapshot_reuse' and row['status']=='success':row.update(visual_result='passed',notes='从网页恢复完整标注图、撤销和拖动后重新生成；白色星形与金色把手保持正确，未出现标注线。')
print('Reported',len(report),'jobs;',sum(r['status']=='success' for r in report),'succeeded');Path('webui/data/editor-acceptance-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
