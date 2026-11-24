(() => {
  const $=id=>document.getElementById(id), el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  let token='',settings,assistant,models=[],noticeTimer,editingModel,dirty=new Set();
  const titles={models:['生图模型','管理模型、编码器、LoRA 与放大组件。'],workflows:['工作流','管理已接入的创作流程。'],pe:['PE 模型','管理云端连接与本地模型。'],runtime:['文件与存储','为模型、作品与应用数据选择保存位置。']};
  if(window.luminaDesktop?.getClosePreferences){
    titles.desktop=['窗口行为','设置关闭主窗口后的行为。'];
    $('desktop-nav').hidden=false;
    let closeAction='ask';
    const loadClosePreferences=async()=>{try{const value=await window.luminaDesktop.getClosePreferences();closeAction=value.closeAction;$('close-action').value=closeAction;$('close-action').disabled=false;$('close-action-status').textContent='';}catch(e){$('close-action-status').textContent='读取失败：'+e.message;}};
    $('close-action').onchange=async()=>{const input=$('close-action');input.disabled=true;try{const value=await window.luminaDesktop.saveClosePreferences({closeAction:input.value});closeAction=value.closeAction;$('close-action-status').textContent='已保存，立即生效。';}catch(e){input.value=closeAction;$('close-action-status').textContent='保存失败：'+e.message;}finally{input.disabled=false;}};
    loadClosePreferences();
    window.addEventListener('focus',loadClosePreferences);
  }
  const categories={diffusion_models:'生图模型',text_encoders:'文本编码器',vae:'VAE',loras:'LoRA',upscale_models:'放大模型',SEEDVR2:'SeedVR2'};
  const folderNames={models:'生图模型',workflows:'工作流文件',output:'生成作品',input:'输入图片',data:'应用数据与配置',local_pe:'本地 PE 模型'};
  function notify(message,error=false){clearTimeout(noticeTimer);$('notice').textContent=message;$('notice').classList.toggle('error',error);$('notice').hidden=false;noticeTimer=setTimeout(()=>$('notice').hidden=true,error?8500:4000);}
  async function api(url,body){const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-App-Token':token},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok||data.error)throw Error(data.error||'请求失败，请稍后重试');return data;}
  async function run(button,action){button.disabled=true;try{await action();}catch(e){notify(e.message,true);}finally{button.disabled=false;}}
  function switchPage(){const key=location.hash.slice(1) in titles?location.hash.slice(1):'models';for(const node of document.querySelectorAll('.page'))node.hidden=node.id!==key;for(const b of document.querySelectorAll('[data-page]')){b.classList.toggle('active',b.dataset.page===key);b.setAttribute('aria-current',b.dataset.page===key?'page':'false');}[$('page-title').textContent,$('page-description').textContent]=titles[key];}
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>location.hash=b.dataset.page);window.addEventListener('hashchange',switchPage);switchPage();
  if(location.hash==='#pe'){
    const section=new URLSearchParams(location.search).get('modelSection');
    const target=section==='local'?$('local-drop'):section==='cloud'?$('add-pe'):null;
    if(target){target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}
  }
  document.addEventListener('input',e=>{const form=e.target.closest('form');if(form){dirty.add(form.id);form.dataset.dirty='true';}});
  window.addEventListener('beforeunload',e=>{if(dirty.size){e.preventDefault();e.returnValue='';}});
  const clean=form=>{dirty.delete(form.id);delete form.dataset.dirty;};
  function folderButton(key){const b=el('button','打开当前目录 ↗');b.type='button';b.dataset.folder=key;return b;}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-folder]');if(b)run(b,async()=>{await api('/api/settings/open-folder',{location:b.dataset.folder});notify('已打开文件夹');});});
  function size(bytes){return bytes>=1073741824?(bytes/1073741824).toFixed(2)+' GB':(bytes/1048576).toFixed(0)+' MB';}
  function renderModels(){
    const query=$('model-search').value.trim().toLowerCase(),category=$('model-category').value,state=$('model-state').value;
    const rows=models.filter(m=>(!category||category===m.category)&&(!query||(m.name+' '+(m.label||'')).toLowerCase().includes(query))&&(!state||(state==='installed')===!!m.installed));
    $('model-count').textContent=`${rows.length} 个模型与组件 · 本机已安装 ${models.filter(m=>m.installed).length} 个`;
    $('model-list').replaceChildren();
    for(const m of rows){const row=el('div',undefined,'model-row'),identity=el('div');identity.append(el('strong',m.label||m.name),el('small',(m.label?m.name+' · ':'')+(categories[m.category]||m.category)));row.append(identity,el('span',size(m.bytes),'model-size muted'),el('span',m.installed?'已安装':'未安装','badge'+(m.installed?'':' off')));const actions=el('div',undefined,'row-actions');
      if(m.installed){const open=el('button','定位');open.onclick=()=>run(open,()=>api('/api/models/open-folder',{category:m.category,name:m.name}));actions.append(open);}
      else if(m.download?.status==='downloading'){actions.append(el('span','下载 '+Math.floor(m.download.received/m.download.total*100)+'%','muted'));}
      else if(m.download_url){const download=el('button',m.download?.status==='error'?'重试下载':'下载');download.onclick=()=>run(download,async()=>{await api('/api/models/download',{id:m.id});await loadModels();notify('已开始下载 '+m.name);});actions.append(download);}
      if(m.download?.status==='error')identity.append(el('small',m.download.error));
      const source=m.source||m.source_url; if(source&&/^https?:\/\//i.test(source)){const a=el('a','来源 ↗');a.href=source;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);}
      const edit=el('button','备注');edit.onclick=()=>{editingModel=m;$('metadata-name').textContent=m.name;$('metadata-form').elements.label.value=m.label||'';$('metadata-form').elements.source.value=m.source||m.source_url||'';$('metadata-dialog').showModal();};actions.append(edit);row.append(actions);$('model-list').append(row);
    }
    if(!rows.length)$('model-list').append(el('p','没有符合条件的模型。','note'));
  }
  async function loadModels(){const data=await api('/api/models');models=data.groups.flatMap(g=>g.files.map(f=>({...f,category:g.name})));const selected=$('model-category').value;$('model-category').replaceChildren(new Option('全部分类',''),...data.groups.map(g=>new Option(categories[g.name]||g.name,g.name)));$('model-category').value=selected;renderModels();}
  for(const id of ['model-search','model-category','model-state'])$(id).addEventListener('input',renderModels);
  $('cancel-metadata').onclick=()=>{$('metadata-dialog').close();clean($('metadata-form'));};$('metadata-dialog').addEventListener('cancel',()=>clean($('metadata-form')));
  $('metadata-form').onsubmit=e=>{e.preventDefault();run(e.submitter||e.currentTarget.querySelector('[type=submit]'),async()=>{const form=e.currentTarget;await api('/api/models/edit',{id:editingModel.id,label:form.elements.label.value,source:form.elements.source.value});clean(form);$('metadata-dialog').close();await loadModels();notify('模型备注已保存');});};
  function renderWorkflows(){
    const schema=settings.schema;
    for(const [key,p] of Object.entries(schema.profiles)){const id='workflow-'+key;if(dirty.has(id))continue;const form=el('form',undefined,'workflow-row');form.id=id;const heading=el('div',undefined,'section-heading');heading.append(el('h2',p.label),el('span','已接入','badge'));form.append(heading);const body=el('div',undefined,'workflow-body');body.hidden=true;form.append(body);if(p.fields.length){const toggle=el('button','调整参数');toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',id+'-body');body.id=id+'-body';toggle.onclick=()=>{body.hidden=!body.hidden;toggle.textContent=body.hidden?'调整参数':'收起';toggle.setAttribute('aria-expanded',String(!body.hidden));};heading.append(toggle);}const fields=el('div',undefined,'fields');
      for(const name of p.fields){const f=schema.fields[name],wrap=el('div'),label=el('label',f.label),input=el(f.choices?'select':'input');input.name=name;input.id=id+'-'+name;label.htmlFor=input.id;const value=p.defaults?.[name]??f.default;if(f.choices){for(const v of f.choices)input.append(new Option(String(v),v));input.value=value;}else if(f.type==='boolean'){input.type='checkbox';input.checked=value;label.className='check';}else{input.type='number';input.min=f.min;input.max=f.max;input.step=f.step;input.value=value;input.required=true;}label.append(input);wrap.append(label,el('p',f.help));fields.append(wrap);}
      body.append(fields);
      if(!p.fields.length)heading.append(el('span','参数在工作台调整','muted'));
      else{const actions=el('div',undefined,'form-actions'),reset=el('button','填入推荐值'),save=el('button','保存默认参数','primary');reset.type='button';save.type='submit';reset.onclick=()=>{for(const name of p.fields){const input=form.elements[name];if(input.type==='checkbox')input.checked=schema.fields[name].default;else input.value=schema.fields[name].default;}dirty.add(id);notify('已填入推荐值，保存后生效');};actions.append(reset,save);body.append(el('p','保存后用于新打开的工作台；当前工作台可通过「恢复当前工作流默认设置」应用。','muted'),actions);form.onsubmit=e=>{e.preventDefault();run(save,async()=>{const values=Object.fromEntries(p.fields.map(name=>[name,form.elements[name].type==='checkbox'?form.elements[name].checked:Number(form.elements[name].value)]));settings=await api('/api/settings',{workflow:key,values});clean(form);notify('工作流默认参数已保存');});};}
      const existing=$(id);if(existing)existing.replaceWith(form);else $('workflow-list').append(form);
    }
  }
  function renderSettings(){renderWorkflows();renderLocations();}
  function renderLocations(){
    if(dirty.has('storage-form'))return;
    const saved=settings.configured_locations||settings.locations;
    const pending=Object.keys(saved).some(key=>saved[key]!==settings.locations[key]);
    $('storage-pending').hidden=!pending;$('storage-pending').textContent='有路径等待重启生效，当前读写仍使用原目录。';
    $('locations').replaceChildren(...Object.entries(saved).map(([key,path])=>{const row=el('div',undefined,'location-row'),info=el('div'),label=el('label',folderNames[key]||key),input=el('input');input.name=key;input.value=path;input.required=true;input.spellcheck=false;label.append(input);info.append(label);if(path!==settings.locations[key])info.append(el('p','当前使用：'+settings.locations[key]));const actions=el('div',undefined,'row-actions');actions.append(folderButton(key));const reset=el('button','默认');reset.type='button';reset.onclick=()=>{input.value=settings.default_locations?.[key]||settings.locations[key];dirty.add('storage-form');};actions.append(reset);row.append(info,actions);return row;}));
  }
  $('storage-form').onsubmit=e=>{e.preventDefault();run(e.submitter||e.currentTarget.querySelector('[type=submit]'),async()=>{const values=Object.fromEntries(new FormData($('storage-form')));const result=await api('/api/settings/paths',values);settings.configured_locations=result.configured_locations;clean($('storage-form'));renderLocations();notify(result.restart_required?'路径已保存，重启应用后端与生图引擎后生效':'路径已保存');});};

  async function refresh(){const outcomes=await Promise.allSettled([loadModels(),api('/api/settings').then(v=>{settings=v;renderSettings();}),loadPE()]);const failures=outcomes.filter(v=>v.status==='rejected');$('load-error').hidden=!failures.length;$('load-error').textContent=failures.length?'部分设置读取失败：'+failures.map(v=>v.reason.message).join('；'):' ';}
  let peState={models:[],presets:[]},peEditing=null,importTarget='',importing=false,peBusy=false;
  const peForm=$('pe-form'),peField=name=>peForm.elements[name];
  async function loadPE(){peState=await api('/api/pe-models');renderPE();}
  function renderPE(){
    for(const kind of ['cloud','local']){
      const host=$(kind==='cloud'?'cloud-models':'local-models');host.replaceChildren();
      const rows=peState.models.filter(m=>m.kind===kind);
      if(!rows.length)host.append(el('p',kind==='cloud'?'还没有云端模型':'还没有本地模型','muted'));
      for(const m of rows){
        const row=el('div',undefined,'pe-model-row'),info=el('div',undefined,'pe-model-info'),heading=el('div',undefined,'pe-model-heading');heading.append(el('strong',m.name||m.model));
        if(m.id===peState.default_id)heading.append(el('span','默认','badge'));
        info.append(heading,el('small',(m.kind==='cloud'?(peState.presets.find(p=>p.id===m.vendor)?.label||'自定义服务'):(m.architecture||'GGUF'))+' · '+(m.vision?'支持图片':'文本模型')+(m.available?'':' · 配置不完整')));
        if(m.name!==m.model)info.append(el('small',m.model));
        row.append(info);const actions=el('div',undefined,'row-actions');
        if(m.id!==peState.default_id&&m.available){const b=el('button','设为默认');b.onclick=()=>run(b,async()=>{peState=await api('/api/pe-models',{action:'default',id:m.id});renderPE();});actions.append(b);}
        if(kind==='cloud'){const edit=el('button','编辑');edit.onclick=()=>openPE(m);actions.append(edit);}
        else{const test=el('button','测试');test.onclick=()=>run(test,async()=>{notify('正在加载本地模型，请稍候…');await api('/api/pe-models/test',{id:m.id});notify('本地模型测试通过');});const pair=el('button',m.vision?'更换视觉文件':'添加视觉文件');pair.onclick=()=>{importTarget=m.id;$('local-upload').click();};actions.append(pair,test);}
        const remove=el('button','移除');remove.onclick=()=>{if(!confirm('移除此模型配置？'+(kind==='local'?'模型文件会保留。':'')))return;run(remove,async()=>{peState=await api('/api/pe-models',{action:'remove',id:m.id});renderPE();notify('模型配置已移除');});};actions.append(remove);row.append(actions);host.append(row);
      }
    }
  }
  function preset(){return peState.presets.find(p=>p.id===peField('vendor').value);}
  function setModelOptions(models,selected){
    const select=$('pe-model-select');select.replaceChildren();
    for(const m of models){const id=typeof m==='string'?m:m.id;select.append(new Option(id,id));}
    select.append(new Option('自定义模型名称…','__custom__'));
    select.value=[...select.options].some(o=>o.value===selected)?selected:(selected?'__custom__':select.options[0].value);
    peField('model').value=selected||select.value;$('pe-custom-model').hidden=select.value!=='__custom__';
    if(select.value==='__custom__'&&!selected)peField('model').value='';
    modelChanged();
  }
  function modelChanged(){const custom=$('pe-model-select').value==='__custom__';$('pe-custom-model').hidden=!custom;if(!custom)peField('model').value=$('pe-model-select').value;const known=preset()?.models.find(m=>m.id===peField('model').value);peField('vision').checked=known?.vision===true;}
  function vendorChanged(){
    const p=preset();if(!p)return;
    peField('base_url').value=p.base_url;peField('protocol').value=p.protocol;peField('api_key').value='';peField('api_key').placeholder='粘贴此服务的 API Key';peField('name').value='';peField('vision').checked=false;
    $('pe-region').replaceChildren(...(p.endpoints||[]).map(e=>new Option(e.label,e.url)));$('pe-region-label').hidden=!p.endpoints?.length;
    $('pe-docs').hidden=!p.docs;$('pe-docs').href=p.docs||'#';$('pe-advanced').open=p.id==='custom';
    setModelOptions(p.models);$('pe-form-status').textContent='';
  }
  function openPE(model){
    peEditing=model||null;peForm.reset();$('pe-vendor').replaceChildren(...peState.presets.map(p=>new Option(p.label,p.id)));
    peField('vendor').value=model?.vendor||'deepseek';vendorChanged();
    $('pe-dialog-title').textContent=model?'编辑云端模型':'添加云端模型';
    if(model){for(const key of ['base_url','protocol','name'])peField(key).value=model[key]||'';setModelOptions(preset().models,model.model);peField('vision').checked=model.vision;peField('api_key').placeholder=model.has_api_key?'已保存，留空保持原密钥':'粘贴你的 API Key';if(preset().endpoints?.some(e=>e.url===model.base_url))$('pe-region').value=model.base_url;}
    peField('make_default').checked=!model&&!peState.models.some(m=>m.kind==='cloud'&&m.available);
    $('pe-form-status').textContent='';clean(peForm);$('pe-dialog').showModal();
  }
  function peValues(){return {id:peEditing?.id,vendor:peField('vendor').value,model:peField('model').value.trim(),name:peField('name').value.trim(),base_url:peField('base_url').value.trim(),protocol:peField('protocol').value,api_key:peField('api_key').value.trim(),vision:peField('vision').checked,make_default:peField('make_default').checked};}
  async function peAction(button,action){if(peBusy)return;peBusy=true;peForm.querySelectorAll('button').forEach(b=>b.disabled=true);try{await action();}catch(e){$('pe-form-status').textContent=e.message;}finally{peBusy=false;peForm.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  $('add-pe').onclick=()=>openPE();
  $('close-pe').onclick=()=>{$('pe-dialog').close();};
  $('pe-dialog').addEventListener('close',()=>{peField('api_key').value='';clean(peForm);});
  $('pe-dialog').addEventListener('cancel',e=>{if(peBusy)e.preventDefault();});
  $('pe-vendor').onchange=vendorChanged;
  $('pe-model-select').onchange=()=>{if($('pe-model-select').value==='__custom__')peField('model').value='';modelChanged();};
  $('pe-region').onchange=()=>{peField('base_url').value=$('pe-region').value;peField('api_key').value='';peField('api_key').placeholder='请填写此区域的 API Key';};
  $('test-pe').onclick=()=>peAction($('test-pe'),async()=>{$('pe-form-status').textContent='正在测试连接…';const result=await api('/api/pe-models/test',peValues());$('pe-form-status').textContent=result.message;});
  $('discover-pe').onclick=()=>peAction($('discover-pe'),async()=>{$('pe-form-status').textContent='正在获取模型…';const current=peField('model').value,result=await api('/api/pe-models/discover',peValues());if(!result.models.length)throw Error('服务未返回模型列表，可继续使用内置预设。');setModelOptions(result.models,current);$('pe-form-status').textContent='已获取 '+result.models.length+' 个模型。自定义模型的图片能力可在高级设置中指定。';});
  peForm.onsubmit=e=>{e.preventDefault();peAction(e.submitter,async()=>{peState=await api('/api/pe-models',peValues());clean(peForm);renderPE();$('pe-dialog').close();notify('模型已保存，可在对话中选择');});};
  function importFiles(files){
    if(importing)return;const target=importTarget;importTarget='';files=[...files];if(!files.length)return;
    if(files.length>2||files.some(f=>!f.name.toLowerCase().endsWith('.gguf'))){notify('请选择一个 GGUF 主模型，可同时选择一个 mmproj 文件',true);return;}
    importing=true;$('local-drop').disabled=true;$('import-status').hidden=false;$('import-progress').hidden=false;$('import-progress').value=0;$('import-status').textContent='正在导入模型…';
    const form=new FormData();files.forEach(f=>form.append('files',f));const xhr=new XMLHttpRequest();xhr.open('POST','/api/pe-models/import'+(target?'?target='+encodeURIComponent(target):''));xhr.setRequestHeader('X-App-Token',token);xhr.timeout=0;
    xhr.upload.onprogress=e=>{if(e.lengthComputable){const progress=Math.round(e.loaded/e.total*100);$('import-progress').value=progress;$('import-status').textContent=progress===100?'正在识别并配置模型…':'正在导入模型 '+progress+'%';}};
    xhr.onload=()=>{try{const data=JSON.parse(xhr.responseText);if(xhr.status>=400||data.error)throw Error(data.error||'导入失败');peState=data;renderPE();$('import-status').textContent='导入完成，已自动配置。可在对话中选择，或先点击「测试」。';}catch(e){$('import-status').textContent=e.message;}};
    xhr.onerror=()=>{$('import-status').textContent='连接中断，导入未完成，请重试。';};xhr.onloadend=()=>{importing=false;$('local-drop').disabled=false;$('import-progress').hidden=true;$('local-upload').value='';};xhr.send(form);
  }
  $('local-drop').onclick=()=>{importTarget='';$('local-upload').click();};$('local-upload').onchange=e=>importFiles(e.target.files);
  for(const event of ['dragover','dragenter'])$('local-drop').addEventListener(event,e=>{e.preventDefault();$('local-drop').classList.add('dragging');});
  $('local-drop').addEventListener('dragleave',()=>$('local-drop').classList.remove('dragging'));
  $('local-drop').addEventListener('drop',e=>{e.preventDefault();$('local-drop').classList.remove('dragging');importTarget='';importFiles(e.dataTransfer.files);});

  $('refresh').onclick=()=>run($('refresh'),refresh);
  // Only download progress needs polling. Leave unsaved forms intact.
  setInterval(()=>{if(!document.hidden&&models.some(m=>m.download?.status==='downloading'))loadModels().catch(e=>notify(e.message,true));},3000);
  api('/api/config').then(data=>{token=data.token;return refresh();}).catch(e=>{$('load-error').hidden=false;$('load-error').textContent='无法连接设置服务：'+e.message;});
})();
