(() => {
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const panelAnimations=new WeakMap();
  function floatingPanel(panel,open){
    const wasHidden=panel.hidden,opacity=wasHidden?0:Number(getComputedStyle(panel).opacity);
    panelAnimations.get(panel)?.cancel();panel.inert=!open;
    if(reducedMotion.matches){panel.hidden=!open;return;}
    if(open)panel.hidden=false;
    const animation=panel.animate([{opacity,transform:wasHidden?'translateY(-4px)':getComputedStyle(panel).transform},{opacity:open?1:0,transform:open?'translateY(0)':'translateY(-3px)'}],{duration:open?140:90,easing:'cubic-bezier(.2,0,0,1)'});
    panelAnimations.set(panel,animation);
    animation.finished.then(()=>{if(panelAnimations.get(panel)!==animation)return;panel.hidden=!open;panelAnimations.delete(panel);}).catch(()=>{});
  }
  const icons = {
    "models": "<path d=\"m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9M8 5.3l8 4.5\"/>",
    "assets": "<rect x=\"6\" y=\"3\" width=\"15\" height=\"15\" rx=\"2\"/><path d=\"M3 7v12a2 2 0 0 0 2 2h12M6 14l4-4 4 4 3-3 4 4\"/><circle cx=\"16.5\" cy=\"7.5\" r=\"1\"/>",
    "prompts": "<path d=\"M5 3h11l4 4v14H5zM16 3v5h4M9 11h6M9 15h7M9 18h4\"/><path d=\"M2 6v12\"/>",
    "references": "<rect x=\"2\" y=\"4\" width=\"8\" height=\"10\" rx=\"1.5\"/><path d=\"m2 11 3-3 5 5M14 9h6l2 2v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-4M13 3h6M16 1v4M7 18h5m-2-2 2 2-2 2\"/>",
    "folder": "<path d=\"M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18\"/>",
    "file": "<path d=\"M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h5\"/>",
    "chevron": "<path d=\"m9 5 7 7-7 7\"/>",
    "refresh": "<path d=\"M20 9a8 8 0 0 0-14-4L3 8m0-5v5h5M4 15a8 8 0 0 0 14 4l3-3m0 5v-5h-5\"/>",
    "image": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><circle cx=\"8\" cy=\"8\" r=\"1.5\"/><path d=\"m3 17 6-6 4 4 3-3 5 5\"/>",
    "wand": "<path d=\"M14 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M3 17l5-5 4 4 3-3 6 5M18 2l1.2 3.8L23 7l-3.8 1.2L18 12l-1.2-3.8L13 7l3.8-1.2z\"/>",
    "person": "<circle cx=\"12\" cy=\"8\" r=\"3.5\"/><path d=\"M5 21v-2a7 7 0 0 1 14 0v2\"/>",
    "edit": "<path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6M10 15l1-4L19 3a2 2 0 0 1 3 3l-8 8zM17 5l3 3M6 17h6\"/>",
    "expand": "<path d=\"M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 16l8-8M11 8h5v5\"/>",
    "panel": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><path d=\"M15 3v18M18 8v8\"/>",
    "settings": "<path d=\"M4 6h16M4 12h16M4 18h16\"/><rect x=\"7\" y=\"4\" width=\"4\" height=\"4\" rx=\"1\" fill=\"#171717\"/><rect x=\"14\" y=\"10\" width=\"4\" height=\"4\" rx=\"1\" fill=\"#171717\"/><rect x=\"7\" y=\"16\" width=\"4\" height=\"4\" rx=\"1\" fill=\"#171717\"/>",
    "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m15.5 15.5 5 5\"/>",
    "fit": "<path d=\"M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5\"/><rect x=\"7\" y=\"7\" width=\"10\" height=\"10\" rx=\"2\"/>",
    "pointer": "<path d=\"m5 3 3 17 4-6 7-2z\"/>"
};
  const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
  const buttons = [...document.querySelectorAll('#tabs .tab')];
  let modeAnimation;
  new MutationObserver(()=>{if(reducedMotion.matches)return;modeAnimation?.cancel();modeAnimation=document.getElementById('form').animate([{opacity:.65},{opacity:1}],{duration:120,easing:'cubic-bezier(.4,0,.2,1)'});}).observe(document.getElementById('tool-title'),{childList:true});
  buttons.forEach((button,i) => {
    const label = button.textContent;
    button.dataset.tooltip=label;button.setAttribute('aria-label',label);
    button.insertAdjacentHTML('afterbegin',icon(['wand','references','edit','expand'][i]));
  });
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML=icon(el.dataset.icon));
  const submit = document.getElementById('submit');
  submit.setAttribute('form','form');
  document.getElementById('run-slot').append(submit);
  document.querySelectorAll('#compare-original,#reuse,#download').forEach(el => document.getElementById('result-actions').append(el));
  const assetsButton=document.getElementById('history-toggle');
  assetsButton.className='rail-button';assetsButton.setAttribute('aria-label','媒体资产');assetsButton.dataset.tooltip='媒体资产';assetsButton.innerHTML=icon('assets');
  document.getElementById('assets-slot').append(assetsButton);
  const modelsButton=document.createElement('button');modelsButton.className='rail-button';modelsButton.dataset.tooltip='模型库';modelsButton.setAttribute('aria-label','模型库');modelsButton.setAttribute('aria-expanded','false');modelsButton.innerHTML=icon('models');document.getElementById('assets-slot').append(modelsButton);
  const modelsPanel=document.createElement('aside');modelsPanel.id='models-drawer';modelsPanel.inert=true;modelsPanel.setAttribute('aria-label','模型库');
  modelsPanel.innerHTML='<div class="models-heading"><b>模型库</b><button type="button" aria-label="刷新模型库">'+icon('refresh')+'</button></div><div class="asset-search">'+icon('search')+'<input aria-label="搜索模型" placeholder="搜索模型…"></div><div class="models-list"></div>';
  document.body.append(modelsPanel);const modelsList=modelsPanel.querySelector('.models-list'),modelSearch=modelsPanel.querySelector('input');let modelGroups=[];const expandedModels=new Set();
  let modelMenu;
  function closeModelMenu(){modelMenu?.remove();modelMenu=null;}
  function openModelMenu(event,group,file){
    event.preventDefault();closeModelMenu();const menu=document.createElement('div');modelMenu=menu;menu.className='model-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','模型操作');
    const folder=document.createElement('button');folder.type='button';folder.setAttribute('role','menuitem');folder.textContent='打开所在文件夹';folder.disabled=!file.installed;folder.onclick=async()=>{closeModelMenu();try{await api('/api/models/open-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:group.name,name:file.name})});}catch(error){document.getElementById('error').textContent=error.message;}};menu.append(folder);
    const editInfo=document.createElement('button');editInfo.type='button';editInfo.setAttribute('role','menuitem');editInfo.textContent='编辑信息';editInfo.onclick=()=>{closeModelMenu();openModelInfo(file);};menu.append(editInfo);
    if(file.source){const source=document.createElement('a');source.setAttribute('role','menuitem');source.textContent='查看来源';source.href=file.source;source.target='_blank';source.rel='noopener noreferrer';source.onclick=closeModelMenu;menu.append(source);}else{const source=document.createElement('button');source.type='button';source.setAttribute('role','menuitem');source.textContent='查看来源 · 待补充';source.disabled=true;menu.append(source);}
    if(!file.installed){const download=document.createElement('button');download.type='button';download.setAttribute('role','menuitem');download.textContent=file.download?.status==='downloading'?'下载中…':file.download_url?'下载模型':'前往来源下载';download.disabled=file.download?.status==='downloading'||(!file.download_url&&!file.source);download.onclick=async()=>{closeModelMenu();if(!file.download_url){window.open(file.source,'_blank','noopener');return;}try{await api('/api/models/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:file.id})});loadModels();}catch(error){document.getElementById('error').textContent=error.message;}};menu.append(download);}
    document.body.append(menu);const rect=menu.getBoundingClientRect();menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-rect.width-4))+'px';menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-rect.height-4))+'px';menu.querySelector('button:not(:disabled),a')?.focus();
    menu.onkeydown=e=>{if(e.key==='Escape'){closeModelMenu();e.preventDefault();}if(e.key==='ArrowDown'||e.key==='ArrowUp'){const items=[...menu.querySelectorAll('button:not(:disabled),a')];const index=items.indexOf(document.activeElement);items[(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();e.preventDefault();}};
  }
  document.addEventListener('pointerdown',e=>{if(modelMenu&&!modelMenu.contains(e.target))closeModelMenu();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModelMenu();});modelsList.addEventListener('scroll',closeModelMenu);
  function openModelInfo(file){
    if(file.id.startsWith('loras/')&&window.openLoRAInfo){window.openLoRAInfo(file);return;}
    const dialog=document.createElement('dialog');dialog.className='model-info-dialog';
    dialog.innerHTML='<form><h3>编辑模型信息</h3><label>原始文件名<input class="model-original" readonly></label><label>备注名称<input class="model-label" maxlength="100" placeholder="留空则显示原名称"></label><label>来源链接<input class="model-source" type="url" maxlength="2000" placeholder="https://"></label><p class="model-info-error" role="status"></p><div><button type="button" class="secondary model-cancel">取消</button><button type="submit" class="secondary">保存</button></div></form>';
    dialog.querySelector('.model-original').value=file.name;dialog.querySelector('.model-label').value=file.label||'';dialog.querySelector('.model-source').value=file.source||'';
    dialog.querySelector('.model-cancel').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const save=dialog.querySelector('[type=submit]');save.disabled=true;try{await api('/api/models/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:file.id,label:dialog.querySelector('.model-label').value,source:dialog.querySelector('.model-source').value})});await loadModels();dialog.close();}catch(error){dialog.querySelector('.model-info-error').textContent=error.message;}finally{save.disabled=false;}};
    document.body.append(dialog);dialog.showModal();dialog.querySelector('.model-label').focus();
  }
  function modelName(file){return file.label||file.name.replace(/\.(safetensors|gguf|pth|pt|bin|ckpt|onnx)$/i,'');}
  function renderModels(){
    const query=modelSearch.value.trim().toLowerCase();modelsList.replaceChildren();let total=0;

    for(const group of modelGroups){
      if(!group.files.length)continue;
      const title=group.label||'其他组件 · '+group.name,description=group.description||'供特定功能使用的辅助组件。';
      const files=group.files.filter(file=>(file.name+' '+modelName(file)+' '+title+' '+description+' '+group.name).toLowerCase().includes(query));if(!files.length)continue;total+=files.length;
      const section=document.createElement('details');section.open=!!query||expandedModels.has(group.name);section.ontoggle=()=>{if(!modelSearch.value.trim()){if(section.open)expandedModels.add(group.name);else expandedModels.delete(group.name);}};const heading=document.createElement('summary');heading.innerHTML=icon('chevron')+icon('folder');const label=document.createElement('span');label.className='model-category';label.textContent=title;heading.append(label);
      const count=document.createElement('span');count.className='model-count';count.textContent=String(files.length);heading.append(count);section.append(heading);
      heading.title=description;
      for(const file of files){const row=document.createElement('div');row.className='model-file';row.tabIndex=0;row.oncontextmenu=e=>openModelMenu(e,group,file);row.onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){const rect=row.getBoundingClientRect();openModelMenu({preventDefault:()=>e.preventDefault(),clientX:rect.left+20,clientY:rect.bottom},group,file);}};const name=document.createElement('span');name.textContent=modelName(file);const size=file.bytes>=1073741824?(file.bytes/1073741824).toFixed(2)+' GB':(file.bytes/1048576).toFixed(1)+' MB';row.title=file.name+' · '+size;row.innerHTML=icon('file');row.append(name);if(!file.installed){const status=document.createElement('small');status.className='model-install-status';const state=file.download;status.textContent=state?.status==='downloading'?Math.floor(state.received/state.total*100)+'%':state?.status==='error'?'下载失败':'未安装';status.title=state?.error||'';row.append(status);}section.append(row);}modelsList.append(section);
    }
    if(!total){const empty=document.createElement('p');empty.className='help';empty.textContent=query?'没有匹配的模型':'暂未找到已安装的模型';modelsList.append(empty);}
  }
  async function loadModels(){if(!modelGroups.length)modelsList.textContent='正在读取模型清单…';try{const data=await api('/api/models');modelGroups=data.groups;renderModels();}catch(error){modelsList.textContent=error.message;}}
  window.addEventListener('lora-library-updated',()=>{if(document.body.classList.contains('models-open'))loadModels();});
  setInterval(()=>{if(document.body.classList.contains('models-open')&&modelGroups.some(g=>g.files.some(f=>f.download?.status==='downloading')))loadModels();},2000);
  function switchDrawer(){document.body.classList.add('drawer-switching');requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.remove('drawer-switching')));}
  function showModels(open){if(open&&document.body.classList.contains('prompts-open')){switchDrawer();showPrompts(false);}if(open&&document.body.classList.contains('history-open')){switchDrawer();assetsButton.click();}document.body.classList.toggle('models-open',open);modelsPanel.inert=!open;modelsButton.setAttribute('aria-expanded',String(open));modelsButton.classList.toggle('active',open);if(open)loadModels();}
  modelsButton.onclick=()=>showModels(!document.body.classList.contains('models-open'));modelsPanel.querySelector('button').onclick=loadModels;modelSearch.oninput=renderModels;
  assetsButton.addEventListener('click',()=>{if(document.body.classList.contains('models-open')){switchDrawer();showModels(false);}if(document.body.classList.contains('prompts-open')){switchDrawer();showPrompts(false);}});
  buttons.forEach(button=>button.addEventListener('click',()=>{showModels(false);showPrompts(false);if(document.body.classList.contains('history-open'))assetsButton.click();}));
  const promptsButton=document.createElement('button');promptsButton.className='rail-button';promptsButton.dataset.tooltip='提示词库';promptsButton.setAttribute('aria-label','提示词库');promptsButton.setAttribute('aria-expanded','false');promptsButton.innerHTML=icon('prompts');modelsButton.after(promptsButton);
  const promptsPanel=document.createElement('aside');promptsPanel.id='prompts-drawer';promptsPanel.inert=true;promptsPanel.setAttribute('aria-label','提示词库');
  promptsPanel.innerHTML='<div class="models-heading"><b>提示词库</b><button type="button" aria-label="关闭提示词库">×</button></div><div class="asset-search">'+icon('search')+'<input aria-label="搜索提示词" placeholder="搜索提示词…"></div><p class="help prompt-library-status" role="status"></p><div class="prompt-list"></div>';
  const newPromptBar=document.createElement('div');newPromptBar.className='prompt-create-bar';const newPromptButton=document.createElement('button');newPromptButton.type='button';newPromptButton.className='secondary';newPromptButton.id='new-prompt';newPromptButton.textContent='＋ 新建提示词';newPromptBar.append(newPromptButton);promptsPanel.querySelector('.asset-search').after(newPromptBar);
  document.body.append(promptsPanel);let savedPrompts=[];const searchPrompts=promptsPanel.querySelector('.asset-search input'),promptStatus=promptsPanel.querySelector('[role=status]'),promptList=promptsPanel.querySelector('.prompt-list');
  const promptModes={'01_text_to_image':'文生图','02_character_consistency':'图生图','03_image_edit':'图片编辑','general':'通用'};
  async function persistPrompts(rows){await api('/api/prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rows)});savedPrompts=rows;renderPrompts();}
  function formattedPrompt(value){
    const content=document.createElement('section');content.className='prompt-content';let paragraph=[],list=null;
    function inline(node,text){for(const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)){if(part.startsWith('**')&&part.endsWith('**')){const strong=document.createElement('strong');strong.textContent=part.slice(2,-2);node.append(strong);}else if(part.startsWith('`')&&part.endsWith('`')){const code=document.createElement('code');code.textContent=part.slice(1,-1);node.append(code);}else node.append(document.createTextNode(part));}}
    function flush(){if(paragraph.length){const p=document.createElement('p');inline(p,paragraph.join(' '));content.append(p);paragraph=[];}list=null;}
    for(const line of value.replace(/\r\n/g,'\n').split('\n')){
      const heading=line.match(/^\s*#{1,6}\s+(.+)$/),item=line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
      if(!line.trim()){flush();continue;}
      if(heading){flush();const h=document.createElement('h4');inline(h,heading[1].replace(/^\[(.*)\]$/,'$1'));content.append(h);}
      else if(item){if(paragraph.length)flush();if(!list){list=document.createElement('ul');content.append(list);}const li=document.createElement('li');inline(li,item[1]);list.append(li);}
      else{if(list)flush();paragraph.push(line.trim());}
    }flush();return content;
  }
  const promptDetails=document.createElement('dialog');promptDetails.className='prompt-details';promptDetails.innerHTML='<div class="prompt-details-heading"><h3></h3><button type="button" class="secondary" aria-label="关闭提示词详情">×</button></div><div class="prompt-details-body"></div>';document.body.append(promptDetails);
  promptDetails.querySelector('button').onclick=()=>promptDetails.close();promptDetails.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();promptDetails.close();}});
  promptDetails.onclick=e=>{if(e.target===promptDetails){const r=promptDetails.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)promptDetails.close();}};
  function viewPrompt(row){promptDetails.querySelector('h3').textContent=row.title;promptDetails.querySelector('.prompt-details-body').replaceChildren(formattedPrompt(row.prompt));promptDetails.showModal();}
  function openPromptComposer(editingRow=null){
    promptDetails.querySelector('h3').textContent=editingRow?'编辑提示词':'新建提示词';const body=promptDetails.querySelector('.prompt-details-body');body.replaceChildren();
    const creator=document.createElement('div');creator.className='prompt-creator';creator.innerHTML='<label>标题<input class="draft-title" aria-label="新提示词标题" maxlength="100" placeholder="留空，由助手自动生成"></label><label>标签<input class="draft-tags" aria-label="提示词标签" maxlength="500" placeholder="多个标签用逗号分隔，例如：人像，海滩，写真"></label><label>提示词正文<textarea class="draft-preview" aria-label="提示词正文" maxlength="10000" placeholder="可直接输入或修改提示词，也可以让下方助手生成。"></textarea></label><div class="draft-conversation" aria-live="polite"></div><img class="draft-reference" alt="倒推参考图片" hidden><textarea aria-label="提示词修改要求" placeholder="例如：一只橘猫坐在窗边，水彩风格。生成后可以说：把背景改成花园，其他不变。"></textarea><input class="draft-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="draft-tools"><button type="button" class="secondary draft-upload">上传图片</button><button type="button" class="secondary draft-send">生成提示词</button><button type="button" class="secondary draft-undo" disabled>撤回上一步</button></div><p class="draft-status help" role="status"></p><div class="draft-footer"><button type="button" class="secondary draft-save" disabled>保存到提示词库</button><button type="button" class="secondary draft-apply" disabled>应用</button></div>';
    body.append(creator);const tags=creator.querySelector('.draft-tags'),title=creator.querySelector('.draft-title'),request=creator.querySelector('textarea[aria-label="提示词修改要求"]'),preview=creator.querySelector('.draft-preview'),conversation=creator.querySelector('.draft-conversation'),status=creator.querySelector('.draft-status'),file=creator.querySelector('.draft-file'),reference=creator.querySelector('img'),send=creator.querySelector('.draft-send'),save=creator.querySelector('.draft-save'),apply=creator.querySelector('.draft-apply'),undo=creator.querySelector('.draft-undo'),upload=creator.querySelector('.draft-upload');let draft=editingRow?.prompt||'',image='',pending=false;const versions=[];title.value=editingRow?.title||'';tags.value=(editingRow?.tags||[]).join('，');if(editingRow)save.textContent='保存修改';
    function renderDraft(){preview.value=draft;save.disabled=apply.disabled=!draft.trim();undo.disabled=!versions.length;send.textContent=draft?'发送修改要求':'生成提示词';}
    function busy(value){pending=value;creator.querySelectorAll('button').forEach(b=>b.disabled=value);request.disabled=preview.disabled=title.disabled=series.disabled=tags.disabled=value;if(!value){save.disabled=apply.disabled=!draft.trim();undo.disabled=!versions.length;}}
    preview.oninput=()=>{draft=preview.value;save.disabled=apply.disabled=!draft.trim();send.textContent=draft.trim()?'发送修改要求':'生成提示词';};
    upload.onclick=()=>file.click();
    const formatButton=document.createElement('button');formatButton.type='button';formatButton.className='secondary';formatButton.textContent='整理为模板';upload.after(formatButton);
    formatButton.onclick=async()=>{if(pending||!draft.trim())return;const original=draft;busy(true);status.textContent='正在整理模板…';try{const result=await api('/api/enhance-prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:original,task:'format'})});versions.push({prompt:original,title:title.value});draft=result.prompt;const message=document.createElement('p');message.textContent='整理为标准模板';conversation.append(message);renderDraft();status.textContent='已整理，可撤回或保存';}catch(error){status.textContent=error.message;}finally{busy(false);}};
    async function receiveDraftImage(selectedFile){if(!selectedFile||pending)return;busy(true);status.textContent='正在上传图片…';try{const form=new FormData();form.append('image',selectedFile);const result=await api('/api/upload',{method:'POST',body:form});image=result.image;reference.src=result.url;reference.hidden=false;send.textContent='倒推提示词';status.textContent='图片已上传，可填写补充要求后生成';}catch(e){status.textContent=e.message;}finally{file.value='';busy(false);}}
    file.onchange=()=>receiveDraftImage(file.files[0]);for(const target of [upload,reference])bindImageDrop(target,receiveDraftImage,e=>status.textContent=e.message,()=>!pending);
    send.onclick=async()=>{
      if(pending)return;const instruction=request.value.trim();if(!instruction&&!image){status.textContent='先描述想法或上传图片';request.focus();return;}
      busy(true);status.textContent=!draft&&image?'正在分析图片…':'正在优化提示词…';
      try{const route=!draft&&image?'/api/describe-image':'/api/enhance-prompt';const text=draft?'Edit the existing prompt according to the latest request. Change only requested details; preserve everything else. Existing prompt:\n'+draft+'\nLatest request:\n'+instruction:instruction;
        const result=await api(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,prompt:text,task:draft?'modify':'enhance',auto_title:!title.value.trim()})});
        versions.push({prompt:draft,title:title.value});draft=result.prompt;if(result.title&&!title.value.trim())title.value=result.title;const message=document.createElement('p');message.textContent=instruction||'从上传图片生成提示词';conversation.append(message);request.value='';renderDraft();status.textContent='已生成，可以继续修改或保存';
      }catch(e){status.textContent=e.message;}finally{busy(false);}
    };
    undo.onclick=()=>{const previous=versions.pop();if(!previous)return;draft=previous.prompt;title.value=previous.title;conversation.lastElementChild?.remove();renderDraft();status.textContent='已撤回上一步';};
    save.onclick=async()=>{if(!draft||pending)return;if(!title.value.trim()){status.textContent='请输入标题';title.focus();return;}busy(true);try{let name=title.value.trim(),n=2;while(savedPrompts.some(p=>p!==editingRow&&p.title===name))name=title.value.trim()+'（'+n+++'）';const updated={...editingRow,title:name,prompt:draft,tags:[...new Set(tags.value.split(/[,，;；\n]/).map(t=>t.trim()).filter(Boolean))],mode:editingRow?.mode||'01_text_to_image'};if(editingRow&&!savedPrompts.includes(editingRow))throw Error('原提示词已变更，请关闭弹窗后重新编辑');await persistPrompts(editingRow?savedPrompts.map(p=>p===editingRow?updated:p):[...savedPrompts,updated]);if(editingRow)window.promptSelection?.update(editingRow,updated);promptStatus.textContent='已保存：'+name;promptDetails.close();}catch(e){status.textContent=e.message;}finally{busy(false);}};
    apply.onclick=()=>{const row={title:title.value.trim()||'未命名提示词',prompt:draft,tags:tags.value.split(/[,，;；\n]/).map(t=>t.trim()).filter(Boolean)};if(window.promptSelection)window.promptSelection.apply(row);else{const field=document.getElementById('prompt');field.value=draft;field.dispatchEvent(new Event('input',{bubbles:true}));}promptDetails.close();promptStatus.textContent='已填入当前提示词';};
    if(editingRow)renderDraft();promptDetails.show();request.focus();
  }
  window.editLibraryPrompt=row=>{const saved=savedPrompts.find(p=>p.title===row.title);if(saved)openPromptComposer(saved);else viewPrompt(row);};
  window.showPromptLibrary=()=>showPrompts(true);
  newPromptButton.onclick=()=>openPromptComposer();
  let promptMenu=null;
  function closePromptMenu(){promptMenu?.remove();promptMenu=null;}
  function openPromptMenu(event,row,card){
    event.preventDefault();closePromptMenu();
    const menu=document.createElement('div');promptMenu=menu;
    menu.className='model-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','提示词操作：'+row.title);
    const source=typeof row.source_url==='string'?row.source_url.trim():'';
    const names=source?['编辑','删除','查看来源']:['编辑','删除'];
    for(const name of names){
      const button=document.createElement('button');button.type='button';button.textContent=name;button.setAttribute('role','menuitem');
      button.onclick=async()=>{closePromptMenu();try{if(name==='编辑')openPromptComposer(row);else if(name==='查看来源'){const url=new URL(source);if(!['http:','https:'].includes(url.protocol))throw Error('来源链接无效');window.open(url.href,'_blank','noopener,noreferrer');}else await persistPrompts(savedPrompts.filter(p=>p!==row));}catch(error){promptStatus.textContent=error.message;}};
      menu.append(button);
    }
    document.body.append(menu);
    menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-menu.offsetWidth-4))+'px';
    menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-menu.offsetHeight-4))+'px';
    menu.firstElementChild.focus();
    menu.onkeydown=e=>{const items=[...menu.children],index=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePromptMenu();card.focus();}else if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();items[(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}else if(e.key==='Tab')closePromptMenu();};
  }
  document.addEventListener('pointerdown',e=>{if(promptMenu&&!promptMenu.contains(e.target))closePromptMenu();});
  window.addEventListener('blur',closePromptMenu);
  window.addEventListener('resize',closePromptMenu);
  document.addEventListener('scroll',closePromptMenu,true);
  window.addEventListener('lumina-shared-data',async e=>{
    const {path,rows}=e.detail;
    if(path==='/api/prompts'&&rows){savedPrompts=rows;closePromptMenu();renderPrompts();}
    if(path.startsWith('/api/models')||path.startsWith('/api/loras')){if(document.body.classList.contains('models-open'))loadModels();window.generationLoRAs?.reload();}
    if(['/api/upload','/api/media/delete','/api/generate'].includes(path)){await refresh();if(assetMode==='input')imported();}
  });
  window.addEventListener('lumina-sidebar-state',e=>{
    const state=e.detail;
    searchPrompts.value=state.promptSearch||'';modelSearch.value=state.modelSearch||'';
    showPrompts(false);showModels(false);
    if(document.body.classList.contains('history-open')!==(state.drawer==='history'))assetsButton.click();
    if(state.drawer==='prompts')showPrompts(true);
    if(state.drawer==='models')showModels(true);
    search.value=state.search;filterAssets();
    document.querySelector('[data-assets="'+state.assetMode+'"]')?.click();
  });
  function renderPrompts(){
    promptList.replaceChildren();const query=searchPrompts.value.trim().toLowerCase();
    for(const row of savedPrompts){
      if(query&&!(row.title+' '+row.prompt+' '+({moody_krea2:'Moody Krea2',qwen:'Qwen'}[row.prompt_series]||'未指定系列')+' '+(row.tags||[]).join(' ')).toLowerCase().includes(query))continue;
      const card=document.createElement('div');card.className='prompt-card';const title=document.createElement('b');title.textContent=row.title;
      const heading=document.createElement('header');heading.className='prompt-card-heading';heading.append(title);
      const preview=document.createElement('button');preview.type='button';preview.className='prompt-card-preview';preview.setAttribute('aria-label','查看提示词：'+row.title);
      preview.textContent=row.prompt.split(/\r?\n/).filter(line=>!/^\s*#{1,6}\s/.test(line)).join(' ').replace(/\*\*|`/g,'').replace(/\s+/g,' ').trim();preview.onclick=()=>viewPrompt(row);
      card.tabIndex=0;card.oncontextmenu=e=>openPromptMenu(e,row,card);card.onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){const rect=card.getBoundingClientRect();openPromptMenu({preventDefault:()=>e.preventDefault(),clientX:rect.left+20,clientY:rect.top+20},row,card);}};
      const actions=document.createElement('div');actions.className='prompt-card-actions';
      for(const name of ['应用']){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=name;b.onclick=async()=>{try{if(name==='应用'){if(window.promptSelection)window.promptSelection.apply(row);else{const field=document.getElementById('prompt');field.value=row.prompt;field.dispatchEvent(new Event('input',{bubbles:true}));}promptStatus.textContent='已选：'+row.title;}else if(name==='编辑')openPromptComposer(row);else await persistPrompts(savedPrompts.filter(p=>p!==row));}catch(e){promptStatus.textContent=e.message;}};actions.append(b);}
      heading.append(actions);card.append(heading,preview);{const tagValues=row.tags||[];const tagLine=document.createElement('div');tagLine.className='prompt-card-tags';tagLine.setAttribute('aria-label','标签');for(const value of tagValues){const tag=document.createElement('span');tag.className='prompt-card-tag';tag.textContent=value;tag.title=value;tagLine.append(tag);}card.append(tagLine);}card.onclick=e=>{if(!e.target.closest('button'))viewPrompt(row);};promptList.append(card);
    }
    if(!promptList.children.length){const empty=document.createElement('p');empty.className='asset-empty';empty.textContent=query?'没有匹配的提示词':'还没有保存提示词';promptList.append(empty);}
  }
  function showPrompts(open){if(open&&(document.body.classList.contains('history-open')||document.body.classList.contains('models-open'))){switchDrawer();showModels(false);if(document.body.classList.contains('history-open'))assetsButton.click();}document.body.classList.toggle('prompts-open',open);promptsPanel.inert=!open;promptsButton.classList.toggle('active',open);promptsButton.setAttribute('aria-expanded',String(open));if(open)api('/api/prompts').then(rows=>{savedPrompts=rows;renderPrompts();}).catch(e=>promptStatus.textContent=e.message);}
  promptsButton.onclick=()=>showPrompts(!document.body.classList.contains('prompts-open'));promptsPanel.querySelector('.models-heading button').onclick=()=>showPrompts(false);searchPrompts.oninput=renderPrompts;
  const propertyButton=document.getElementById('properties-toggle');
  const mobile=matchMedia('(max-width:650px)');
  function property(open){document.body.classList.toggle('settings-collapsed',!open);propertyButton.setAttribute('aria-expanded',String(open));document.querySelector('.settings').inert=!open;}
  property(!mobile.matches);
  propertyButton.onclick=()=>property(document.body.classList.contains('settings-collapsed'));
  mobile.addEventListener('change',()=>property(!mobile.matches));
  const settingsPanel=document.getElementById('system-panel'),settingsButton=document.getElementById('settings-toggle');
  settingsPanel.querySelector('h3').textContent='设置';
  settingsPanel.querySelector('p')?.remove();
  settingsPanel.hidden=false;settingsPanel.inert=true;
  function closeSettings(){settingsPanel.inert=true;document.body.classList.remove('settings-open');settingsButton.classList.remove('active');settingsButton.setAttribute('aria-expanded','false');}
  settingsButton.onclick=()=>{const open=!document.body.classList.contains('settings-open');if(open&&(document.body.classList.contains('models-open')||document.body.classList.contains('prompts-open')||document.body.classList.contains('history-open')))switchDrawer();if(!open){closeSettings();return;}showModels(false);showPrompts(false);if(document.body.classList.contains('history-open'))assetsButton.click();settingsPanel.hidden=false;settingsPanel.inert=false;document.body.classList.add('settings-open');settingsButton.classList.add('active');settingsButton.setAttribute('aria-expanded','true');};
  // Handle the outgoing settings drawer before the destination's click handler.
  document.getElementById('assets-slot').addEventListener('click',e=>{
    if(e.target.closest('button')&&document.body.classList.contains('settings-open')){switchDrawer();closeSettings();}
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSettings();});
  new MutationObserver(()=>assetsButton.classList.toggle('active',document.body.classList.contains('history-open'))).observe(assetsButton,{attributes:true,attributeFilter:['aria-expanded']});
  const queue=document.getElementById('queue-panel'),queueButton=document.getElementById('queue-toggle');
  function renderQueue(){
    const count=document.getElementById('connection').textContent.match(/(\d+) 个任务/);
    document.getElementById('queue-count').textContent=count?count[1]+' 个活动任务':'未连接';
    const list=document.getElementById('queue-list');list.replaceChildren();
    const active=jobs.filter(j=>j.status==='queued'||j.status==='running');
    if(!active.length){const p=document.createElement('p');p.className='help';p.textContent=online?'当前没有活动任务':'ComfyUI 未连接';list.append(p);}
    for(const j of active){const row=document.createElement('div');row.className='queue-row';row.textContent=j.label+' · '+labels[j.status]+(j.progress?' · '+j.progress.value+'/'+j.progress.max:'');list.append(row);}
  }
  queueButton.onclick=()=>{const open=queueButton.getAttribute('aria-expanded')!=='true';floatingPanel(queue,open);queueButton.setAttribute('aria-expanded',String(open));renderQueue();};
  new MutationObserver(renderQueue).observe(document.getElementById('connection'),{childList:true});renderQueue();
  let assetMode='output';const search=document.getElementById('asset-search');
  function filterAssets(){const query=search.value.trim().toLowerCase();document.querySelectorAll('#history .history-card,#imported-assets .imported-card').forEach(card=>card.hidden=!(card.textContent+' '+(card.dataset.search||'')).toLowerCase().includes(query));}
  search.oninput=filterAssets;
  new MutationObserver(filterAssets).observe(document.getElementById('history'),{childList:true});
  function imported(){
    const names=[uploaded,...imageReferences.map(r=>r.image),...jobs.flatMap(j=>[j.image,...(j.references||[]).map(r=>r.image)])].filter(name=>name&&!missingInputs.includes(name));
    const host=document.getElementById('imported-assets');host.replaceChildren();
    const sharedNames=window.parent!==window&&window.parent.luminaWorkspace?window.parent.luminaWorkspace.inputs(names):names;
    for(const name of new Set(sharedNames)){const card=document.createElement('div');card.className='imported-card';const img=new Image();img.src=inputURL(name);img.alt=name.split('/').pop();img.loading='lazy';img.onclick=()=>showLightbox(img.src);const p=document.createElement('p');p.textContent=img.alt;card.title=img.alt;card.onclick=e=>{if(e.target!==img)showLightbox(img.src);};card.append(img,p);host.append(card);}
    if(!sharedNames.length){const p=document.createElement('p');p.className='asset-empty';p.textContent='还没有导入图片';host.append(p);}
  }
  let mediaMenu;
  function closeMediaMenu(){mediaMenu?.remove();mediaMenu=null;}
  document.addEventListener('contextmenu',event=>{
    const card=event.target.closest('#history .history-card,#imported-assets .imported-card'),img=card?.querySelector('img');if(!img)return;
    event.preventDefault();closeMediaMenu();closeModelMenu();const url=new URL(img.src,location.href);if(url.pathname!=='/image')return;
    const asset=Object.fromEntries(['type','filename','subfolder'].map(key=>[key,url.searchParams.get(key)||'']));
    const menu=document.createElement('div');mediaMenu=menu;menu.className='model-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','媒体资产操作');
    for(const [label,action] of [['打开所在文件夹','open-folder'],['删除（移入回收站）','delete']]){
      const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=label;button.onclick=async()=>{closeMediaMenu();try{await api('/api/media/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(asset)});if(action==='delete'){if(asset.type==='input'){const name=asset.subfolder?asset.subfolder+'/'+asset.filename:asset.filename;missingInputs.push(name);if(uploaded===name){uploaded='';document.getElementById('reference').hidden=true;closeEditor();}}card.remove();await refresh();if(assetMode==='input')imported();}}catch(e){document.getElementById('error').textContent=e.message;}};menu.append(button);
    }
    document.body.append(menu);const rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-rect.height-8))+'px';menu.querySelector('button').focus();
    menu.onkeydown=e=>{if(e.key==='Escape'){closeMediaMenu();e.stopPropagation();}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const buttons=[...menu.querySelectorAll('button')];buttons[(buttons.indexOf(document.activeElement)+1)%buttons.length].focus();}};
  });
  document.addEventListener('pointerdown',e=>{if(mediaMenu&&!mediaMenu.contains(e.target))closeMediaMenu();});
  window.addEventListener('resize',closeMediaMenu);
  document.querySelectorAll('[data-assets]').forEach(b=>b.onclick=()=>{assetMode=b.dataset.assets;document.querySelectorAll('[data-assets]').forEach(el=>{el.classList.toggle('active',el===b);el.setAttribute('aria-selected',String(el===b));});document.getElementById('history').hidden=assetMode!=='output';document.getElementById('imported-assets').hidden=assetMode!=='input';if(assetMode==='input')imported();filterAssets();});
  let zoom=1;
  function setZoom(value){zoom=Math.max(.25,Math.min(4,value));if(editing){editor.setZoom(zoom);}else{document.querySelectorAll('#preview>img,#preview .asset-compare img').forEach(image=>image.style.transform=`scale(${zoom})`);}document.getElementById('workspace-zoom').textContent=Math.round(zoom*100)+'%';}
  document.getElementById('workspace-minus').onclick=()=>setZoom(zoom/1.2);
  document.getElementById('workspace-plus').onclick=()=>setZoom(zoom*1.2);
  document.addEventListener('workspace-set-zoom',e=>setZoom(Number(e.detail)));
  document.getElementById('workspace-fit').onclick=()=>{if(editing)editor.fit();setZoom(1);};
  new MutationObserver(()=>setZoom(1)).observe(document.getElementById('preview'),{childList:true});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!queue.hidden)floatingPanel(queue,false);queueButton.setAttribute('aria-expanded','false');closeSettings();}if(e.key==='.'&&!e.target.matches('input,textarea,select'))document.getElementById('workspace-fit').click();});
})();

