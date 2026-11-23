(() => {
  const form=document.getElementById('form');
  const fields=new Map([...document.querySelectorAll('[id]')].map(el=>[el.id,el]));
  const byId=id=>document.getElementById(id)||fields.get(id);
  const copy={
    '01_text_to_image':{title:'把想法变成图片',intro:'用一句话描述你想要的画面，就可以开始。',prompt:'你想生成什么？',placeholder:'例如：一只橘猫坐在窗边，午后的阳光照进来，像真实照片一样。',help:'说清楚画面里有什么、在什么地方即可。',action:'生成图片',examples:[['橘猫照片','一只橘猫坐在窗边，午后的阳光照进来，像真实照片一样。'],['产品展示','一瓶香水放在浅色石台上，背景简洁，柔和的灯光，适合商品展示。']]},
    '02_character_consistency':{title:'参考图片，创作新画面',intro:'最多三张参考图，分别说明想参考什么。',image:'上传一张人物照片',imageHelp:'选一张脸部清楚的照片，正面或半侧面都可以。',prompt:'你想生成什么？',placeholder:'例如：参考图1的人物、图2的服装和图3的背景，生成一张新的全身照。',help:'例如：图1的人物采用图2的姿势，置于图3的场景中。',action:'生成图片',examples:[['咖啡馆','让照片里的人穿着白色衬衫，坐在咖啡馆的窗边。'],['海边散步','让照片里的人穿着休闲服，在傍晚的海边散步。']]},
    '03_image_edit':{title:'告诉我们怎么改图',intro:'上传图片，说出要改的地方，其余设置可以不管。',image:'上传要修改的图片',imageHelp:'上传 JPG、PNG 或 WebP 图片，最大 30 MB。',prompt:'你想怎么修改这张图？',placeholder:'例如：把背景换成海边，人物和衣服保持原样。',help:'一次说清楚要改什么、哪些内容希望保留。',action:'开始修改',examples:[['换背景','把背景换成海边，主体保持原样。'],['换颜色','把主体的颜色改成蓝色，其他内容尽量保持原样。']]},
    '04_upscale':{title:'让图片更清晰',intro:'上传图片，选择放大程度，就可以开始。',image:'上传要变清晰的图片',imageHelp:'选一张想放大或改善清晰度的图片。',action:'放大图片'}
  };
  const intro=document.createElement('div');intro.className='simple-intro';intro.innerHTML='<h2 id="simple-title"></h2><p id="simple-intro"></p>';
  const basic=document.createElement('div');basic.className='simple-fields';
  for(const id of ['image-references-field','image-field','prompt-field','ratio-field','scale-field'])basic.append(byId(id));
  const examples=document.createElement('div');examples.className='simple-examples';examples.setAttribute('aria-label','填写示例');byId('prompt-field').append(examples);
  const advanced=document.createElement('details');advanced.id='simple-advanced';advanced.className='simple-advanced';const summary=document.createElement('summary');summary.textContent='更多选项（可选）';advanced.append(summary);
  const advancedHelp=document.createElement('p');advancedHelp.className='help';advancedHelp.textContent='默认设置已选好。只有需要特别调整时，才用下面的选项。';advanced.append(advancedHelp);
  for(const id of ['quality-field','upscale-model-field','region-field','identity-options','references-field','local-options','seed-field','memory-field','model-help'])advanced.append(byId(id));
  const start=document.createElement('div');start.className='simple-start';const action=document.createElement('button');action.id='simple-submit';action.type='submit';action.className='primary';action.setAttribute('form','form');start.append(action,byId('error'));const hint=document.createElement('p');hint.className='help';hint.textContent='点击后会自动排队，完成后在中间查看图片。';start.append(hint);
  form.replaceChildren(intro,basic,advanced,start);
  const modelField=document.createElement('div');modelField.className='field';modelField.innerHTML='<label for="generation-model">生图模型</label><select id="generation-model"><option value="cutie">Krea2 · Moody Cutie</option><option value="mix_v8">Krea2 · Moody Mix</option><option value="qwen">Qwen · Image 2.1</option><option value="ray">Qwen · Ray Image 2.1</option></select>';basic.append(modelField);
  basic.prepend(modelField);
  window.dispatchEvent(new CustomEvent('creative-select-added',{detail:byId('generation-model')}));
  const editModelField=document.createElement('div');editModelField.className='field';editModelField.hidden=true;editModelField.innerHTML='<label for="edit-model">编辑模型</label><select id="edit-model"><option value="qwen">Qwen · Image 2.1 原版</option><option value="ray">Ray Qwen 2.1 · 编辑强化</option></select><p class="help" id="edit-model-help"></p>';basic.prepend(editModelField);
  window.dispatchEvent(new CustomEvent('creative-select-added',{detail:byId('edit-model')}));
  function updateEditModelHelp(){byId('edit-model-help').textContent=byId('edit-model').value==='ray'?'Euler A + simple · 默认 25 步，CFG 2；更细致使用 40 步。':'原版 Qwen · 默认 30 步；更细致使用 40 步。';}
  byId('edit-model').addEventListener('change',updateEditModelHelp);updateEditModelHelp();
  const stepsField=document.createElement('div');stepsField.className='field';stepsField.innerHTML='<label for="generation-steps">采样步数</label><input id="generation-steps" type="number" min="1" max="100" step="1" value="8"><p class="help">Krea2 默认 8 步，Qwen 默认 30 步。更多步数会增加耗时，不一定更好。</p>';advancedHelp.after(stepsField);
  byId('generation-model').addEventListener('change',()=>{byId('generation-steps').value=['qwen','ray'].includes(byId('generation-model').value)?30:8;});

  const resolutionField=document.createElement('div');resolutionField.className='field';resolutionField.innerHTML='<label for="image-resolution">图像质量</label><select id="image-resolution"><option value="low">低</option><option value="medium" selected>中</option><option value="high">高</option></select><p class="help" id="resolution-help"></p>';byId('ratio-field').after(resolutionField);
  window.dispatchEvent(new CustomEvent('creative-select-added',{detail:byId('image-resolution')}));
  const resolutionSizes={low:{'3:4':[576,768],'4:3':[768,576],'1:1':[768,768],'9:16':[576,1024],'16:9':[1024,576]},medium:{'3:4':[768,1024],'4:3':[1024,768],'1:1':[1024,1024],'9:16':[720,1280],'16:9':[1280,720]},high:{'3:4':[1152,1536],'4:3':[1536,1152],'1:1':[1536,1536],'9:16':[864,1536],'16:9':[1536,864]}};
  function updateResolution(){const select=byId('image-resolution'),labels={low:'低',medium:'中',high:'高'};let changed=false;for(const option of select.options){const size=resolutionSizes[option.value][byId('ratio').value];const text=labels[option.value]+' · '+size.join(' × ');if(option.textContent!==text){option.textContent=text;changed=true;}}byId('resolution-help').hidden=true;if(changed)select.dispatchEvent(new Event('change',{bubbles:true}));}
  byId('image-resolution').addEventListener('change',updateResolution);byId('ratio').addEventListener('change',updateResolution);updateResolution();
  const editTasks={
    general:{label:'普通编辑',help:'描述想修改的内容。',prompt:''},
    local:{label:'局部编辑',help:'点击“涂抹修改区域”，在画布上标记，再描述修改要求。',prompt:''}
  };
  const taskField=document.createElement('div');taskField.className='field';taskField.hidden=true;
  const taskLabel=document.createElement('label');taskLabel.textContent='想怎么编辑？';
  const taskButtons=document.createElement('div');taskButtons.className='simple-examples';
  const taskHelp=document.createElement('p');taskHelp.className='help';
  taskField.append(taskLabel,taskButtons,taskHelp);basic.prepend(taskField);
  let editTask='general';
  const taskInput=document.createElement('input');taskInput.type='hidden';taskInput.id='edit-task';taskInput.value='general';form.append(taskInput);
  window.addEventListener('creative-edit-task',e=>applyTask(editTasks[e.detail]?e.detail:'general'));
  function applyTask(key){
    editTask=key;taskInput.value=key;const task=editTasks[key];taskHelp.textContent=task.help;
    const swap=['face','head','body'].includes(key);
    byId('references-field').querySelector('label').textContent=swap?'图1 · '+(key==='face'?'人脸参考':key==='head'?'头部参考':'身体与服装参考')+' · 1 张':'额外参考图 · 最多 3 张';
    byId('references-field').querySelector('.help').textContent=swap?'上传一张参考图，提供要替换的'+(key==='face'?'人脸':key==='head'?'头部和头发':'身体与服装')+'。':'为每张图片指定用途，减少人物、服装与场景混淆。';
    if(swap)for(const ref of extraReferences)ref.role=key==='body'?'clothing':'identity';
    renderReferences();
    byId('error').textContent='';
    for(const b of taskButtons.children)b.setAttribute('aria-pressed',String(b.dataset.task===key));
    byId('transparent-output').checked=key==='cutout';byId('local-edit').checked=key==='local';
    byId('edit-frame').value='original';byId('frame-ratio').hidden=true;byId('annotation-mode').checked=false;byId('annotation-options').hidden=true;
    if(task.prompt){byId('prompt').value=task.prompt;byId('prompt').dispatchEvent(new Event('input',{bubbles:true}));}
    if(['face','head','body','style'].includes(key)){basic.insertBefore(byId('references-field'),swap?byId('image-field'):byId('prompt-field'));byId('references-field').hidden=false;}
    else advanced.append(byId('references-field'));
    if(key==='local'){basic.insertBefore(byId('region-field'),byId('prompt-field'));byId('region-open').textContent='涂抹修改区域';}
    else advanced.append(byId('region-field'));
    updateSwapLabels();
    regionChanged();
  }
  function updateSwapLabels(){
    const swap=mode==='03_image_edit'&&['face','head','body'].includes(editTask);
    const imageLabel=byId('image-field').querySelector('label');imageLabel.className='step-label';imageLabel.dataset.step=swap?'2':'1';imageLabel.textContent=swap?'图2 · 要修改的图片':copy[mode].image||'上传图片';
    byId('prompt-label').dataset.step=swap?'3':mode==='01_text_to_image'?'1':'2';
  }
  for(const [key,task] of Object.entries(editTasks)){const b=document.createElement('button');b.type='button';b.className='example-pill';b.dataset.task=key;b.textContent=task.label;b.onclick=()=>applyTask(key);taskButtons.append(b);}
  document.body.classList.add('simple-panel');
  document.querySelector('.settings-title')?.remove();document.querySelector('.properties-tabs')?.remove();document.querySelector('.settings').setAttribute('aria-label','创作面板');
  const label=(field,text)=>{field.querySelector('label').textContent=text;};
  function renameOptions(select,names){for(const option of select.options){const value=option.value;option.value=value;if(names[value])option.textContent=names[value];}select.dispatchEvent(new Event('change',{bubbles:true}));}
  renameOptions(byId('ratio'),{'3:4':'3:4','4:3':'4:3','1:1':'1:1','9:16':'9:16','16:9':'16:9'});
  renameOptions(byId('scale'),{'2x':'放大 2 倍 · 推荐','4x':'放大 4 倍 · 更大'});
  renameOptions(byId('quality'),{lite:'快速预览',pro:'推荐效果',pro_plus:'更细致 · 耗时更长'});
  label(byId('quality-field'),'处理方式');byId('quality-field').querySelector('.comfy-select-trigger').setAttribute('aria-label','处理方式');
  label(byId('scale-field'),'想放大多少？');byId('scale-field').querySelector('.comfy-select-trigger').setAttribute('aria-label','想放大多少？');
  label(byId('ratio-field'),'图片形状');byId('ratio-field').querySelector('.comfy-select-trigger').setAttribute('aria-label','图片形状');
  const uploadZone=document.querySelector('.upload');uploadZone.childNodes[0].textContent='＋ 点击上传，也可以拖入图片';uploadZone.tabIndex=0;uploadZone.setAttribute('role','button');uploadZone.setAttribute('aria-label','上传图片');uploadZone.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();byId('file').click();}};
  byId('prompt-label').htmlFor='prompt';byId('prompt').setAttribute('aria-describedby','prompt-help');
  byId('enhance-edit').textContent='帮我把要求说清楚';
  function syncAction(){action.disabled=byId('submit').disabled;action.textContent=uploading?'图片上传中…':busy?'处理中…':copy[mode].action;}
  let previousMode,textGenerationModel;
  function update(){
    const c=copy[mode],text=mode==='01_text_to_image',up=mode==='04_upscale';
    examples.hidden=text;byId('prompt-help').hidden=text;stepsField.hidden=!text;byId('generation-steps').disabled=!text;
    if(up)byId('scale-field').before(byId('upscale-model-field'));else advanced.append(byId('upscale-model-field'));modelField.hidden=!text;if(text){byId('quality-field').hidden=true;byId('simple-intro').textContent='';}
    const i2i=mode==='02_character_consistency';
    if(i2i&&previousMode!==mode)textGenerationModel=byId('generation-model').value;
    if(text&&previousMode==='02_character_consistency'){byId('generation-model').value=textGenerationModel||'cutie';byId('generation-model').dispatchEvent(new Event('change'));}
    byId('image-references-field').hidden=!i2i;byId('image-field').hidden=text||i2i;byId('identity-options').hidden=true;if(i2i){byId('region-field').hidden=true;byId('references-field').hidden=true;byId('ratio-field').hidden=false;modelField.hidden=false;byId('generation-model').value='qwen';byId('generation-model').disabled=true;}else byId('generation-model').disabled=false;
    resolutionField.hidden=!(text||i2i);updateResolution();
    taskField.hidden=mode!=='03_image_edit';editModelField.hidden=mode!=='03_image_edit';
    if(previousMode!==mode){advanced.append(byId('references-field'),byId('region-field'));if(mode==='03_image_edit')applyTask('general');}
    byId('simple-title').textContent=c.title;byId('simple-intro').textContent=c.intro;
    const imageLabel=byId('image-field').querySelector('label');imageLabel.className='step-label';imageLabel.dataset.step='1';imageLabel.textContent=c.image||'上传图片';
    byId('image-help').textContent=c.imageHelp||'';
    byId('prompt-label').className='step-label';byId('prompt-label').dataset.step=text?'1':'2';byId('prompt-label').textContent=c.prompt||'';
    byId('prompt').placeholder=c.placeholder||'';byId('prompt-help').textContent=c.help||'';
    const ratioLabel=byId('ratio-field').querySelector('label');ratioLabel.className='step-label';ratioLabel.dataset.step=i2i?'4':'3';
    const scaleLabel=byId('scale-field').querySelector('label');scaleLabel.className='step-label';scaleLabel.dataset.step='2';
    if(previousMode!==mode){advanced.open=false;examples.replaceChildren();for(const [title,prompt] of c.examples||[]){const b=document.createElement('button');b.type='button';b.className='example-pill';b.textContent='试试：'+title;b.onclick=()=>{byId('prompt').value=prompt;byId('prompt').dispatchEvent(new Event('input',{bubbles:true}));byId('prompt').focus();};examples.append(b);}previousMode=mode;}
    updateSwapLabels();byId('prompt').required=false;syncAction();
  }
  new MutationObserver(syncAction).observe(byId('submit'),{attributes:true,attributeFilter:['disabled'],childList:true});
  window.addEventListener('creative-mode-change',update);
  form.addEventListener('submit',e=>{
    if(editTask==='watermark'&&extraReferences.length){e.preventDefault();e.stopImmediatePropagation();byId('error').textContent='去水印只需要原图，请移除额外参考图。';return;}
    if(mode==='03_image_edit'&&['face','head','body'].includes(editTask)&&extraReferences.length!==1){e.preventDefault();e.stopImmediatePropagation();byId('error').textContent='请上传一张参考图（图1），用于'+(editTask==='face'?'人脸':editTask==='head'?'头部和头发':'身体与服装')+'。';return;}
    if(mode==='03_image_edit'&&editTask==='face'&&!extraReferences.some(ref=>ref.role==='identity')){e.preventDefault();e.stopImmediatePropagation();byId('error').textContent='请添加人物参考图，并将用途设为“人物身份”。';return;}
    const missingImage=mode==='02_character_consistency'?!imageReferences.length:mode!=='01_text_to_image'&&!uploaded;
    const missingPrompt=mode!=='04_upscale'&&!byId('prompt').value.trim();
    if(missingImage||missingPrompt){e.preventDefault();e.stopImmediatePropagation();byId('error').textContent=missingImage?'先上传一张图片，就可以继续。':mode==='03_image_edit'?'先写一句你想怎么修改，例如“把背景换成海边”。':'先写一句你想要的画面，也可以点击上面的示例。';(missingImage?uploadZone:byId('prompt')).focus();}
  },true);
  form.addEventListener('input',()=>{if(byId('error').textContent.startsWith('先')&&(mode==='01_text_to_image'||uploaded)&&(mode==='04_upscale'||byId('prompt').value.trim()))byId('error').textContent='';});
  update();
})();

(() => {
  const form=document.getElementById('form');
  let frame=0;
  function renumber(){frame=0;const labels=[...form.querySelectorAll('.step-label')].filter(label=>label.getClientRects().length);labels.forEach((label,index)=>label.dataset.step=String(index+1));}
  function schedule(){if(!frame)frame=requestAnimationFrame(renumber);}
  new MutationObserver(schedule).observe(form,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
  window.addEventListener('creative-mode-change',schedule);
  window.renumberVisibleSteps=schedule;
  schedule();
})();



// Local editing always uses the high-resolution crop-and-stitch path.
const localCropOption=document.getElementById("crop-edit");if(localCropOption){localCropOption.checked=true;const row=localCropOption.closest("label");if(row)row.hidden=true;}
