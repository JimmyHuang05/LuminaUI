const qualityNames={lite:'Lite',pro:'Pro',pro_plus:'Pro+'};
function applyQualitySteps(){
  updateQuality();
  const steps=document.getElementById('generation-steps');
  if(!steps||!['02_character_consistency','03_image_edit'].includes(mode))return;if(mode==='03_image_edit'){steps.value=document.getElementById('edit-model')?.value==='ray'?25:document.getElementById('edit-model')?.value==='qwen'?30:10;return;}
  steps.value=$('quality').value==='pro_plus'?40:mode==='03_image_edit'&&document.getElementById('edit-model')?.value==='ray'?25:30;
}
function updateQuality(){if(mode==='03_image_edit'){$('quality-field').hidden=true;$('upscale-model-field').hidden=true;$('model-help').textContent='图片编辑 · Krea2 / Qwen 2.1';return;}const up=mode==='04_upscale',text=mode==='01_text_to_image';$('quality-field').hidden=up;$('upscale-model-field').hidden=!up;$('quality').querySelector('[value="lite"]').disabled=!text;if(!text&&$('quality').value==='lite')$('quality').value='pro';const q=$('quality').value;$('quality-help').textContent=q==='lite'?'Turbo LoRA · 适合快速探索构图。':(q==='pro'?(mode==='03_image_edit'&&document.getElementById('edit-model')?.value==='ray'?'Ray 25 步 · 日常创作推荐。':'原版 30 步 · 日常创作推荐。'):'原版 40 步 · 更多采样，耗时更长。')+(!text&&!up?' Lite 暂仅支持文生图。':'');$('model-help').textContent=up?'SeedVR2 3B · 细节增强':(text?'Krea2 · 8 步':'Qwen Image 2.1 · '+qualityNames[q])+' · 单张生成 · 自动排队';}
const $=id=>document.getElementById(id);
const tools=[['01_text_to_image','图片生成'],['02_character_consistency','图片生成'],['03_image_edit','图片编辑'],['04_upscale','高清放大']];
let token='',mode=tools[0][0],uploaded='',jobs=[],selected=null,online=false,busy=false,uploading=false,editing=false,editorImage='';const drafts={};const modeSelections={},modeImages={};let originalEditPrompt='';let extraReferences=[];
const editor=new RegionEditor($('region-canvas'),()=>regionChanged(true));
function inputURL(name){const n=name.lastIndexOf('/');return '/image?'+new URLSearchParams({filename:name.slice(n+1),subfolder:name.slice(0,n),type:'input'});}
function editTaskPolicy(task=document.getElementById('edit-task')?.value||'general'){
  return {task,maskRequired:['local','face'].includes(task),directOnly:!['local','face','head','body'].includes(task),canOutpaint:task==='outpaint',canLocal:['local','face','head','body'].includes(task),canAnnotate:false,canTransparent:false};
}
function editFormError(){
  if(mode!=='03_image_edit')return '';
  const p=editTaskPolicy(),outpaint=$('edit-frame').value==='outpaint';
  if(outpaint&&!p.canOutpaint)return '当前编辑模式不支持扩图，请先切换到自由编辑。';
  if($('annotation-mode').checked&&!p.canAnnotate)return '当前编辑模式不支持颜色标注，请关闭颜色标注。';
  if($('transparent-output').checked&&!p.canTransparent)return '当前编辑模式不支持透明背景，请关闭透明背景。';
  if($('local-edit').checked&&!p.canLocal)return '当前编辑模式使用整图直接编辑，不支持局部选区。';
  if(p.maskRequired){
    $('local-edit').checked=true;
    if(!editor.hasMask())return p.task==='face'?'请先涂抹原图的面部五官区域，避开头发，再进行换脸。':'请先涂抹需要修改的区域，再进行局部修改。';
  }
  const count=extraReferences.length;
  if(p.task==='dual'&&count!==1)return '双图编辑需要一张图2参考图。';
  if(!['dual','face','head','body'].includes(p.task)&&count)return '当前模式只使用图1，请先移除额外参考图。';
  if(['face','head','body'].includes(p.task)&&count!==1)return '请上传恰好一张参考图（图2），用于人物替换。';
  if((outpaint||['fusion','watermark'].includes(p.task))&&count)return '当前模式只使用一张主图，请移除额外参考图；已上传图片仍保留在媒体资产中。';
  return '';
}
function regionChanged(autoSelect=false){
  if(!$('region-state'))return;
  const policy=editTaskPolicy();
  if(mode==='03_image_edit'){
    if(policy.maskRequired)$('local-edit').checked=true;
    $('local-edit').disabled=policy.maskRequired||!policy.canLocal;
    $('edit-frame').disabled=!policy.canOutpaint;
    $('annotation-mode').disabled=!policy.canAnnotate;
    $('transparent-output').disabled=!policy.canTransparent;
  }
  const edit=mode==='03_image_edit',outpaint=edit&&$('edit-frame').value==='outpaint',annotation=edit&&$('annotation-mode').checked,hasMask=editor.hasMask();
  if(autoSelect&&edit&&policy.canLocal&&hasMask&&!annotation&&!outpaint&&!$('transparent-output').checked)$('local-edit').checked=true;
  if(typeof window!=='undefined')window.syncLocalControls?.();
  $('region-open').disabled=outpaint||(edit&&!policy.canLocal&&!policy.canAnnotate);
  $('region-state').textContent=outpaint?'扩图自动处理新增区域，无需手动涂抹。':edit&&policy.directOnly?'当前模式使用整图直接编辑，不支持局部选区或颜色标注。':annotation?(editor.hasAnnotations()?'已添加颜色标注，请描述各颜色的修改要求。':'在画布上用颜色圈出修改位置。'):mode==='02_character_consistency'?(editor.rect?'已框选身份区域，将额外参考这部分。':'未框选，使用完整参考图。'):hasMask?($('local-edit').checked?'已涂抹选区，仅合成选区内的修改。':'已保留选区，当前按整图指令编辑。勾选精确局部编辑后选区生效。'):edit&&$('local-edit').checked?'先涂抹需要修改的区域，再填写修改要求。':'直接编辑：无需涂抹；需要严格保留其他区域时，可标记选区。';
}