(() => {
  let popup=null,anchor=null;
  const modelTags=Object.fromEntries((window.modelCatalog?.models||[]).filter(m=>m.selection_key).map(m=>[m.selection_key,m.tags||[]]));
  function addTags(host,tags){host.title=tags.includes('中文理解')?'适合中文描述、多种题材和图片中的文字内容。':tags.includes('RAW质感')?'偏 RAW 摄影观感，强调皮肤纹理、毛孔和自然瑕疵。': '偏人像写真与社交平台风格，强调滤镜、色调、光线和氛围。';host.classList.add('model-option');const pills=document.createElement('span');pills.className='model-tags';for(const tag of tags){const pill=document.createElement('span');pill.textContent=tag;pills.append(pill);}host.append(pills);}
  function close(focus=false){if(!popup)return;const leaving=popup;popup=null;leaving.removeAttribute('id');leaving.inert=true;leaving.setAttribute('aria-hidden','true');if(matchMedia('(prefers-reduced-motion: reduce)').matches){leaving.remove();}else{leaving.classList.add('is-closing');leaving.addEventListener('animationend',()=>leaving.remove(),{once:true});setTimeout(()=>leaving.remove(),130);}if(anchor){anchor.setAttribute('aria-expanded','false');if(focus)anchor.focus();}anchor=null;}
  function open(button,items,{width,above=false,role='menu',footer}={}){
    if(anchor===button){close();return;}close();anchor=button;
    popup=document.createElement('div');popup.className='comfy-popup';popup.setAttribute('role',role);popup.setAttribute('aria-label',button.getAttribute('aria-label')||button.textContent);popup.id='comfy-open-menu';button.setAttribute('aria-controls',popup.id);button.setAttribute('aria-expanded','true');
    for(const item of items){if(item.separator){popup.append(document.createElement('hr'));continue;}const row=document.createElement('button');row.type='button';row.setAttribute('role',role==='listbox'?'option':'menuitem');row.textContent=item.label;if(item.tags)addTags(row,item.tags);row.disabled=!!item.disabled;if(role==='listbox')row.setAttribute('aria-selected',String(!!item.selected));if(item.shortcut){const span=document.createElement('span');span.className='menu-shortcut';span.textContent=item.shortcut;row.append(span);}row.onclick=()=>{close();item.action();button.focus();};popup.append(row);}
    if(footer)footer(popup);
    document.body.append(popup);const rect=button.getBoundingClientRect();popup.style.width=Math.max(150,width||rect.width)+'px';const box=popup.getBoundingClientRect();const goesAbove=above||rect.bottom+box.height>innerHeight;popup.dataset.side=goesAbove?'top':'bottom';popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-box.width-8))+'px';popup.style.top=Math.max(8,goesAbove?rect.top-box.height-5:rect.bottom+5)+'px';
    const rows=[...popup.querySelectorAll('button:not(:disabled)')];const selected=popup.querySelector('[aria-selected=true]');(selected||rows[0])?.focus();
    popup.onkeydown=e=>{const index=rows.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();rows[(index+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length]?.focus();}if(e.key==='Home'){e.preventDefault();rows[0]?.focus();}if(e.key==='End'){e.preventDefault();rows.at(-1)?.focus();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}if(e.key==='Tab')close();};
  }
  document.addEventListener('pointerdown',e=>{if(popup&&!popup.contains(e.target)&&!anchor.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close(true);});
  window.addEventListener('resize',()=>close());document.querySelector('#form').addEventListener('scroll',()=>close());
  const wrappers=[];
  function decorateSelect(select){
    if(select.classList.contains('comfy-native-select'))return;
    const wrap=document.createElement('div');wrap.className='comfy-select';select.after(wrap);select.classList.add('comfy-native-select');select.setAttribute('aria-hidden','true');select.tabIndex=-1;
    const button=document.createElement('button');button.type='button';button.className='comfy-select-trigger';button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');const label=document.querySelector(`label[for="${select.id}"]`)?.textContent||select.parentElement.querySelector('label')?.textContent||select.getAttribute('aria-label')||'参数';button.setAttribute('aria-label',label);wrap.append(button);
    const sync=()=>{if(wrap.hidden!==select.hidden)wrap.hidden=select.hidden;if(button.disabled!==select.disabled)button.disabled=select.disabled;const label=select.selectedOptions[0]?.textContent||'';if(select.id==='generation-model'){if(button.dataset.value!==select.value){button.textContent=label;addTags(button,modelTags[select.value]||[]);button.dataset.value=select.value;}}else if(button.textContent!==label)button.textContent=label;};
    button.onclick=()=>{sync();open(button,[...select.options].map(option=>({label:option.textContent,tags:select.id==='generation-model'?modelTags[option.value]:null,disabled:option.disabled,selected:option.selected,action:()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();}})),{role:'listbox'});};
    button.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();button.click();}};select.addEventListener('change',sync);wrappers.push(sync);sync();
  }
  document.querySelectorAll('#form select').forEach(decorateSelect);
  window.addEventListener('creative-select-added',event=>decorateSelect(event.detail));
  new MutationObserver(()=>wrappers.forEach(sync=>sync())).observe(document.getElementById('form'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','disabled']});
  document.querySelector('.toolbar h3')?.remove();
  const runButton=document.createElement('button');runButton.type='button';runButton.className='run-dropdown';runButton.setAttribute('aria-label','运行选项');runButton.setAttribute('aria-haspopup','menu');runButton.setAttribute('aria-expanded','false');document.getElementById('run-slot').after(runButton);
  runButton.onclick=()=>open(runButton,[{label:'运行当前任务',disabled:document.getElementById('submit').disabled,action:()=>document.getElementById('form').requestSubmit(document.getElementById('submit'))},{label:'打开任务队列',action:()=>{if(document.getElementById('queue-panel').hidden)document.getElementById('queue-toggle').click();}},{separator:true},{label:'显示参数面板',action:()=>{if(document.body.classList.contains('settings-collapsed'))document.getElementById('properties-toggle').click();}}],{width:210});
  const zoomButton=document.createElement('button');zoomButton.type='button';zoomButton.className='zoom-menu-trigger';zoomButton.setAttribute('aria-label','缩放控制');zoomButton.setAttribute('aria-haspopup','menu');zoomButton.setAttribute('aria-expanded','false');const output=document.getElementById('workspace-zoom');output.before(zoomButton);zoomButton.append(output);
  zoomButton.onclick=()=>open(zoomButton,[{label:'放大',shortcut:'Alt + =',action:()=>document.getElementById('workspace-plus').click()},{label:'缩小',shortcut:'Alt + -',action:()=>document.getElementById('workspace-minus').click()},{label:'适合画面',shortcut:'.',action:()=>document.getElementById('workspace-fit').click()}],{width:200,above:true,footer:menu=>{const row=document.createElement('div');row.className='zoom-value';const input=document.createElement('input');input.type='number';input.min='25';input.max='400';input.value=parseInt(output.textContent);input.setAttribute('aria-label','缩放百分比');const suffix=document.createElement('span');suffix.textContent='%';input.onchange=()=>{if(!Number.isFinite(input.valueAsNumber))return;document.dispatchEvent(new CustomEvent('workspace-set-zoom',{detail:input.valueAsNumber/100}));input.value=parseInt(output.textContent);};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.dispatchEvent(new Event('change'));close(true);}};row.append(input,suffix);menu.append(row);}});
  const propertiesClose=document.createElement('button');propertiesClose.type='button';propertiesClose.className='properties-close';propertiesClose.textContent='×';propertiesClose.setAttribute('aria-label','关闭参数面板');propertiesClose.onclick=()=>document.getElementById('properties-toggle').click();document.querySelector('.settings-title').append(propertiesClose);
  document.addEventListener('keydown',e=>{if(!e.altKey||e.target.matches('input,textarea,select'))return;if(e.key==='='||e.key==='+'){e.preventDefault();document.getElementById('workspace-plus').click();}if(e.key==='-'){e.preventDefault();document.getElementById('workspace-minus').click();}});
})();

