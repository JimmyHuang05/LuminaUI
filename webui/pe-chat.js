(() => {
  const standalone = document.body.classList.contains('pe-chat-page');
  const sidebar = document.querySelector('.sidebar');
  if (!standalone && (!sidebar || document.getElementById('pe-chat-toggle'))) return;
  const toggle = document.createElement('button');
  toggle.id = 'pe-chat-toggle'; toggle.type = 'button'; toggle.className = 'rail-button';
  toggle.dataset.tooltip = '自由对话'; toggle.setAttribute('aria-label', '自由对话');
  toggle.setAttribute('aria-controls', 'pe-chat-panel'); toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/></svg>';
  if (!standalone) {
    sidebar.querySelector('.rail-bottom').before(toggle);
    toggle.removeAttribute('aria-controls'); toggle.removeAttribute('aria-expanded');
    toggle.onclick = () => window.open('/pe-chat', '_blank');
    return;
  }
  const layout = document.createElement('div'); layout.className = 'pe-layout';
  layout.innerHTML = `<aside class="pe-sidebar" aria-label="对话导航">
    <div class="pe-sidebar-head"><a class="pe-brand" href="/">自由对话</a><button type="button" class="pe-icon" data-search aria-label="搜索对话标题" title="搜索对话标题"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg></button><button type="button" class="pe-icon" data-collapse aria-label="收起侧栏" title="收起侧栏"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg></button></div>
    <button type="button" class="pe-compose" data-compose><svg viewBox="0 0 24 24"><path d="M13 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8M16 3l5 5-9 9-6 1 1-6Z"/></svg>新建对话</button>
    <input class="pe-history-search" type="search" placeholder="搜索对话标题" aria-label="搜索对话标题" hidden>
    <p class="pe-sidebar-label">对话记录</p><nav class="pe-history" aria-label="会话列表"></nav>
    <div class="pe-sidebar-foot"><span class="pe-avatar">L</span><div>LuminaUI<small>本机创作空间</small></div><a href="/" aria-label="返回首页" title="返回首页">↗</a></div>
  </aside>`;
  const panel = document.createElement('main'); panel.id = 'pe-chat-panel'; panel.className = 'is-empty';
  panel.setAttribute('aria-label', '自由对话 对话');
  panel.innerHTML = `<header class="pe-topbar"><button type="button" class="pe-icon pe-expand" aria-label="展开侧栏" title="展开侧栏"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg></button><div class="pe-modes" role="group" aria-label="对话视图"><button type="button" data-view="chat" aria-pressed="true">对话</button><button type="button" data-view="drafts" aria-pressed="false">草稿</button></div><button type="button" class="pe-icon" data-refresh aria-label="刷新记录" title="刷新记录"><svg viewBox="0 0 24 24"><path d="M20 7a8 8 0 1 0 1 7M20 3v5h-5"/></svg></button></header>
    <div class="pe-chat-messages" role="log" aria-label="聊天记录" aria-live="polite"></div>
    <section class="pe-composer-area"><h1 class="pe-welcome">今天想创作什么？</h1>
    <div class="pe-selected-references" aria-label="本次参考提示词" hidden></div><div class="pe-attachments" hidden></div><div class="pe-mode-chip" hidden></div><input class="pe-image-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><form class="pe-chat-form"><div class="pe-add-wrap"><button type="button" class="pe-add" title="添加" aria-label="添加" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button><div class="pe-add-menu" hidden><p>添加</p><button type="button" data-add="image"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg><span>添加图片</span></button><button type="button" data-add="reverse"><svg viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/><circle cx="11" cy="11" r="4"/><path d="m14 14 4 4"/></svg><span>图片反推</span></button><button type="button" data-add="reference"><svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5ZM9 8h6M9 12h6M9 16h4"/></svg><span>引用提示词</span></button></div></div><textarea aria-label="发给 自由对话 的消息" maxlength="20000" placeholder="询问 自由对话" rows="1"></textarea><details class="pe-model-picker"><summary aria-label="选择对话模型"><span class="pe-model">选择模型</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><div class="pe-model-options" role="group" aria-label="可用对话模型"></div></details><button type="submit" aria-label="发送消息" title="发送消息">↑</button></form>
    <div class="pe-suggestions"><button type="button" data-suggestion="帮我构思一个有电影感的画面，先和我讨论场景、光线和构图。"><span>✧</span>一起构思一个画面</button><button type="button" data-suggestion="我想参考提示词库里的提示词写一份新草稿，请先询问我要参考哪一个。"><span>▤</span>参考已有提示词，写一份新草稿</button></div>
    <div class="pe-chat-status" role="status"></div><p class="pe-composer-note">Enter 发送 · Shift + Enter 换行 · 记录保存在本机</p></section>`;
  layout.append(panel); document.body.append(layout);
  if(window.luminaDesktop?.shell){const brand=layout.querySelector('.pe-brand');brand.textContent='对话记录';brand.removeAttribute('href');}
  if (location.protocol === 'file:') for (const link of layout.querySelectorAll('a')) link.href = link.getAttribute('href') === '/resources' ? 'resources.html' : 'home.html';
  const list = panel.querySelector('.pe-chat-messages'), status = panel.querySelector('[role=status]');
  const input = panel.querySelector('textarea'), send = panel.querySelector('[type=submit]');
  const refresh = panel.querySelector('[data-refresh]');
  let state = {revision: 0, messages: []}, busy = false, loaded = false, rendered = '';
  let sessions=[],currentId='',selectionVersion=0,listSerial='',creating=false;
  const draftSessions=new Set();let blankId='';
  let attachment=null,imageMode=false,uploading=false;
  const sending=new Set();let selectedReferences=[],stopping=false,branching=false,refreshing=false,lastPoll=0;
  const refsHost=panel.querySelector('.pe-selected-references');
  const readLocal=(key,fallback='')=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
  const writeLocal=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  let selectedProvider=readLocal('lumina.pe-chat.provider',''), providers=[];
  const modelPicker=panel.querySelector('.pe-model-picker');
  const draftKey=id=>'lumina.pe-chat.draft.'+id;
  function persistInput(){if(currentId)writeLocal(draftKey(currentId),input.value);}
  function persistPosition(){if(currentId&&loaded)writeLocal('lumina.pe-chat.scroll.'+currentId,String(list.scrollTop));}
  input.addEventListener('input',()=>{persistInput();controls();});
  list.addEventListener('scroll',persistPosition,{passive:true});
  window.addEventListener('pagehide',()=>{persistInput();persistPosition();});
  async function apiCall(method='GET',data,query='') {
    const headers={};
    if(method==='POST'){
      const c=await fetch('/api/config',{cache:'no-store'});
      if(!c.ok)throw Error('无法连接本地服务');
      headers['X-App-Token']=(await c.json()).token;headers['Content-Type']='application/json';
    }
    const response=await fetch('/api/pe-chat'+query,{method,headers,cache:'no-store',...(data?{body:JSON.stringify(data)}:{})});
    let result;try{result=await response.json();}catch{throw Error(response.status===404?'对话已删除或不存在':'服务返回异常，请重试');}
    if(!response.ok)throw Error(result.error||'自由对话 请求失败');
    return result;
  }
  function controls() {
    busy=sending.has(currentId);input.disabled=!loaded;
    const pending = state.messages.some(m => m.status === 'pending');
    send.disabled = stopping || !loaded || (busy&&!pending) || (!pending&&!busy&&!input.value.trim()&&!attachment)||uploading;
    send.innerHTML = stopping||busy&&!pending?'···':pending?'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>';
    for(const b of modelPicker.querySelectorAll('button'))b.disabled=busy||pending||b.dataset.available!=='true';
    send.setAttribute('aria-label',pending?'停止回复':'发送消息');send.title=pending?'停止回复':'发送消息';
    input.style.height = 'auto';input.style.height = Math.min(144,Math.max(26,input.scrollHeight))+'px';
    refresh.disabled = busy;
  }
  function button(label, action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.onclick = action; return b;
  }
  const history = layout.querySelector('.pe-history'), search = layout.querySelector('.pe-history-search');
  function setView(view) {
    panel.classList.toggle('drafts-mode', view === 'drafts');
    for (const tab of panel.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed', String(tab.dataset.view === view));
  }
  function renderHistory() {
    const query=search.value.trim().toLowerCase();
    const serial=JSON.stringify([sessions,currentId,query,[...sending]]);if(serial===listSerial)return;listSerial=serial;
    history.replaceChildren();
    const matches=sessions.filter(row=>row.title.toLowerCase().includes(query));
    if(!matches.length){const empty=document.createElement('p');empty.className='pe-history-empty';empty.textContent=query?'没有匹配的对话':'新建对话，开始一个创作主题';history.append(empty);}
    for(const row of matches){
      const host=document.createElement('div');host.className='pe-session';host.dataset.sessionId=row.id;host.classList.toggle('active',row.id===currentId);
      const item=button(row.title,()=>selectSession(row.id));item.className='pe-session-title';item.title=row.title;item.setAttribute('aria-current',String(row.id===currentId));
      const marker=document.createElement('small');marker.textContent=row.pending||sending.has(row.id)?'回复中':row.pinned?'置顶':'';item.append(marker);
      const menu=document.createElement('details');menu.className='pe-session-menu';const summary=document.createElement('summary');summary.textContent='···';summary.setAttribute('aria-label','管理对话：'+row.title);menu.append(summary);
      const actions=document.createElement('div');actions.append(button('重命名',()=>manageSession(row,'rename')),button(row.pinned?'取消置顶':'置顶',()=>manageSession(row,'pin')),button('删除',()=>manageSession(row,'delete')));menu.append(actions);
      menu.addEventListener('toggle',()=>{if(menu.open)for(const other of history.querySelectorAll('details'))if(other!==menu)other.open=false;});
      host.append(item,menu);history.append(host);
    }
  }
  document.addEventListener('pointerdown',event=>{for(const menu of history.querySelectorAll('details[open]'))if(!menu.contains(event.target))menu.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const menu of history.querySelectorAll('details[open]')){menu.open=false;menu.querySelector('summary').focus();}});
  function askSession(row,rename){
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='pe-session-dialog';dialog.setAttribute('aria-labelledby','session-dialog-title');
      const form=document.createElement('form');form.method='dialog';
      const title=document.createElement('h2');title.id='session-dialog-title';title.textContent=rename?'重命名对话':'删除对话？';
      const note=document.createElement('p');note.textContent=rename?'为这段创作取一个容易找到的名字。':'将删除“'+row.title+'”及其聊天记录。已保存到提示词库的提示词不受影响。';
      const field=document.createElement('input');field.value=row.title;field.maxLength=100;field.required=true;field.setAttribute('aria-label','对话名称');
      const actions=document.createElement('div');actions.className='pe-dialog-actions';const cancel=button('取消',()=>dialog.close());const confirm=document.createElement('button');confirm.type='submit';confirm.textContent=rename?'保存':'删除对话';confirm.className=rename?'primary':'danger';actions.append(cancel,confirm);
      form.append(title,note);if(rename)form.append(field);form.append(actions);dialog.append(form);document.body.append(dialog);
      let value=null;form.onsubmit=e=>{e.preventDefault();if(rename&&!field.value.trim()){field.focus();return;}value=rename?field.value.trim():true;dialog.close();};
      dialog.addEventListener('close',()=>{dialog.remove();resolve(value);},{once:true});dialog.showModal();if(rename){field.focus();field.select();}else cancel.focus();
    });
  }
  async function manageSession(row,action){
    for(const menu of history.querySelectorAll('details'))menu.open=false;
    let title;if(action==='rename'){title=await askSession(row,true);if(!title)return;}
    if(action==='delete'&&!await askSession(row,false))return;
    try{
      const data=await apiCall('POST',{action,session_id:row.id,...(title?{title}:{}),...(action==='pin'?{pinned:!row.pinned}:{})});sessions=data.sessions;
      if(action==='delete'){
        try{localStorage.removeItem(draftKey(row.id));localStorage.removeItem('lumina.pe-chat.scroll.'+row.id);}catch{}
        if(currentId===row.id){loaded=false;currentId='';if(sessions.length)await selectSession(sessions[0].id);else await createSession();}
      }
      renderHistory();
    }catch(e){status.textContent=e.message;}
  }
  async function loadSessions(){const data=await apiCall('GET',undefined,'?list=1');if(!Array.isArray(data.sessions))throw Error('多会话功能需要重启本地 WebUI 后台服务，仅刷新页面不会更新后台。');sessions=data.sessions.filter(row=>row.message_count>0||row.pending);renderHistory();return sessions;}
  async function selectSession(id){
    if(currentId===id&&loaded)return;
    persistInput();persistPosition();currentId=id;const version=++selectionVersion;loaded=false;rendered='';state={revision:0,messages:[]};status.textContent='正在读取对话…';input.value=readLocal(draftKey(id));list.replaceChildren();panel.classList.add('is-empty');setView('chat');controls();renderHistory();writeLocal('lumina.pe-chat.active',id);
    try{selectedReferences=JSON.parse(readLocal('lumina.pe-chat.references.'+id,'[]'));}catch{selectedReferences=[];}renderSelectedReferences();
    try{attachment=JSON.parse(readLocal('lumina.pe-chat.attachment.'+id,'null'));}catch{attachment=null;}imageMode=readLocal('lumina.pe-chat.mode.'+id)==='image';renderAttachment();
    const position=readLocal('lumina.pe-chat.scroll.'+id);
    try{
      const data=draftSessions.has(id)&&!sending.has(id)&&!sessions.some(s=>s.id===id)?{id,revision:0,messages:[]}:await apiCall('GET',undefined,'?session_id='+encodeURIComponent(id));if(version!==selectionVersion)return;
      state=data;loaded=true;render();status.textContent='';
      requestAnimationFrame(()=>{if(version===selectionVersion)list.scrollTop=position===''?list.scrollHeight:Number(position)||0;});
    }catch(e){if(version===selectionVersion){status.textContent=e.message;controls();}}
  }
  async function createSession(){
    if(creating)return;creating=true;const trigger=layout.querySelector('[data-compose]');trigger.disabled=true;
    try{if(!blankId||!draftSessions.has(blankId)||sending.has(blankId)){blankId=crypto.randomUUID();draftSessions.add(blankId);writeLocal('lumina.pe-chat.blank',blankId);}await selectSession(blankId);input.focus();}catch(e){status.textContent=e.message;}finally{creating=false;trigger.disabled=false;}
  }
  for(const tab of panel.querySelectorAll('[data-view]'))tab.onclick=()=>setView(tab.dataset.view);
  layout.querySelector('[data-collapse]').onclick=()=>{layout.classList.add('sidebar-collapsed');panel.querySelector('.pe-expand').focus();};
  panel.querySelector('.pe-expand').onclick=()=>{layout.classList.remove('sidebar-collapsed');layout.querySelector('[data-collapse]').focus();};
  layout.querySelector('[data-search]').onclick=()=>{search.hidden=!search.hidden;if(!search.hidden)search.focus();else{search.value='';renderHistory();}};
  search.oninput=renderHistory;
  layout.querySelector('[data-compose]').onclick=createSession;
  for(const suggestion of panel.querySelectorAll('[data-suggestion]'))suggestion.onclick=()=>{setView('chat');input.value=suggestion.dataset.suggestion;persistInput();controls();input.focus();};
  function resourceLink(label,id,page='resources'){
    const link=document.createElement('a');link.textContent=label;link.href=(location.protocol==='file:'?(page==='workbench'?'index.html':'resources.html'):'/'+page)+'?prompt_id='+encodeURIComponent(id);link.target='_blank';link.rel='noopener';return link;
  }
  async function copyText(text,success){try{await navigator.clipboard.writeText(text);status.textContent=success;}catch{status.textContent='复制失败，请手动选择正文复制';}}
  function renderSelectedReferences(){
    refsHost.replaceChildren();refsHost.hidden=!selectedReferences.length;
    for(const row of selectedReferences){const chip=button(row.title+' ×',()=>{selectedReferences=selectedReferences.filter(r=>r.id!==row.id);writeLocal('lumina.pe-chat.references.'+currentId,JSON.stringify(selectedReferences));renderSelectedReferences();});chip.setAttribute('aria-label','移除参考：'+row.title);refsHost.append(chip);}
  }
  async function chooseReferences(){
    if(!loaded)return;const sid=currentId;
    try{
      const response=await fetch('/api/prompts',{cache:'no-store'});if(!response.ok)throw Error('无法读取提示词库');const rows=await response.json();if(currentId!==sid)return;
      const chosen=new Map(selectedReferences.map(r=>[r.id,r]));const dialog=document.createElement('dialog');dialog.className='pe-session-dialog pe-reference-picker';
      const title=document.createElement('h2');title.textContent='参考提示词';const note=document.createElement('p');note.textContent='最多选择 4 个。未选择时，助手会按对话自动查找参考。';
      const searchBox=document.createElement('input');searchBox.type='search';searchBox.placeholder='搜索标题、标签或摘要';searchBox.setAttribute('aria-label','搜索参考提示词');const choices=document.createElement('div');choices.className='pe-reference-choices';
      const renderChoices=()=>{choices.replaceChildren();const matches=rows.filter(r=>[r.title,r.card_summary,...(r.tags||[])].join(' ').toLowerCase().includes(searchBox.value.toLowerCase()));if(!matches.length){const empty=document.createElement('p');empty.textContent='没有匹配的提示词';choices.append(empty);}for(const row of matches.slice(0,100)){const option=button(row.title||'未命名提示词',()=>{if(chosen.has(row.id))chosen.delete(row.id);else if(chosen.size<4)chosen.set(row.id,{id:row.id,title:row.title});renderChoices();});option.setAttribute('aria-pressed',String(chosen.has(row.id)));option.disabled=!chosen.has(row.id)&&chosen.size>=4;choices.append(option);}};
      const actions=document.createElement('div');actions.className='pe-dialog-actions';actions.append(button('取消',()=>dialog.close()),button('使用所选参考',()=>{if(currentId===sid){selectedReferences=[...chosen.values()];writeLocal('lumina.pe-chat.references.'+sid,JSON.stringify(selectedReferences));renderSelectedReferences();}dialog.close();}));
      dialog.append(title,note,searchBox,choices,actions);document.body.append(dialog);searchBox.oninput=renderChoices;renderChoices();dialog.addEventListener('close',()=>{dialog.remove();panel.querySelector('.pe-add').focus();},{once:true});dialog.showModal();searchBox.focus();
    }catch(e){status.textContent=e.message;}
  };
  const addButton=panel.querySelector('.pe-add'),addMenu=panel.querySelector('.pe-add-menu'),fileInput=panel.querySelector('.pe-image-file');
  function closeAdd(){addMenu.hidden=true;addButton.setAttribute('aria-expanded','false');}
  addButton.onclick=()=>{addMenu.hidden=!addMenu.hidden;addButton.setAttribute('aria-expanded',String(!addMenu.hidden));modelPicker.open=false;};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.pe-add-wrap'))closeAdd();});
  addMenu.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeAdd();addButton.focus();}});
  function saveAttachment(){writeLocal('lumina.pe-chat.attachment.'+currentId,JSON.stringify(attachment));writeLocal('lumina.pe-chat.mode.'+currentId,imageMode?'image':'chat');}
  function renderAttachment(){
    const tray=panel.querySelector('.pe-attachments'),chip=panel.querySelector('.pe-mode-chip');tray.replaceChildren();tray.hidden=!attachment;chip.replaceChildren();chip.hidden=!imageMode;
    if(attachment){const img=document.createElement('img');img.src='/api/pe-chat/images/'+attachment.id;img.alt='本次参考图片';const remove=button('×',()=>{attachment=null;saveAttachment();renderAttachment();controls();});remove.setAttribute('aria-label','移除图片');tray.append(img,remove);}
    if(imageMode){const cancel=button('图片反推 ×',()=>{imageMode=false;saveAttachment();renderAttachment();});cancel.setAttribute('aria-label','退出图片反推模式');chip.append(cancel);}
    input.placeholder=imageMode?'添加图片，补充你想反推的内容':'询问 自由对话';
  }
  for(const item of addMenu.querySelectorAll('button'))item.onclick=()=>{closeAdd();if(item.dataset.add==='reference'){chooseReferences();return;}if(item.dataset.add==='reverse'){imageMode=true;saveAttachment();renderAttachment();if(attachment){input.focus();return;}}fileInput.click();};
  async function addImage(file){
    if(!loaded||uploading||!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status.textContent='请选择 JPG、PNG 或 WebP 图片。';return;}
    if(file.size>20*1024*1024){status.textContent='图片不能超过 20 MB。';return;}
    const sid=currentId;uploading=true;controls();status.textContent='正在添加图片…';
    try{
      const config=await fetch('/api/config',{cache:'no-store'});if(!config.ok)throw Error('无法连接本地服务');
      const data=new FormData();data.append('image',file);
      const response=await fetch('/api/pe-chat/images',{method:'POST',headers:{'X-App-Token':(await config.json()).token},body:data});
      const result=await response.json();if(!response.ok)throw Error(result.error||'图片添加失败');
      if(!/^[a-f0-9]{32}$/.test(result.id))throw Error('图片返回格式无效');
      writeLocal('lumina.pe-chat.attachment.'+sid,JSON.stringify({id:result.id}));
      if(currentId===sid){attachment={id:result.id};renderAttachment();status.textContent='图片已添加，可直接发送或补充要求。';input.focus();}
    }catch(e){if(currentId===sid)status.textContent=e.message;}
    finally{uploading=false;controls();}
  }
  fileInput.onchange=()=>{addImage(fileInput.files[0]);fileInput.value='';};
  panel.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
  panel.addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();if(e.dataTransfer.files.length>1){status.textContent='每条消息请添加一张参考图片。';return;}addImage(e.dataTransfer.files[0]);}});
  input.addEventListener('paste',e=>{const image=[...e.clipboardData.items].find(item=>item.type.startsWith('image/'));if(image){e.preventDefault();addImage(image.getAsFile());}});
  async function stopCurrent(){
    const sid=currentId,target=state.messages.find(m=>m.status==='pending');if(!target||stopping)return;stopping=true;controls();
    try{await apiCall('POST',{action:'stop',session_id:sid,target_id:target.id});if(currentId===sid)status.textContent='正在停止回复…';}catch(e){if(currentId===sid)status.textContent=e.message;}finally{stopping=false;controls();load();}
  }
  function renderModels(){
    const label=panel.querySelector('.pe-model'),host=panel.querySelector('.pe-model-options');host.replaceChildren();
    const active=providers.find(p=>p.id===selectedProvider);label.textContent=active?.name||active?.model||active?.label||'选择模型';label.title=active?.model||'';
    for(const provider of providers){
      const option=button('',()=>{selectedProvider=provider.id;writeLocal('lumina.pe-chat.provider',selectedProvider);renderModels();modelPicker.open=false;input.focus();});
      option.dataset.available=String(provider.available);option.setAttribute('aria-pressed',String(provider.id===selectedProvider));
      const title=document.createElement('strong');title.textContent=provider.name||provider.model||provider.label;
      option.title=provider.model+' · '+provider.description;
      option.append(title);
      if(provider.kind==='cloud'||provider.id==='deepseek'){
        option.classList.add('is-cloud');
        const cloud=document.createElement('span');cloud.className='pe-model-cloud';cloud.setAttribute('role','img');cloud.setAttribute('aria-label','云端模型');cloud.title='云端模型';
        cloud.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6-1.5A4.8 4.8 0 0 0 7 18Z"/></svg>';option.append(cloud);
      }
      host.append(option);
    }
    controls();
  }
  let modelGuideShown=false;
  function guideModelSetup(){
    const cloudReady=providers.some(p=>(p.kind==='cloud'||p.id==='deepseek')&&p.available);
    const local=providers.find(p=>(p.kind==='local'||p.id==='qwen')&&p.available);
    if(cloudReady||modelGuideShown||(local&&local.id===readLocal('lumina.pe-chat.provider')))return;
    modelGuideShown=true;
    const dialog=document.createElement('dialog');
    dialog.className='pe-session-dialog pe-setup-dialog';
    dialog.setAttribute('aria-labelledby','pe-setup-title');
    dialog.innerHTML='<h2 id="pe-setup-title">选择对话模型</h2><p>尚未配置云端 API Key。你可以连接云端服务，也可以使用本地语言模型。</p><div class="pe-setup-options"></div>';
    const options=dialog.querySelector('.pe-setup-options');
    function settings(section){
      const base=location.protocol==='file:'?'settings.html':'/settings';
      location.assign(base+'?modelSection='+section+'#pe');
    }
    options.append(button('前往设置填写 API Key',()=>settings('cloud')),
      button(local?'使用本地模型 · '+(local.name||local.label):'设置本地语言模型',()=>{
        if(!local){settings('local');return;}
        selectedProvider=local.id;writeLocal('lumina.pe-chat.provider',local.id);
        renderModels();dialog.close();input.focus();
      }));
    if(!local){
      const hint=document.createElement('small');
      hint.textContent='本地对话需要 llama-server 运行组件和 GGUF 模型文件。';
      options.append(hint);
    }
    dialog.append(button('稍后再说',()=>dialog.close()));
    document.body.append(dialog);
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    dialog.showModal();
  }
  window.addEventListener('focus',()=>loadModel());
  async function loadModel(){
    try{const data=await apiCall('GET',undefined,'?info=1');providers=data.providers||[{id:'deepseek',label:'DeepSeek',model:data.model||'',available:!!data.configured,description:'云端'},{id:'qwen',label:'Qwen',model:'Qwen3.5-4B',available:false,description:'后端更新后可用'}];
      if(!providers.some(p=>p.id===selectedProvider&&p.available))selectedProvider=providers.find(p=>p.id===data.default_id&&p.available)?.id||providers.find(p=>p.available)?.id||'';renderModels();guideModelSetup();
    }catch{panel.querySelector('.pe-model').textContent='模型离线';}
  }
  document.addEventListener('pointerdown',e=>{if(!modelPicker.contains(e.target))modelPicker.open=false;});
  modelPicker.addEventListener('toggle',()=>{if(modelPicker.open)loadModel();});
  modelPicker.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();modelPicker.open=false;modelPicker.querySelector('summary').focus();}});
  async function branchMessage(message,edit){
    if(branching)return;
    const sid=currentId,revision=state.revision;const source=message.role==='user'?message:state.messages.find(m=>m.id===message.reply_to);if(!source)return;
    let content=source.content;
    if(edit){
      content=await new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='pe-session-dialog pe-edit-message';const title=document.createElement('h2');title.textContent='编辑并重新发送';const note=document.createElement('p');note.textContent='将从这条消息创建新分支，原对话与后续内容都会保留。';const text=document.createElement('textarea');text.value=source.content;text.maxLength=20000;text.setAttribute('aria-label','修改消息');const actions=document.createElement('div');actions.className='pe-dialog-actions';let value=null;actions.append(button('取消',()=>dialog.close()),button('创建分支并发送',()=>{if(text.value.trim()){value=text.value.trim();dialog.close();}}));dialog.append(title,note,text,actions);document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();resolve(value);},{once:true});dialog.showModal();text.focus();});
      if(!content)return;
    }
    if(currentId!==sid)return;
    branching=true;
    try{
      const row=await apiCall('POST',{action:'branch',session_id:sid,new_id:crypto.randomUUID(),message_id:message.id,revision});
      await loadSessions();await selectSession(row.id);attachment=source.image_id?{id:source.image_id}:null;imageMode=source.mode==='image';saveAttachment();renderAttachment();input.value=content;persistInput();selectedReferences=(source.references||[]).filter(r=>(source.reference_ids||[]).includes(r.id));writeLocal('lumina.pe-chat.references.'+row.id,JSON.stringify(selectedReferences));renderSelectedReferences();controls();await submit();
    }catch(e){status.textContent=e.message;}finally{branching=false;}
  }
  function render() {
    controls();
    const serial = JSON.stringify([state,sending.has(currentId)]);
    if (serial === rendered) return;
    rendered = serial;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 100;
    const previousScroll = list.scrollTop;
    const expanded=new Set([...list.querySelectorAll('article[data-message-id] details[open]')].map(d=>d.closest('article').dataset.messageId));
    list.replaceChildren();
    panel.classList.toggle('is-empty', !state.messages.length);
    renderHistory();
    if (!state.messages.some(m => m.draft)) { const empty=document.createElement('div');empty.className='pe-no-drafts';empty.textContent='还没有草稿。和 自由对话 讨论一个想法后，可以在这里查看。';list.append(empty); }
    for (const m of state.messages) {
      const article = document.createElement('article'); article.className = 'pe-chat-message ' + m.role;article.id='pe-message-'+state.messages.indexOf(m);article.dataset.hasDraft=String(!!m.draft);article.dataset.messageId=m.id;
      const label = document.createElement('small'); label.className = 'pe-chat-role';
      label.textContent = (m.role === 'user' ? '你' : '自由对话') + ' · ' + new Date(m.created_at).toLocaleString();
      if(m.model)label.title='本条回复使用 '+m.model;
      const text = document.createElement('div'); text.className = 'pe-chat-text'; text.textContent = m.content;
      article.append(label, text);
      if(m.image_id){const image=document.createElement('img');image.className='pe-message-image';image.src='/api/pe-chat/images/'+encodeURIComponent(m.image_id);image.alt='参考图片';image.loading='lazy';article.append(image);}
      const messageActions=document.createElement('div');messageActions.className='pe-chat-actions pe-message-actions';
      messageActions.append(button('复制',()=>copyText(m.content,'消息已复制')));
      if(!state.messages.some(row=>row.status==='pending')&&!busy){
        if(m.role==='user')messageActions.append(button('编辑重发',()=>branchMessage(m,true)));
        else if(m.reply_to){const regenerate=button('重新回答',()=>branchMessage(m,false));regenerate.title='在新分支中重新回答，保留原记录';messageActions.append(regenerate);}
      }
      article.append(messageActions);
      if (m.references?.length) {
        const refs = document.createElement('div'); refs.className = 'pe-chat-references';
        refs.append(document.createTextNode('参考：'));for(const r of m.references)refs.append(resourceLink(r.title,r.id));article.append(refs);
      }
      if (m.draft) {
        const details = document.createElement('details'); details.className = 'pe-chat-draft';
        const summary = document.createElement('summary'); summary.textContent = m.draft.title;const savedId=m.saved_prompt_id||readLocal('lumina.pe-chat.saved.'+m.id);const saved=document.createElement('small');saved.className='pe-draft-state';saved.textContent=savedId?'已保存':'未保存';summary.append(saved);details.open=expanded.has(m.id);
        const body = document.createElement('pre'); body.textContent = m.draft.prompt;
        details.append(summary, body); article.append(details);
        const actions = document.createElement('div'); actions.className = 'pe-chat-actions';
        actions.append(button('复制提示词', async () => {
          try { await navigator.clipboard.writeText(m.draft.prompt); status.textContent = '提示词已复制'; }
          catch { status.textContent = '复制失败，请展开草稿手动选择复制'; }
        }), button(savedId?'继续编辑已保存提示词':'检查并保存草稿', () => {
          if (window.openPEChatDraft) window.openPEChatDraft({...m.draft,id:savedId},m.id);
          else status.textContent = '编辑器尚未加载，请稍后重试';
        }));if(savedId){actions.append(resourceLink('查看提示词 ↗',savedId),resourceLink('带入工作台 ↗',savedId,'workbench'));}article.append(actions);
      }
      if (m.status === 'pending') {
        const note = document.createElement('p'); note.textContent = ({retrieving:'正在查找参考提示词…',answering:'正在组织回答与草稿…',stopping:'正在停止回复…'})[state.phase]||'正在准备回复…'; article.append(note);
      }
      if(m.status==='stopped'){const note=document.createElement('p');note.className='pe-stopped';note.textContent='回复已停止';article.append(note);if(state.messages.at(-1).id===m.id)article.append(button('重新回复',()=>submit(m)));}
      if (m.status === 'error') {
        const note = document.createElement('p'); note.className = 'pe-chat-error'; note.textContent = m.error;
        article.append(note);
        if (state.messages.at(-1).id === m.id) article.append(button('重试这条消息', () => submit(m)));
      }
      list.append(article);
    }
    if (atBottom) list.scrollTop = list.scrollHeight; else list.scrollTop = previousScroll;
  }
  async function load() {
    if(refreshing)return;refreshing=true;lastPoll=Date.now();
    const id=currentId,version=selectionVersion;
    try{
      await loadSessions();if(version!==selectionVersion)return;
      if(draftSessions.has(id)){if(!sessions.some(s=>s.id===id))return;draftSessions.delete(id);}
      if(!sessions.some(s=>s.id===id)){if(sessions.length)await selectSession(sessions[0].id);else await createSession();return;}
      if(!loaded){await selectSession(id);return;}
      const data=await apiCall('GET',undefined,'?session_id='+encodeURIComponent(id));
      if(version===selectionVersion&&data.revision>=state.revision&&(!sending.has(id)||data.revision>state.revision||data.messages.some(m=>m.status==='pending'))){state=data;loaded=true;render();}
    }catch(e){if(version===selectionVersion)status.textContent='读取记录失败：'+e.message;}finally{refreshing=false;}
  }
  async function submit(retry) {
    const sid=currentId;
    if(!loaded||sending.has(sid)||state.messages.some(m=>m.status==='pending'))return;
    const message=retry?retry.content:(input.value.trim()||(attachment?(imageMode?'请根据这张图片反推提示词。':'请描述这张图片。'):''));if(!message||uploading)return;
    const imageId=retry?retry.image_id:attachment?.id,mode=retry?(retry.mode||'chat'):(imageMode?'image':'chat');
    const selected=providers.find(p=>p.id===(retry?.provider||selectedProvider));
    if(!selected?.available){status.textContent='请先在设置中添加可用的 PE 模型。';return;}
    if((imageId||state.messages.some(m=>m.image_id))&&selected.vision===false){status.textContent='当前模型不支持图片，请切换到支持图片的模型。';return;}
    if(mode==='image'&&!imageId&&!state.messages.some(m=>m.image_id)){status.textContent='请先添加参考图片。';return;}
    const id=retry?retry.id:crypto.randomUUID(),revision=state.revision;
    const references=retry?(retry.reference_ids||[]):selectedReferences.map(r=>r.id);
    const referenceSnapshot=JSON.stringify(selectedReferences);
    sending.add(sid);controls();status.textContent='正在发送…';
    if(!retry)state.messages.push({id,role:'user',content:message,image_id:imageId,mode,status:'sending',created_at:new Date().toISOString()});
    render();renderHistory();list.scrollTop=list.scrollHeight;
    const clearDraft=()=>{if(!retry&&imageId){const key='lumina.pe-chat.attachment.'+sid;let saved;try{saved=JSON.parse(readLocal(key,'null'));}catch{}if(saved?.id===imageId){writeLocal(key,'null');if(currentId===sid&&attachment?.id===imageId){attachment=null;renderAttachment();}}}if(!retry&&readLocal(draftKey(sid)).trim()===message){writeLocal(draftKey(sid),'');if(currentId===sid&&input.value.trim()===message)input.value='';}};
    try{
      if(draftSessions.has(sid))await apiCall('POST',{action:'create',session_id:sid});
      const data=await apiCall('POST',{session_id:sid,message,request_id:id,revision,reference_ids:references,provider:retry?.provider||selectedProvider,image_id:imageId,mode});draftSessions.delete(sid);clearDraft();if(!retry&&readLocal('lumina.pe-chat.references.'+sid,'[]')===referenceSnapshot){writeLocal('lumina.pe-chat.references.'+sid,'[]');if(currentId===sid){selectedReferences=[];renderSelectedReferences();}};
      if(currentId===sid){state=data;loaded=true;render();list.scrollTop=list.scrollHeight;status.textContent=state.messages.at(-1)?.status==='error'?'消息已保留，可以重试。':state.messages.at(-1)?.status==='stopped'?'已停止回复，消息已保留。':'已保存到本机';}
    }catch(e){
      if(currentId===sid)status.textContent=e.message;
      try{const data=await apiCall('GET',undefined,'?session_id='+encodeURIComponent(sid));if(data.messages.some(m=>m.id===id)){draftSessions.delete(sid);clearDraft();}if(currentId===sid){state=data;render();}}catch{}
    }finally{sending.delete(sid);render();loadSessions().catch(()=>{});}
  }
  panel.querySelector('form').onsubmit = e => { e.preventDefault();if(state.messages.some(m=>m.status==='pending'))stopCurrent();else submit(); };
  input.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!send.disabled&&!busy&&!state.messages.some(m=>m.status==='pending')) submit(); }
  };
  let reviewKey = '', reviewFocus,reviewMessageId='',reviewSessionId='';
  const review = document.createElement('dialog'); review.className = 'pe-review';
  const frame = document.createElement('iframe'); frame.title = '检查并保存提示词';
  review.append(frame); document.body.append(review);
  window.openPEChatDraft = async (draft,messageId='') => {
    try {
      reviewMessageId=messageId;reviewSessionId=currentId;
      if(draft.id){const response=await fetch('/api/prompts',{cache:'no-store'});if(!response.ok)throw Error('无法读取已保存提示词，请稍后重试');const row=(await response.json()).find(r=>r.id===draft.id);if(row)draft=row;else{draft={title:draft.title,prompt:draft.prompt};status.textContent='原提示词已删除，将保存为新提示词。';}}
      reviewKey = Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('lumina-reader-draft:' + reviewKey, JSON.stringify({...draft,source_label:'自由对话'}));
      reviewFocus = document.activeElement;
      frame.src = (location.protocol === 'file:' ? 'index.html' : '/workbench') + '?reader_draft=' + reviewKey;
      review.showModal();
    } catch (error) { status.textContent = '打开草稿失败：' + error.message; }
  };
  review.addEventListener('cancel', event => event.preventDefault());
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !['reader-draft-closed','reader-draft-error','reader-draft-saved'].includes(event.data?.type)) return;
    if(event.data.type==='reader-draft-saved'){
      const row=event.data.row;if(!row?.id)return;
      if(reviewMessageId){const sid=reviewSessionId,mid=reviewMessageId;writeLocal('lumina.pe-chat.saved.'+mid,row.id);try{const data=await apiCall('POST',{action:'link_draft',session_id:sid,message_id:mid,prompt_id:row.id});if(currentId===sid){state=data;render();}}catch(e){status.textContent='提示词已保存，聊天关联待重试：'+e.message;return;}}
      status.replaceChildren(document.createTextNode('草稿已保存 · '));
      for(const [label,path] of [['带入工作台','workbench'],['查看提示词','resources']]){const link=document.createElement('a');link.className='creation-next-link';link.textContent=label+' ↗';link.href=(location.protocol==='file:'?(path==='workbench'?'index.html':'resources.html'):'/'+path)+'?prompt_id='+encodeURIComponent(row.id);link.target='_blank';link.rel='noopener';status.append(link);}
      return;
    }
    review.close(); frame.removeAttribute('src');
    sessionStorage.removeItem('lumina-reader-draft:' + reviewKey); reviewKey = '';
    reviewFocus?.focus();
    if (event.data.type === 'reader-draft-error') status.textContent = event.data.message || '草稿打开失败';
  });
  async function initialize(){
    controls();status.textContent='正在读取对话…';
    try{
      await loadSessions();
      const first=sessions.find(s=>s.title==='历史对话')||sessions[0];
      const legacy=readLocal('lumina.pe-chat.unsent');
      if(first&&legacy){if(!readLocal(draftKey(first.id)))writeLocal(draftKey(first.id),legacy);try{localStorage.removeItem('lumina.pe-chat.unsent');}catch{}}
      const entry=new URL(location.href),newEntry=entry.searchParams.get('new')==='1'||entry.searchParams.get('mode')==='image';
      const last=readLocal('lumina.pe-chat.active');
      const savedBlank=readLocal('lumina.pe-chat.blank');
      if(newEntry)await createSession();
      else if(savedBlank&&last===savedBlank&&!sessions.some(s=>s.id===last)){blankId=savedBlank;draftSessions.add(blankId);await selectSession(blankId);}
      else if(sessions.length)await selectSession(sessions.some(s=>s.id===last)?last:sessions[0].id);else await createSession();
      if(newEntry){imageMode=entry.searchParams.get('mode')==='image';saveAttachment();renderAttachment();entry.searchParams.delete('mode');entry.searchParams.delete('new');window.history.replaceState(null,'',entry);}
    }catch(e){status.textContent='读取对话失败：'+e.message;}
  }
  initialize();loadModel();
  refresh.onclick = ()=>{load();loadModel();};
  setInterval(() => { if (!document.hidden&&(busy||state.messages.some(m=>m.status==='pending')||Date.now()-lastPoll>5000)) load(); }, 1500);
})();