function closeEditor(){editing=false;$('editor-stage').hidden=true;$('editor-tools').hidden=true;$('preview').hidden=false;}
async function openEditor(){if(!uploaded){$('error').textContent='请先上传参考图片。';return;}try{if(editorImage!==uploaded){await editor.load(inputURL(uploaded));editorImage=uploaded;}editor.tool=mode==='02_character_consistency'?'rect':$('annotation-mode').checked?'annotate':'brush';editor.identity=mode==='02_character_consistency';editor.annotationMode=mode==='03_image_edit'&&$('annotation-mode').checked;$('pan-region').textContent='拖动画布';editor.fit();selectRegionTool(editor.tool);$('paint').classList.add('active');$('erase').classList.remove('active');editing=true;$('editor-stage').hidden=false;$('editor-tools').hidden=false;$('preview').hidden=true;$('brush-controls').hidden=editor.tool==='rect'||editor.tool==='annotate';$('editor-caption').textContent=editor.tool==='rect'?'拖动框选脸部或身份区域':editor.tool==='annotate'?'用不同颜色圈出位置，颜色标注不限制生成范围':'红色区域 = 允许修改的位置';regionChanged();}catch(e){$('error').textContent=e.message;}}
function change(id){if(id==='02_character_consistency')id='01_text_to_image';const previousCanvasMode=mode;modeSelections[mode]=selected;drafts[mode]=$('prompt').value;originalEditPrompt='';mode=id;closeEditor();$('tool-title').textContent=tools.find(t=>t[0]===id)[1];document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.id===id));const text=id==='01_text_to_image',up=id==='04_upscale',identity=id==='02_character_consistency',edit=id==='03_image_edit';$('image-field').hidden=text;$('region-field').hidden=!(identity||edit);$('identity-options').hidden=!identity;$('local-options').hidden=!edit;$('references-field').hidden=!(edit||identity);$('enhance-edit').hidden=!edit;$('enhance-status').hidden=!edit;$('region-open').hidden=!(identity||edit);$('region-open').textContent=identity?'框选身份区域':'涂抹局部 · 可选';$('prompt-field').hidden=up;$('ratio-field').hidden=!text;$('scale-field').hidden=!up;$('memory-field').hidden=up;$('seed-field').hidden=up;$('prompt-label').textContent=identity?'新场景描述':text?'画面描述':'修改指令';$('prompt').value=drafts[id]||'';$('prompt-help').textContent=identity?'描述服装、动作与环境；身份保留指令会自动加入。':text?'描述主体、环境、风格和光线。':'直接描述要修改的内容；涂抹选区后启用精确局部编辑。';$('image-help').textContent=up?'建议先上传边长约 1024 像素的图片。':'上传后可在画布上标记参考或修改区域。';$('model-help').textContent=up?'SeedVR2 3B · 细节增强':'Qwen Image 2.1 原版 · 单张生成 · 自动排队';$('submit').textContent=up?'放大':'运行';$('error').textContent='';updateQuality();regionChanged();window.dispatchEvent(new Event('creative-mode-change'));if(previousCanvasMode!==id){selected=modeSelections[id]||null;rendered='';$('preview').replaceChildren();$('reuse').hidden=true;$('download').hidden=true;$('compare-original').hidden=true;$('progress').hidden=true;$('job-status').textContent='';const existing=jobs.find(j=>j.prompt_id===selected);if(existing)select(existing);else if(modeImages[id])showUploadedCanvas(modeImages[id]);}}
for(const [id,title] of tools.filter(([id])=>id!=='02_character_consistency')){const b=document.createElement('button');b.type='button';b.className='tab';b.dataset.id=id;const strong=document.createElement('b');strong.textContent=title;b.append(strong);b.onclick=()=>change(id);$('tabs').append(b);}change(mode);
async function api(path,options={}){options.headers={...options.headers,'X-App-Token':token};const r=await fetch(path,options);let d;try{d=await r.json();}catch{throw Error('操作失败，请刷新页面后重试');}if(!r.ok)throw Error(d.error||'操作失败');if(options.method&&options.method!=='GET'&&window.parent!==window){window.parent.luminaWorkspace?.changed(path,path==='/api/upload'?d:(path==='/api/prompts'||path==='/api/media/delete')?JSON.parse(options.body):null);}return d;}
function showUploadedCanvas(url){selected=null;modeSelections[mode]=null;modeImages[mode]=url;rendered='';const im=new Image();im.src=url;im.alt='上传的图片';im.draggable=false;$('preview').replaceChildren(im);$('reuse').hidden=true;$('download').hidden=true;$('compare-original').hidden=true;$('progress').hidden=true;$('job-status').textContent='图片已上传';}
async function upload(file){if(!file)return;originalEditPrompt='';uploading=true;$('submit').disabled=true;$('error').textContent='';try{const form=new FormData();form.append('image',file);const d=await api('/api/upload',{method:'POST',body:form});uploaded=d.image;$('reference').src=d.url;$('reference').hidden=false;await editor.load(d.url);editorImage=uploaded;showUploadedCanvas(d.url);$('local-edit').checked=false;$('annotation-mode').checked=false;$('annotation-options').hidden=true;closeEditor();regionChanged();}catch(e){$('error').textContent=e.message;}finally{uploading=false;$('submit').disabled=!online||busy;}}
// One drop path for local files and media-library images, retaining the normal upload validation.
function bindImageDrop(target,receive,onError,allowed=()=>true){
  let receiving=false;
  const accepts=e=>Array.from(e.dataTransfer?.types||[]).some(t=>t==='Files'||t==='application/x-comfy-media-asset'||t==='text/uri-list');
  target.ondragover=e=>{if(!accepts(e))return;e.preventDefault();e.stopPropagation();const ready=!receiving&&allowed();e.dataTransfer.dropEffect=ready?'copy':'none';target.classList.toggle('image-drop-ready',ready);};
  target.ondragleave=e=>{if(!target.contains(e.relatedTarget))target.classList.remove('image-drop-ready');};
  target.ondrop=async e=>{
    if(!accepts(e))return;e.preventDefault();e.stopPropagation();target.classList.remove('image-drop-ready');if(receiving||!allowed())return;receiving=true;
    try{let file=e.dataTransfer.files?.[0];if(!file){const value=e.dataTransfer.getData('application/x-comfy-media-asset')||e.dataTransfer.getData('text/uri-list').split(/\r?\n/).find(line=>line&&!line.startsWith('#'));const url=new URL(value,location.href);if(url.origin!==location.origin||url.pathname!=='/image'||!['input','output'].includes(url.searchParams.get('type'))||!url.searchParams.get('filename'))throw Error('无效的媒体图片');const response=await fetch(url);if(!response.ok)throw Error('读取媒体资产失败，请确认图片仍然存在');file=new File([await response.blob()],url.searchParams.get('filename'),{type:response.headers.get('Content-Type')||'image/png'});}if(file)await receive(file);
    }catch(error){onError(error);}finally{receiving=false;target.classList.remove('image-drop-ready');}
  };
}
$('file').onchange=e=>upload(e.target.files[0]);const zone=document.querySelector('.upload');bindImageDrop(zone,upload,e=>$('error').textContent=e.message,()=>!busy&&!uploading);
$('form').addEventListener('submit',e=>{const message=editFormError();if(message){e.preventDefault();e.stopImmediatePropagation();$('error').textContent=message;}},true);
$('region-open').onclick=openEditor;$('editor-done').onclick=closeEditor;$('undo-region').onclick=()=>editor.revert();$('clear-region').onclick=()=>editor.clear();$('paint').onclick=()=>{editor.tool='brush';editor.render();$('paint').classList.add('active');$('erase').classList.remove('active');};$('erase').onclick=()=>{editor.tool='erase';editor.render();$('erase').classList.add('active');$('paint').classList.remove('active');};$('brush-size').oninput=()=>{$('brush-value').textContent=$('brush-size').value;};$('feather').oninput=()=>{$('feather-value').textContent=$('feather').value+' px';};
$('form').onsubmit=async e=>{e.preventDefault();if(isZitRedraw()){await submitZitRedraw();return;}if(mode==='02_character_consistency'?!imageReferences.length:mode!=='01_text_to_image'&&!uploaded){$('error').textContent='请先上传一张图片。';return;}busy=true;$('submit').disabled=true;$('error').textContent='';try{const payload={workflow_settings:window.workflowControls?.payload()||{},redraw_creativity:Number(document.getElementById('redraw-creativity')?.value||49),steps:Number(document.getElementById('generation-steps')?.value||8),cfg:Number(document.getElementById('generation-cfg')?.value||1),sampler_name:document.getElementById('generation-sampler')?.value||'euler',scheduler:document.getElementById('generation-scheduler')?.value||'simple',image_resolution:document.getElementById('image-resolution')?.value||'medium',generation_model:document.getElementById('generation-model')?.value||'cutie',generation_workflow:mode==='01_text_to_image'&&['cutie','mix_v8','pro_mix'].includes(document.getElementById('generation-model')?.value)?document.getElementById('generation-workflow')?.value:undefined,krea_simple_mode:document.getElementById('krea-simple-mode')?.value||'standard',refine_scale:Number(document.getElementById('refine-scale')?.value||1.5),refine_strength:Number(document.getElementById('refine-strength')?.value||0.39),references:(mode==='03_image_edit'||mode==='02_character_consistency')?extraReferencePayload():[],preset:mode,prompt:$('prompt').value,image:uploaded,seed:$('seed').value,ratio:$('ratio').value,scale:$('scale').value,memory_mode:$('memory-mode').value,quality:$('quality').value,upscale_model:$('upscale-model').value,original_prompt:originalEditPrompt||$('prompt').value};if(mode==='02_character_consistency'){payload.image=imageReferences[0]?.image;payload.references=imageReferences.slice(1);payload.primary_reference=imageReferences[0];payload.generation_model='qwen';}if(mode==='03_image_edit'){Object.assign(payload,{local_content:document.getElementById('local-content')?.disabled?'preserve':document.getElementById('local-content')?.value||'preserve',local_resolution:Number(document.getElementById('local-resolution')?.value||768),edit_task:document.getElementById('edit-task')?.value||'general',edit_megapixels:Number(document.getElementById('edit-megapixels')?.value||1),edit_model:document.getElementById('edit-model')?.value||'krea_cutie',anti_shift:$('anti-shift').checked,frame:$('edit-frame').value,frame_ratio:$('frame-ratio').value,transparent:$('transparent-output').checked,crop_edit:$('crop-edit').checked,t8_acceleration:$('t8-acceleration').checked});}if(mode==='03_image_edit'&&$('annotation-mode').checked){if(!editor.hasAnnotations())throw Error('请先用颜色圈出修改位置');const instructions=$('annotation-instructions').value.trim();if(!instructions)throw Error('请填写每种颜色的修改要求');const response=await api('/api/annotation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:uploaded,annotation:editor.annotationPNG()})});payload.annotation=response.image;payload.annotation_strokes=editor.annotations;payload.annotation_base=editor.annotationBaseName;payload.annotation_instructions=instructions;}if(mode==='03_image_edit'&&$('local-edit').checked&&$('edit-frame').value==='original'){if(!editor.hasMask())throw Error('请先涂抹需要修改的区域，或取消局部编辑。');const mask=await api('/api/mask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:uploaded,mask:editor.maskPNG()})});Object.assign(payload,{mask:mask.mask,local_edit:true,feather:Number($('feather').value)});}if(window.promptSelection)Object.assign(payload,window.promptSelection.payload());if(window.cameraPresets)Object.assign(payload,window.cameraPresets.payload());if(window.generationLoRAs)Object.assign(payload,await window.generationLoRAs.payload(payload.preset,payload.generation_model,payload.prompt));if(window.characterSelection)Object.assign(payload,window.characterSelection.payload());if(mode==='01_text_to_image')payload.generation_references=payload.generation_model==='ray'?[]:imageReferences.map(r=>({...r}));const j=await api('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});selected=j.prompt_id;modeSelections[mode]=selected;closeEditor();await refresh();}catch(e){$('error').textContent=e.message;}finally{busy=false;$('submit').disabled=!online||uploading;}};
const labels={queued:'等待排队',running:'正在生成',success:'已完成',error:'失败',cancelled:'已取消'};
let rendered='';
function fitGenerationPlaceholder(){
  const area=$('preview'),block=area.querySelector('.generation-placeholder');
  if(!block)return;
  const ratio=Number(block.dataset.ratio)||1;
  const width=Math.min(area.clientWidth,area.clientHeight*ratio);
  block.style.width=width+'px';block.style.height=width/ratio+'px';
}
new ResizeObserver(fitGenerationPlaceholder).observe($('preview'));
function generationPlaceholder(job){
  const block=document.createElement('div');block.className='generation-placeholder';
  block.setAttribute('role','status');block.setAttribute('aria-live','polite');
  const ratioParts=String(job.frame==='outpaint'?job.frame_ratio:job.ratio||'').split(':').map(Number);
  const ratio=job.width>0&&job.height>0?job.width/job.height:ratioParts[0]>0&&ratioParts[1]>0?ratioParts[0]/ratioParts[1]:1;
  block.dataset.ratio=ratio;
  const label=document.createElement('span');label.className='generation-placeholder-label';block.append(label);
  if(!(job.width>0&&job.height>0)&&!(ratioParts[0]>0&&ratioParts[1]>0)&&job.image){
    const reference=new Image();reference.onload=()=>{if(block.isConnected&&reference.naturalHeight){block.dataset.ratio=reference.naturalWidth/reference.naturalHeight;fitGenerationPlaceholder();}};
    reference.src=inputURL(job.image);
  }
  return block;
}
function select(job){
  selected=job.prompt_id;modeSelections[mode]=selected;
  const area=$('preview'),pending=['queued','running'].includes(job.status);
  // Preview frames never enter the DOM; only a completed output can replace the mask.
  const key=job.prompt_id+job.status+JSON.stringify(job.images);
  if(key!==rendered){
    const sameJob=area.dataset.jobId===job.prompt_id;rendered=key;area.dataset.jobId=job.prompt_id;
    $('download').hidden=true;
    if(pending){
      if(!sameJob||!area.querySelector('.generation-placeholder'))area.replaceChildren(generationPlaceholder(job));
    }else if(job.status==='success'&&job.images.length){
      if(!sameJob||!area.querySelector('.generation-placeholder'))area.replaceChildren(generationPlaceholder(job));
      area.querySelector('.generation-placeholder-label').textContent='正在载入成品…';
      const im=new Image();im.alt='生成结果';im.draggable=false;
      im.onload=async()=>{
        try{await im.decode();}catch{}
        if(rendered!==key||selected!==job.prompt_id||!area.querySelector('.generation-placeholder'))return;
        im.classList.add('generation-result');area.replaceChildren(im);area.removeAttribute('aria-busy');
        $('download').href=im.src;$('download').hidden=false;
      };
      im.onerror=()=>{if(rendered===key&&selected===job.prompt_id){rendered='';area.removeAttribute('aria-busy');const label=area.querySelector('.generation-placeholder-label');if(label)label.textContent='成品加载失败，正在重试…';}};
      im.src=job.images[0].url;
    }else{
      const div=document.createElement('div');div.className='empty';div.textContent=job.status==='error'?'本次生成未完成':'暂无生成结果';area.replaceChildren(div);
    }
  }
  if(pending){
    area.setAttribute('aria-busy','true');
    const label=area.querySelector('.generation-placeholder-label');
    if(label)label.textContent=job.status==='queued'?'等待生成…':'正在生成…';
  }else if(job.status!=='success')area.removeAttribute('aria-busy');
  fitGenerationPlaceholder();
if(!$('preview').querySelector('.comparison'))$('compare-original').textContent='滑动对比';$('compare-original').hidden=!(mode==='03_image_edit'&&job.preset==='03_image_edit'&&job.image&&job.images.length);$('reuse').hidden=false;const modelNames={krea_cutie:'Krea2 · Cutie 编辑',krea_mix:'Krea2 · Mix V8 编辑',cutie:'Krea2 Moody Cutie',mix_v8:'Krea2 Moody Mix',pro_mix:'ZIT Moody Pro Mix',wild:'ZIB Moody Wild',qwen:'Qwen Image 2.1',ray:'Qwen Ray Image 2.1'};
  const modeName=tools.find(t=>t[0]===job.preset)?.[1]||'生成';
  const modelName=job.preset==='04_upscale'?({seedvr2:'SeedVR2',hat:'HAT',realesrgan:'Real-ESRGAN'}[job.upscale_model]||job.upscale_model||'—'):modelNames[job.edit_model||job.generation_model]||job.label.split(' · ').slice(1).join(' · ')||'—';
  const duration=job.created?Math.max(0,Math.round((job.finished||Date.now()/1000)-job.created)):null;
  const line=modeName+' · '+modelName+' · 时间 '+(duration===null?'—':duration+' 秒')+' · 种子 '+(job.preset==='04_upscale'?'—':job.seed??'—');
  $('job-status').textContent=line;
  $('job-status').title=line+'\n'+labels[job.status]+' · 时间含排队'+(job.error?'\n'+job.error:'');const p=job.progress;$('progress').hidden=job.status!=='running';if(p&&job.status==='running'){$('progress').max=p.max;$('progress').value=p.value;$('job-status').textContent+=' · '+p.value+'/'+p.max;}else $('progress').removeAttribute('value');}
$('reuse').onclick=async()=>{const j=jobs.find(j=>j.prompt_id===selected);if(!j)return;change(j.preset);if(['01_text_to_image','02_character_consistency'].includes(j.preset)){imageReferences=(j.generation_references||[]).map(r=>({...r}));renderImageReferences();const card=$('character-card');if(card){card.value=j.character_card_id||'';card.dispatchEvent(new Event('change'));}}if(j.preset==='03_image_edit'&&document.getElementById('edit-model')){document.getElementById('edit-model').value=['krea_cutie','krea_mix','qwen','ray'].includes(j.edit_model)?j.edit_model:'krea_cutie';if(document.getElementById('edit-megapixels'))document.getElementById('edit-megapixels').value=j.edit_megapixels||1;document.getElementById('edit-model').dispatchEvent(new Event('change',{bubbles:true}));}if(j.preset==='03_image_edit')window.dispatchEvent(new CustomEvent('creative-edit-task',{detail:j.frame==='outpaint'?'outpaint':j.edit_task||'general'}));if(j.preset==='02_character_consistency')select(j);extraReferences=(j.references||[]).map(r=>({...r}));if(j.preset==='02_character_consistency'){imageReferences=j.character_card_snapshot?(j.generation_references||[]).map(r=>({...r})):[{image:j.image,role:'identity',description:'',...(j.primary_reference||{})},...extraReferences];renderImageReferences();}renderReferences();$('upscale-model').value='seedvr2';$('quality').value=j.quality||'pro_plus';updateQuality();$('prompt').value=j.camera_original_prompt??j.prompt;originalEditPrompt=j.original_prompt||'';$('seed').value=j.seed;$('traits').value=j.traits||'';$('preserve').value=j.preserve||'hair';$('memory-mode').value='balanced';if(document.getElementById('local-content'))document.getElementById('local-content').value=j.local_content||'preserve';if(document.getElementById('local-resolution'))document.getElementById('local-resolution').value=j.local_resolution||768;$('feather').value=j.feather??8;$('feather').oninput();if(document.getElementById('image-resolution')){document.getElementById('image-resolution').value=j.image_resolution||'low';document.getElementById('image-resolution').dispatchEvent(new Event('change'));}if(j.generation_model&&document.getElementById('generation-model'))document.getElementById('generation-model').value=j.generation_model;if(j.generation_model&&document.getElementById('generation-model'))document.getElementById('generation-model').dispatchEvent(new Event('change',{bubbles:true}));if(document.getElementById('krea-simple-mode')){document.getElementById('krea-simple-mode').value=j.krea_simple_mode||'standard';document.getElementById('refine-scale').value=j.refine_scale??1.5;document.getElementById('refine-strength').value=j.refine_strength??0.39;document.getElementById('krea-simple-mode').dispatchEvent(new Event('change',{bubbles:true}));}if(j.generation_workflow&&document.getElementById('generation-workflow')){const workflow=document.getElementById('generation-workflow');if([...workflow.options].some(o=>o.value===j.generation_workflow)){workflow.value=j.generation_workflow;workflow.dispatchEvent(new Event('change',{bubbles:true}));}}if(document.getElementById('redraw-creativity')){const c=document.getElementById('redraw-creativity');c.value=j.redraw_creativity??49;c.dispatchEvent(new Event('input'));}window.generationLoRAs?.restore(j);window.promptSelection?.restore({...j,prompt:j.camera_original_prompt??j.prompt});window.cameraPresets?.restore(j);if(document.getElementById('generation-steps')&&j.preset!=='04_upscale'){document.getElementById('generation-steps').value=j.steps??(j.edit_model==='qwen'?30:10);document.getElementById('generation-cfg').value=j.cfg??1;document.getElementById('generation-sampler').value=j.sampler_name||'euler';document.getElementById('generation-scheduler').value=j.scheduler||'simple';document.getElementById('generation-sampler').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('generation-scheduler').dispatchEvent(new Event('change',{bubbles:true}));}if(j.ratio)$('ratio').value=j.ratio;if(j.scale)$('scale').value=j.scale;try{if(j.image){uploaded=j.image;$('reference').src=inputURL(j.image);$('reference').hidden=false;await editor.load(inputURL(j.image));editorImage=j.image;editor.rect=j.identity_rect||null;if(j.local_edit&&j.mask&&j.frame!=='outpaint')await editor.restoreMask(inputURL(j.mask));$('edit-frame').value=j.frame||'original';$('frame-ratio').value=j.frame_ratio||'16:9';$('frame-ratio').hidden=j.frame!=='outpaint';$('transparent-output').checked=!!j.transparent;$('crop-edit').checked=!!j.crop_edit;$('t8-acceleration').checked=!!j.t8_acceleration;$('anti-shift').checked=!!j.anti_shift;$('local-edit').checked=!!j.local_edit&&j.frame!=='outpaint';$('annotation-mode').checked=!!j.annotation;editor.annotations=j.annotation_strokes||[];const annotationBase=j.annotation_base||(!editor.annotations.length?j.annotation:null);if(annotationBase)await editor.restoreAnnotation(inputURL(annotationBase),annotationBase);$('annotation-instructions').value=j.annotation_instructions||'';$('annotation-options').hidden=!j.annotation;if(j.preset==='03_image_edit'){
const isKrea=['krea_cutie','krea_mix'].includes(j.edit_model);
if(!isKrea&&!['qwen','ray'].includes(j.edit_model)&&j.frame!=='outpaint'){$('anti-shift').checked=false;$('t8-acceleration').checked=false;$('transparent-output').checked=false;$('annotation-mode').checked=false;$('annotation-options').hidden=true;$('local-edit').checked=false;$('edit-frame').value='original';$('frame-ratio').hidden=true;extraReferences=[];renderReferences();for(const [id,value] of Object.entries({'generation-steps':10,'generation-cfg':1,'generation-sampler':'euler','generation-scheduler':'simple'})){document.getElementById(id).value=value;document.getElementById(id).dispatchEvent(new Event('change',{bubbles:true}));}$('error').textContent='已载入旧图与指令；Qwen 编辑已停用，本次将使用 Krea2 单图编辑。';}
if(j.frame==='outpaint'||(['qwen','ray'].includes(j.edit_model)&&j.edit_task==='local')){$('local-edit').checked=j.edit_task==='local';if(['qwen','ray'].includes(j.edit_model)){document.getElementById('edit-model').value=j.edit_model;document.getElementById('edit-model').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('generation-steps').value=j.steps||(j.edit_model==='ray'?25:30);}}
}regionChanged();$('local-edit').dispatchEvent(new Event('change'));}}catch(e){$('error').textContent=e.message;}};
let missingInputs=[];let previous='';async function refresh(){try{const d=await api('/api/status');online=d.online;jobs=d.jobs;missingInputs=d.missing_inputs||[];$('connection').textContent=online?'● 已连接 · '+d.queue+' 个任务'+(d.memory?' · '+d.memory.used_gb+'/'+d.memory.total_gb+' GB':''):'○ ComfyUI 未连接';$('release-memory').disabled=!online||d.queue>0;$('memory-info').textContent=d.memory?.released?'模型已释放，下次生成自动加载':'空闲 90 秒自动释放模型';$('submit').disabled=!online||busy||uploading;const signature=JSON.stringify(jobs.map(j=>[j.prompt_id,j.status,j.images]));if(signature!==previous){previous=signature;$('history').replaceChildren();for(const j of jobs){if(!j.images.length)continue;const b=document.createElement('button');b.className='history-card'+(j.prompt_id===selected?' active':'');if(j.images.length){const im=new Image();im.src=j.images[0].url;im.loading='lazy';b.append(im);}else{const ph=document.createElement('div');ph.className='placeholder';ph.textContent=labels[j.status];b.append(ph);}const m=document.createElement('div');m.className='meta';const modelNames={krea_cutie:'Krea2 · Cutie 编辑',krea_mix:'Krea2 · Mix V8 编辑',cutie:'Krea2 · Moody Cutie',mix_v8:'Krea2 · Moody Mix',pro_mix:'ZIT · Moody Pro Mix',wild:'ZIB · Moody Wild',qwen:'Qwen · Image 2.1',ray:'Qwen · Ray Image 2.1'};const modelName=modelNames[j.generation_model]||j.label.split(' · ').slice(1).join(' · ')||j.label;const resolution=j.width&&j.height?j.width+' × '+j.height:'分辨率未知';const simpleMode=j.krea_simple_mode==='upscale'?'生成并放大 · 4×':j.krea_simple_mode==='refine'?'高清细化':'快速生成';const modeName=j.generation_workflow==='moody_krea2_rain_city'?'雨城飞鸟 · Cutie（基础版）':j.generation_workflow==='moody_krea2_i2i_4khd'?'Krea2 图片重绘 4KHD':j.generation_workflow==='moody_krea2_4khd'?'Moody Krea2 4KHD · SeedVR2':j.generation_workflow==='moody_zit_simple'?'Moody ZIT Simple · 双阶段细化':j.generation_workflow==='moody_krea2_simple'?'Moody Krea2 Simple · '+simpleMode:j.generation_workflow==='moody_zib_simple'?'Moody ZIB Simple':j.preset==='04_upscale'?'高清放大':j.preset==='03_image_edit'?'图片编辑':j.preset==='02_character_consistency'?'人物一致性':'标准生成';m.textContent=modelName+'\n'+resolution+'\n'+modeName;b.title=j.label;b.dataset.search=j.label;b.append(m);b.onclick=()=>{if(j.images[0])showLightbox(j.images[0].url);};$('history').append(b);}}const current=jobs.find(j=>j.prompt_id===selected);if(current)select(current);}catch(e){online=false;$('connection').textContent='○ 网页服务未连接';$('submit').disabled=true;}}
api('/api/config').then(d=>{token=d.token;refresh();setInterval(refresh,2000);}).catch(e=>$('error').textContent=e.message);

function showLightbox(src,sourceJob=null){lightboxSource=src;const im=$('lightbox-image'),details=$('lightbox-details');details.replaceChildren();const normalized=new URL(src,location.href).href;const job=sourceJob||jobs.find(j=>j.images.some(i=>new URL(i.url,location.href).href===normalized));function field(label,value,cls=''){if(value===undefined||value===null||value==='')return;const dl=document.createElement('dl');dl.className='parameter-item '+cls;const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=String(value);dl.append(dt,dd);details.append(dl);return dd}$('lightbox-reuse').hidden=!job;$('lightbox-reuse').onclick=async()=>{if(!job)return;if(!jobs.some(item=>item.prompt_id===job.prompt_id))jobs.push(job);closeEditor();select(job);$('lightbox').close();await $('reuse').onclick();};const size=field('图片尺寸','读取中…');im.onload=()=>{size.textContent=im.naturalWidth+' × '+im.naturalHeight+' px';setPreviewZoom(1);};im.onerror=()=>size.textContent='无法读取';if(job){field('生成模式',job.label);if(job.preset!=='04_upscale'){field('生成档位',qualityNames[job.quality||'pro_plus']);field('采样步数',job.steps??40);field('CFG',job.cfg??1);field('采样器',job.sampler_name||'euler');field('调度器',job.scheduler||'simple');if(job.generation_model==='cutie'||job.generation_model==='mix_v8')field('处理方式',['moody_krea2_4khd','moody_krea2_i2i_4khd'].includes(job.generation_workflow)?'4KHD · 自动修脸与 SeedVR2':job.krea_simple_mode==='upscale'?'生成并放大 · '+(job.workflow_settings?.upscale_factor||4)+'×':job.krea_simple_mode==='refine'?'高清细化':'快速生成');}if(job.workflow_settings)field('工作流参数',window.workflowControls?.describe(job.workflow_settings));field('画面描述',job.prompt,'parameter-prompt');if(job.original_prompt&&job.original_prompt!==job.prompt)field('原始指令',job.original_prompt);if(job.loras?.length)field('LoRA',job.loras.map(r=>r.label+' · 强度 '+r.strength+(r.preset?' · 预设 '+r.preset.name:'')+(r.clip_strength!==null?' · 文本 '+r.clip_strength:'')).join('\n'));if(job.final_prompt&&job.final_prompt!==job.prompt)field('实际提交提示词',job.final_prompt,'parameter-prompt');if(job.generated_caption){field('自动反推',job.generated_caption,'parameter-prompt');field('变化程度',job.redraw_creativity);}field('种子',job.preset==='04_upscale'?null:job.seed);field('画面比例',job.generation_workflow==='moody_krea2_i2i_4khd'?'跟随原图':job.preset==='01_text_to_image'?job.ratio:null);field('放大倍率',job.preset==='04_upscale'?job.scale:null);if(job.preset==='04_upscale')field('放大模型',job.upscale_model==='seedvr2'?'SeedVR2 3B':job.upscale_model==='hat'?'HAT':'Real-ESRGAN');field('人物特征',job.traits);field('局部编辑',job.local_edit?'仅修改选区':null);if(job.hires_local){field('选区处理',job.local_content==='rebuild'?'重建选区 · 实验':'保留原内容参考');field('局部处理尺寸',(job.local_resolution||768)+' px');}if(job.edit_diagnostics){field('编辑分支',job.edit_diagnostics.route);field('功能 LoRA',job.edit_diagnostics.functional_lora);if(job.edit_diagnostics.experimental)field('能力状态',String(job.edit_model).startsWith('krea_')?'实验功能，边缘衔接仍需检查':'实验功能，身份相似度尚未稳定');}field('画幅',job.frame==='outpaint'?'扩图 '+job.frame_ratio:job.preset==='03_image_edit'?'保持原尺寸':null);field('颜色标注',job.annotation_instructions);field('透明背景',job.transparent?'开启':null);field('局部裁剪',job.crop_edit?'开启':null);field('T8 加速',job.t8_acceleration?'开启':null);field('创建时间',new Date(job.created*1000).toLocaleString());if(job.finished)field('耗时（含排队）',Math.round(job.finished-job.created)+' 秒')}else field('图片来源','上传的参考图片，无生成参数');syncLightboxNavigation();im.src=src;if(im.complete&&im.naturalWidth)size.textContent=im.naturalWidth+' × '+im.naturalHeight+' px';if(!$('lightbox').open)$('lightbox').showModal();setPreviewZoom(1);}
$('lightbox-close').onclick=()=>$('lightbox').close();
$('lightbox').onclick=e=>{if(e.target===$('lightbox'))$('lightbox').close();};
document.addEventListener('click',e=>{const image=e.target.closest('#history img, #reference');if(!image)return;e.preventDefault();e.stopPropagation();showLightbox(image.src);},true);


$('release-memory').onclick=async()=>{try{$('release-memory').disabled=true;await api('/api/release',{method:'POST'});await refresh();}catch(e){$('error').textContent=e.message;}finally{$('release-memory').disabled=!online;}};

$('quality').onchange=applyQualitySteps;

$('upscale-model').onchange=updateQuality;

$('prompt').addEventListener('input',()=>{originalEditPrompt='';$('enhance-status').textContent='';});
$('enhance-edit').onclick=async()=>{const b=$('enhance-edit');if(!uploaded){$('error').textContent='请先上传参考图片';return;}b.disabled=true;busy=true;$('submit').disabled=true;$('enhance-status').textContent='正在分析参考图并优化指令…';try{const d=await api('/api/enhance-edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:uploaded,prompt:$('prompt').value})});originalEditPrompt=d.original_prompt;$('prompt').value=d.prompt;$('enhance-status').textContent='已优化，请检查指令后开始生成。';}catch(e){$('error').textContent=e.message;$('enhance-status').textContent='未改动原指令。';}finally{busy=false;b.disabled=false;$('submit').disabled=!online||uploading;}};

$('compare-original').onclick=()=>{const j=jobs.find(j=>j.prompt_id===selected);if(!j||!j.image||!j.images.length)return;const area=$('preview');if(area.querySelector('.comparison')){rendered='';select(j);$('compare-original').textContent='滑动对比';return;}const wrapper=document.createElement('div');wrapper.className='comparison';const result=new Image(),original=new Image();result.src=j.images[0].url;result.alt='编辑结果';original.src=inputURL(j.image);original.alt='原图';original.className='comparison-original';const control=document.createElement('input');control.type='range';control.min=0;control.max=100;control.value=50;control.setAttribute('aria-label','原图与结果分界位置');const caption=document.createElement('span');caption.className='comparison-caption';caption.textContent='左：原图 · 右：编辑结果';control.oninput=()=>original.style.clipPath=`inset(0 ${100-control.value}% 0 0)`;control.oninput();wrapper.append(result,original,caption,control);area.replaceChildren(wrapper);$('compare-original').textContent='结束对比';};

function selectRegionTool(tool){editor.tool=tool;editor.render();for(const [id,t] of [['paint','brush'],['erase','erase'],['box-region','box'],['pan-region','pan']])$(id).classList.toggle('active',tool===t);}
$('paint').onclick=()=>selectRegionTool('brush');$('erase').onclick=()=>selectRegionTool('erase');$('box-region').onclick=()=>selectRegionTool('box');$('pan-region').onclick=()=>{const tool=editor.tool==='pan'?(editor.identity?'rect':$('annotation-mode').checked?'annotate':'brush'):'pan';selectRegionTool(tool);$('pan-region').textContent=tool==='pan'?'返回标记':'拖动画布';};$('invert-region').onclick=()=>editor.invert();$('fill-region').onclick=()=>editor.fillHoles();$('zoom-in').onclick=()=>editor.setZoom(editor.zoom*1.25);$('zoom-out').onclick=()=>editor.setZoom(editor.zoom/1.25);$('fit-region').onclick=()=>editor.fit();

function extraReferenceLimit(){return mode==='03_image_edit'?(['dual','face','head','body'].includes(editTaskPolicy().task)?1:0):3;}
function canCropExtraReference(){return mode==='03_image_edit'&&['face','head'].includes(editTaskPolicy().task);}
function extraReferencePayload(){return extraReferences.map(ref=>{const {crop_rect,...copy}=ref;if(canCropExtraReference()&&crop_rect)copy.crop_rect=crop_rect.slice();return copy;});}
async function openReferenceCrop(ref){
  if(!canCropExtraReference())return;
  const dialog=document.createElement('dialog');dialog.className='reference-crop-dialog';
  dialog.innerHTML='<h3>框选参考头部</h3><p class="help">拖动框出完整头部和少量颈肩，尽量减少背景。只裁剪图2的参考范围，不会改变图1的涂抹选区。</p><div class="reference-crop-stage"><canvas aria-label="拖动框选参考图头部"></canvas></div><p class="help" role="status">正在读取参考图…</p><footer><button type="button" class="secondary" data-action="reset">重新框选</button><button type="button" class="secondary" data-action="cancel">取消</button><button type="button" class="primary" data-action="save" disabled>使用头部选区</button></footer>';
  const canvas=dialog.querySelector('canvas'),save=dialog.querySelector('[data-action=save]'),status=dialog.querySelector('[role=status]');
  // This second editor must not touch the primary image's mask, tools or zoom label.
  const cropEditor=new RegionEditor(canvas,()=>{save.disabled=!cropEditor.rect;status.textContent=cropEditor.rect?'已框选头部；可以重新拖动调整。':'请拖动框选头部，至少 32 × 32 像素。';});
  cropEditor.identity=true;cropEditor.tool='rect';
  cropEditor.view=()=>{canvas.style.transform=`translate(${cropEditor.offset[0]}px,${cropEditor.offset[1]}px) scale(${cropEditor.zoom})`;};
  dialog.querySelector('[data-action=cancel]').onclick=()=>dialog.close();
  dialog.querySelector('[data-action=reset]').onclick=()=>cropEditor.clear();
  save.onclick=()=>{if(!cropEditor.rect||!extraReferences.includes(ref)||!canCropExtraReference())return;ref.crop_rect=cropEditor.rect.slice();renderReferences();dialog.close();};
  dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  try{await cropEditor.load(inputURL(ref.image));if(!dialog.isConnected)return;cropEditor.rect=ref.crop_rect?.slice()||null;cropEditor.render();save.disabled=!cropEditor.rect;status.textContent=cropEditor.rect?'已恢复参考头部选区，可以重新拖动调整。':'请拖动框选完整头部，至少 32 × 32 像素。';}
  catch(error){status.textContent=error.message;save.disabled=true;}
}
function renderReferences(){
  const host=$('extra-references');host.replaceChildren();
  extraReferences.forEach((ref,index)=>{
    const row=document.createElement('div');row.className='extra-reference';
    const im=new Image();im.src=inputURL(ref.image);im.alt='额外参考图 '+(index+1);
    const controls=document.createElement('div');controls.className='extra-reference-controls';
    const role=document.createElement('select');role.setAttribute('aria-label','参考图 '+(index+1)+' 的用途');
    for(const [value,label] of [['identity','人物身份'],['clothing','服装配饰'],['scene','场景背景'],['style','风格']]){const option=document.createElement('option');option.value=value;option.textContent=label;role.append(option);}
    role.hidden=extraReferenceLimit()<=1;role.value=ref.role;role.onchange=()=>ref.role=role.value;controls.append(role);
    if(canCropExtraReference()){
      const crop=document.createElement('button');crop.type='button';crop.className='secondary';crop.textContent=ref.crop_rect?'调整参考头部':'框选参考头部';crop.onclick=()=>openReferenceCrop(ref);controls.append(crop);
      const info=document.createElement('small');info.textContent=ref.crop_rect?'已框选 · 仅参考头部区域':'建议裁掉多余背景，避免头部过小';controls.append(info);
      if(ref.crop_rect){const reset=document.createElement('button');reset.type='button';reset.className='secondary';reset.textContent='恢复整图';reset.onclick=()=>{delete ref.crop_rect;renderReferences();};controls.append(reset);}
    }else if(extraReferenceLimit()<=1){const info=document.createElement('small');info.textContent=extraReferenceLimit()===0?'当前模式不使用，请移除':'完整人物参考';controls.append(info);}
    const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='×';remove.setAttribute('aria-label','移除参考图 '+(index+1));remove.onclick=()=>{extraReferences.splice(index,1);renderReferences();};
    const dropHint=document.createElement('small');dropHint.textContent='拖入图片可替换';controls.append(dropHint);
    bindImageDrop(row,file=>addExtraReference(file,ref),e=>$('error').textContent=e.message,()=>!uploading&&!busy&&extraReferences.includes(ref));
    row.append(im,controls,remove);host.append(row);
  });
  $('add-reference').disabled=extraReferences.length>=extraReferenceLimit();
}
async function addExtraReference(file,replacing=null){
  if(!file||uploading||busy||(replacing?!extraReferences.includes(replacing):extraReferences.length>=extraReferenceLimit()))return;
  uploading=true;$('submit').disabled=true;
  try{
    const form=new FormData();form.append('image',file);
    const d=await api('/api/upload',{method:'POST',body:form});
    if(replacing){
      if(!extraReferences.includes(replacing))return;
      replacing.image=d.image;delete replacing.crop_rect;
    }else if(extraReferences.length<extraReferenceLimit()){
      extraReferences.push({image:d.image,role:mode==='03_image_edit'&&['face','head'].includes(document.getElementById('edit-task')?.value)?'identity':'clothing'});
    }
    renderReferences();
  }catch(e){$('error').textContent=e.message;}
  finally{uploading=false;$('submit').disabled=!online||busy;}
}
$('add-reference').onclick=()=>$('extra-file').click();$('extra-file').onchange=async e=>{await addExtraReference(e.target.files[0]);e.target.value='';};
bindImageDrop($('references-field'),addExtraReference,e=>$('error').textContent=e.message,()=>!uploading&&!busy&&extraReferences.length<extraReferenceLimit());


$('annotation-mode').onchange=()=>{$('annotation-options').hidden=!$('annotation-mode').checked;if($('annotation-mode').checked){$('local-edit').checked=false;$('edit-frame').value='original';$('frame-ratio').hidden=true;}if(editing)openEditor();regionChanged();};$('local-edit').onchange=()=>{if($('local-edit').checked){$('transparent-output').checked=false;$('edit-frame').value='original';$('frame-ratio').hidden=true;$('annotation-mode').checked=false;$('annotation-options').hidden=true;if(editing)openEditor();}regionChanged();};$('annotation-color').onchange=()=>editor.annotationColor=$('annotation-color').value;

$('edit-frame').onchange=()=>{$('frame-ratio').hidden=$('edit-frame').value!=='outpaint';if($('edit-frame').value==='outpaint'){$('local-edit').checked=false;$('annotation-mode').checked=false;$('annotation-options').hidden=true;$('transparent-output').checked=false;closeEditor();}regionChanged();};$('transparent-output').onchange=()=>{if($('transparent-output').checked){$('local-edit').checked=false;$('edit-frame').value='original';$('frame-ratio').hidden=true;}regionChanged();};

let previewZoom=1,previewPan=null;
function setPreviewZoom(value,native=false){const im=$('lightbox-image'),host=im.parentElement;if(!im.naturalWidth)return;const fit=Math.min((host.clientWidth-48)/im.naturalWidth,(host.clientHeight-48)/im.naturalHeight);previewZoom=native?1/fit:Math.max(.25,Math.min(8,value));im.style.width=Math.round(im.naturalWidth*fit*previewZoom)+'px';im.style.height=Math.round(im.naturalHeight*fit*previewZoom)+'px';$('preview-zoom-value').textContent=Math.round(fit*previewZoom*100)+'%';if(value===1&&!native){host.scrollLeft=0;host.scrollTop=0;}}
$('preview-zoom-in').onclick=()=>setPreviewZoom(previewZoom*1.25);$('preview-zoom-out').onclick=()=>setPreviewZoom(previewZoom/1.25);$('preview-fit').onclick=()=>setPreviewZoom(1);$('preview-native').onclick=()=>setPreviewZoom(1,true);
$('lightbox-image').onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.target.setPointerCapture(e.pointerId);const host=e.target.parentElement;previewPan={x:e.clientX,y:e.clientY,left:host.scrollLeft,top:host.scrollTop};};$('lightbox-image').onpointermove=e=>{if(!previewPan)return;const host=e.target.parentElement;host.scrollLeft=previewPan.left+previewPan.x-e.clientX;host.scrollTop=previewPan.top+previewPan.y-e.clientY;};$('lightbox-image').onpointerup=()=>previewPan=null;$('lightbox-image').onpointercancel=()=>previewPan=null;





let lightboxSource='';
const lightboxPrevious=document.createElement('button'),lightboxNext=document.createElement('button');
for(const [button,label,text,offset] of [[lightboxPrevious,'上一张','‹',-1],[lightboxNext,'下一张','›',1]]){
 button.type='button';button.className='lightbox-navigation '+(offset<0?'previous':'next');button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+(offset<0?'M15 6l-6 6 6 6':'M9 6l6 6-6 6')+'"/></svg>';button.setAttribute('aria-label',label);button.title=label;
 button.onclick=e=>{e.stopPropagation();navigateLightbox(offset);};
 document.querySelector('.lightbox-layout').append(button);
}
function lightboxImages(){return jobs.flatMap(j=>j.images||[]).map(i=>i.url).filter((url,i,all)=>all.indexOf(url)===i);}
function lightboxIndex(images){const current=new URL(lightboxSource,location.href).href;return images.findIndex(url=>new URL(url,location.href).href===current);}
function syncLightboxNavigation(){const images=lightboxImages(),index=lightboxIndex(images);lightboxPrevious.hidden=lightboxNext.hidden=index<0||images.length<2;lightboxPrevious.disabled=index<=0;lightboxNext.disabled=index<0||index>=images.length-1;}
function navigateLightbox(offset){const images=lightboxImages(),index=lightboxIndex(images),next=index+offset;if(index>=0&&next>=0&&next<images.length)showLightbox(images[next]);}
$('lightbox').addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();navigateLightbox(e.key==='ArrowLeft'?-1:1);}});