(() => {
  const area=document.getElementById('preview');
  const exit=document.createElement('button');exit.type='button';exit.className='secondary';exit.textContent='退出对比';exit.hidden=true;document.getElementById('result-actions').prepend(exit);
  const overlay=document.createElement('button');overlay.type='button';overlay.className='secondary';overlay.textContent='叠加查看';overlay.hidden=true;exit.after(overlay);
  const divider=document.createElement('div');divider.className='asset-swipe-divider';divider.setAttribute('role','slider');divider.tabIndex=0;divider.setAttribute('aria-label','左右对比分界线');divider.setAttribute('aria-valuemin','0');divider.setAttribute('aria-valuemax','100');divider.innerHTML='<span>↔</span>';divider.hidden=true;let split=50;
  function updateSplit(value){split=Math.max(0,Math.min(100,value));divider.style.left=split+'%';divider.setAttribute('aria-valuenow',String(Math.round(split)));const top=area.querySelector('.asset-compare-right');if(top)top.style.clipPath=divider.hidden?'':`inset(0 0 0 ${split}%)`;}
  function fitOverlay(){const wrap=area.querySelector('.asset-compare');if(!wrap)return;if(!wrap.classList.contains('asset-overlay')){wrap.style.width='';wrap.style.height='';return;}if(!right?.naturalWidth)return;const factor=Math.min(area.clientWidth/right.naturalWidth,area.clientHeight/right.naturalHeight);wrap.style.width=Math.floor(right.naturalWidth*factor)+'px';wrap.style.height=Math.floor(right.naturalHeight*factor)+'px';updateSplit(split);}
  new ResizeObserver(fitOverlay).observe(area);
  function moveDivider(e){const rect=area.querySelector('.asset-compare').getBoundingClientRect();updateSplit((e.clientX-rect.left)/rect.width*100);}
  divider.onpointerdown=e=>{e.preventDefault();divider.setPointerCapture(e.pointerId);moveDivider(e);};divider.onpointermove=e=>{if(divider.hasPointerCapture(e.pointerId))moveDivider(e);};
  divider.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();updateSplit(e.key==='Home'?0:e.key==='End'?100:split+(e.key==='ArrowLeft'?-2:2));}};
  let asset=null,right=null;
  const mime='application/x-comfy-media-asset';
  function currentImage(){return area.querySelector('.asset-compare-right img')||area.querySelector(':scope > img')||area.querySelector('.comparison img');}
  function stop(){if(right&&area.querySelector('.asset-compare')){right.style.opacity='';area.replaceChildren(right);document.dispatchEvent(new CustomEvent('workspace-set-zoom',{detail:1}));}asset=null;right=null;exit.hidden=true;overlay.hidden=true;divider.hidden=true;document.body.classList.remove('asset-comparing');area.classList.remove('asset-drop-target');}
  exit.onclick=stop;
  overlay.onclick=()=>{const wrap=area.querySelector('.asset-compare');if(!wrap)return;const active=wrap.classList.toggle('asset-overlay');overlay.textContent=active?'并排查看':'叠加查看';overlay.setAttribute('aria-pressed',String(active));divider.hidden=!active;fitOverlay();updateSplit(split);};
  function compare(url){if(mode!=='03_image_edit')return;const current=currentImage();if(!current)return;right=current;right.style.transform='';right.style.opacity='';overlay.textContent='叠加查看';overlay.setAttribute('aria-pressed','false');split=50;divider.hidden=true;const wrap=document.createElement('div');wrap.className='asset-compare';
    for(const [side,label,image] of [['left','媒体资产',new Image()],['right','画布图片',right]]){const pane=document.createElement('div');pane.className='asset-compare-'+side;const caption=document.createElement('span');caption.textContent=label;caption.className='asset-compare-label';if(side==='left'){image.src=url;image.alt='对比媒体资产';image.draggable=false;}pane.append(image,caption);wrap.append(pane);}
    wrap.append(divider);area.replaceChildren(wrap);exit.hidden=false;overlay.hidden=false;document.body.classList.add('asset-comparing');document.dispatchEvent(new CustomEvent('workspace-set-zoom',{detail:1}));
  }
  function prepare(){document.querySelectorAll('#history .history-card,#imported-assets .imported-card').forEach(card=>{card.draggable=!!card.querySelector('img');const im=card.querySelector('img');if(im)im.draggable=true;});}
  for(const id of ['history','imported-assets'])new MutationObserver(prepare).observe(document.getElementById(id),{childList:true});prepare();
  document.addEventListener('dragstart',e=>{const card=e.target.closest('#history .history-card,#imported-assets .imported-card');const image=card?.querySelector('img');if(!image)return;asset=image.src;e.dataTransfer.setData(mime,asset);e.dataTransfer.effectAllowed='copy';});
  area.addEventListener('dragover',e=>{if(mode!=='03_image_edit'||!asset||!currentImage()||editing)return;e.preventDefault();e.dataTransfer.dropEffect='copy';area.classList.add('asset-drop-target');});
  area.addEventListener('dragleave',e=>{if(!area.contains(e.relatedTarget))area.classList.remove('asset-drop-target');});
  area.addEventListener('drop',e=>{if(mode!=='03_image_edit'||!asset||editing)return;e.preventDefault();const url=e.dataTransfer.getData(mime);area.classList.remove('asset-drop-target');if(url)compare(url);asset=null;});
  document.addEventListener('dragend',()=>{asset=null;area.classList.remove('asset-drop-target');});
  document.addEventListener('creative-mode-change',stop);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('lightbox').open&&!exit.hidden)stop();});
  new MutationObserver(()=>{if(!area.querySelector('.asset-compare')){exit.hidden=true;overlay.hidden=true;divider.hidden=true;document.body.classList.remove('asset-comparing');right=null;}}).observe(area,{childList:true});
})();