let livePreviewEvents;
function setPageActive(active){
  livePreviewEvents?.close();livePreviewEvents=null;
  if(!active)return;
  livePreviewEvents=new EventSource('/api/live-preview-events');
  livePreviewEvents.onmessage=event=>{try{const frame=JSON.parse(event.data),job=jobs.find(j=>j.prompt_id===frame.prompt_id);if(!job||!['queued','running'].includes(job.status))return;job.preview_url=frame.preview_url;if(frame.progress)job.progress=frame.progress;if(selected===job.prompt_id)select(job);}catch(error){console.warn('预览更新失败',error);}};
}
setPageActive(true);
window.addEventListener('pagehide',()=>livePreviewEvents?.close());
let pageTouched=false;
$('form').addEventListener('input',()=>pageTouched=true);
$('form').addEventListener('change',()=>pageTouched=true);
const viewedJobIds=new Set();
function pageTaskStatus(){const own=jobs.filter(j=>Object.values(modeSelections).includes(j.prompt_id));const running=own.find(j=>j.status==='running');if(running)return running.progress?.max?'生成中 '+Math.min(100,Math.floor(running.progress.value/running.progress.max*100))+'%':'生成中';if(own.some(j=>j.status==='queued'))return '排队中';if(own.some(j=>j.status==='success'&&!viewedJobIds.has(j.prompt_id)))return '完成';return '';}
function acknowledgeResults(){for(const j of jobs)if(j.status==='success'&&Object.values(modeSelections).includes(j.prompt_id))viewedJobIds.add(j.prompt_id);}
$('preview').addEventListener('pointerdown',acknowledgeResults);
window.studioPage={taskStatus:pageTaskStatus,acknowledgeResults,setActive:setPageActive,canClose:()=>!busy&&!uploading,hasContent:()=>!!(pageTouched||$('prompt').value.trim()||uploaded||selected||Object.values(drafts).some(Boolean))};

// Clip the visible image, not the letterboxed element around an object-fit image.
function roundImageEdges(im){
  let x=0,y=0;
  if(im.naturalWidth&&im.naturalHeight&&im.clientWidth&&im.clientHeight){
    const fit=getComputedStyle(im).objectFit;
    if(fit==='contain'||fit==='scale-down'){
      let scale=Math.min(im.clientWidth/im.naturalWidth,im.clientHeight/im.naturalHeight);
      if(fit==='scale-down')scale=Math.min(1,scale);
      x=Math.max(0,(im.clientWidth-im.naturalWidth*scale)/2);
      y=Math.max(0,(im.clientHeight-im.naturalHeight*scale)/2);
    }
  }
  im.style.setProperty('--image-inset-x',x+'px');
  im.style.setProperty('--image-inset-y',y+'px');
}
const roundedImages=new Set();
const imageEdgeObserver=new ResizeObserver(entries=>entries.forEach(entry=>roundImageEdges(entry.target)));
function observeImageEdges(){
  for(const im of roundedImages)if(!im.isConnected){imageEdgeObserver.unobserve(im);roundedImages.delete(im);}
  for(const im of document.images)if(!roundedImages.has(im)){
    roundedImages.add(im);imageEdgeObserver.observe(im);roundImageEdges(im);
  }
}
document.addEventListener('load',event=>{if(event.target instanceof HTMLImageElement)roundImageEdges(event.target);},true);
let imageEdgeFrame=0;
new MutationObserver(()=>{if(!imageEdgeFrame)imageEdgeFrame=requestAnimationFrame(()=>{imageEdgeFrame=0;observeImageEdges();});}).observe(document.body,{childList:true,subtree:true});
observeImageEdges();

// Keep a correctly proportioned canvas even before the first task is submitted.
function syncIdleCanvas(){
  const area=$('preview');
  if(selected||editing||modeImages[mode]||area.querySelector('img,.comparison'))return;
  let block=area.querySelector('.generation-placeholder.is-idle');
  if(!block){
    if(area.querySelector('.generation-placeholder:not(.is-idle)'))return;
    block=generationPlaceholder({ratio:$('ratio').value||'3:4'});
    block.classList.add('is-idle');
    block.querySelector('.generation-placeholder-label').textContent='开始创作';
    area.removeAttribute('data-job-id');area.removeAttribute('aria-busy');
    area.replaceChildren(block);
  }
  const parts=($('ratio').value||'3:4').split(':').map(Number);
  block.dataset.ratio=parts[0]>0&&parts[1]>0?parts[0]/parts[1]:.75;
  fitGenerationPlaceholder();
}
$('ratio').addEventListener('change',syncIdleCanvas);
window.addEventListener('creative-mode-change',()=>queueMicrotask(syncIdleCanvas));
new MutationObserver(syncIdleCanvas).observe($('preview'),{childList:true});
syncIdleCanvas();

// Query only while settings are visible; hardware belongs to the server host.
const hardwareSection=document.createElement('section');
hardwareSection.className='hardware-info';
hardwareSection.innerHTML='<h3 class="hardware-heading">本机硬件</h3><div class="hardware-nameplate"><div class="hardware-values"></div><small role="status">打开设置后读取</small><button type="button" class="hardware-retry" hidden>重新读取</button></div>';
$('system-panel').querySelector('h3').after(hardwareSection);
let hardwareBusy=false;
async function refreshHardware(){
  if(hardwareBusy)return;hardwareBusy=true;
  const button=hardwareSection.querySelector('button'),status=hardwareSection.querySelector('small');
  button.disabled=true;status.textContent='正在读取…';
  try{
    const data=await api('/api/hardware'),host=hardwareSection.querySelector('.hardware-values');host.replaceChildren();
    function row(label,value,detail='',capacity=''){
      const dl=document.createElement('dl'),dt=document.createElement('dt'),dd=document.createElement('dd'),name=document.createElement('strong');
      dt.textContent=label;name.textContent=value;dd.append(name);
      if(detail){const sub=document.createElement('span');sub.className='hardware-detail';sub.textContent=detail;dd.append(sub);}
      if(capacity){const badge=document.createElement('span');badge.className='hardware-capacity';badge.textContent=capacity;dt.append(badge);}
      dl.append(dt,dd);host.append(dl);return dl;
    }
    const cpu=data.cpu.name.replace(/\(R\)|\(TM\)/gi,'').replace(/\s+/g,' ').trim();
    const cpuFamily=cpu.match(/^(Intel Core|AMD Ryzen)\s+(.+)$/i);
    row('处理器',cpuFamily?cpuFamily[2]:cpu,cpuFamily?cpuFamily[1]:'');
    for(const [i,gpu] of data.gpus.entries()){
      const gpuFamily=gpu.name.match(/^(NVIDIA GeForce|AMD Radeon|Intel Arc)\s+(.+)$/i);
      row(data.gpus.length>1?'显卡 '+(i+1):'显卡',gpuFamily?gpuFamily[2]:gpu.name,gpuFamily?gpuFamily[1]:'',gpu.total_gb==null?'':gpu.total_gb+' GiB 显存');
    }
    if(!data.gpus.length)row('显卡','暂未识别');
    row('内存',data.memory.total_gb+' GiB').className='hardware-memory';
    status.textContent='';button.hidden=true;
  }catch(error){status.textContent='硬件信息暂不可用';button.hidden=false;}finally{button.disabled=false;hardwareBusy=false;}
}
hardwareSection.querySelector('button').onclick=refreshHardware;
function isZitRedraw(){return mode==='02_character_consistency'&&$('i2i-workflow')?.value==='moody_zit_i2i';}
async function submitZitRedraw(){
  if(busy||uploading)return;
  if(imageReferences.length!==1){$('error').textContent='参考图重绘需要且只能使用一张图片，请保留图1。';return;}
  busy=true;$('submit').disabled=true;$('error').textContent='';
  const image=imageReferences[0].image;
  let prompt=$('prompt').value.trim(),auto=false;
  try{
    if(!prompt){
      $('error').textContent='正在本地识图并生成提示词…';
      const description=await api('/api/describe-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,prompt:'Describe the visible subject, composition, colors, lighting and style for a faithful image-to-image redraw.',generation_model:'pro_mix'})});
      prompt=description.prompt;auto=true;$('prompt').value=prompt;
    }
    const job=await api('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workflow_settings:window.workflowControls?.payload()||{},preset:'02_character_consistency',i2i_workflow:'moody_zit_i2i',generation_model:'pro_mix',generation_workflow:'moody_zit_i2i',image,prompt,auto_caption:auto,references:[],image_resolution:$('image-resolution').value,ratio:'3:4',seed:$('seed').value,steps:Number($('generation-steps').value),cfg:Number($('generation-cfg').value),sampler_name:$('generation-sampler').value,scheduler:$('generation-scheduler').value})});
    closeEditor();jobs.push(job);rendered='';select(job);$('error').textContent='';await refresh();
  }catch(error){$('error').textContent=error.message;}finally{busy=false;$('submit').disabled=!online||uploading;}
}
window.addEventListener('DOMContentLoaded',()=>{
  const field=document.createElement('div');field.className='field';field.id='i2i-workflow-field';
  field.innerHTML='<label for="i2i-workflow">图生图方式</label><select id="i2i-workflow"><option value="qwen_reference">Qwen · 多图参考</option><option value="moody_zit_i2i">Pro Mix · 参考图重绘</option></select><div class="help">参考图重绘使用单张图片，保持原图比例；留空提示词时自动识图。不是精准换身或身份锁定。</div>';
  $('image-references-field').before(field);
  function syncRedraw(){
    field.hidden=mode!=='02_character_consistency';if(field.hidden)return;
    const redraw=isZitRedraw();
    $('generation-model').value=redraw?'pro_mix':'qwen';$('generation-model').dispatchEvent(new Event('change',{bubbles:true}));
    $('generation-model').disabled=true;
    $('ratio-field').hidden=redraw;$('quality-field').hidden=redraw;
    $('image-resolution').dispatchEvent(new Event('change',{bubbles:true}));
    $('simple-title').textContent=redraw?'参考原图，重新创作':'参考图片，创作新画面';
    $('simple-intro').textContent=redraw?'单张参考 · 自动识图 · 两阶段细化':'最多三张参考图，分别说明想参考什么。';
    $('prompt-label').textContent=redraw?'画面描述 · 可选':'你想生成什么？';
    $('prompt').placeholder=redraw?'留空自动识别参考图，也可以自己描述想要的画面。':'描述希望参考各图的哪些内容。';
    $('prompt-help').textContent=redraw?'自动识图在本机运行；也可以填写自己的完整画面描述。':'例如：图1的人物采用图2的姿势，置于图3的场景中。';
    document.querySelector('.simple-examples').hidden=redraw;
    renderImageReferences();
    if(redraw){$('image-references-field').querySelectorAll('select,textarea').forEach(el=>el.hidden=true);}
    field.querySelector('.help').hidden=!redraw;
  }
  $('i2i-workflow').onchange=syncRedraw;
  window.addEventListener('creative-mode-change',()=>queueMicrotask(syncRedraw));syncRedraw();
  const reuse=$('reuse').onclick;
  $('reuse').onclick=async()=>{const job=jobs.find(j=>j.prompt_id===selected);await reuse();if(job?.preset==='02_character_consistency'){$('i2i-workflow').value=job.i2i_workflow||'qwen_reference';syncRedraw();for(const [id,key] of [['generation-steps','steps'],['generation-cfg','cfg'],['generation-sampler','sampler_name'],['generation-scheduler','scheduler']])if(job[key]!=null)$(id).value=job[key];}};
});
new MutationObserver(()=>{if($('settings-toggle').getAttribute('aria-expanded')==='true')refreshHardware();}).observe($('settings-toggle'),{attributes:true,attributeFilter:['aria-expanded']});
