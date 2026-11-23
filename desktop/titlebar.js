const api=window.luminaTitlebar;
api.onState(state=>{
 document.getElementById('app-settings').classList.toggle('active',state.active==='settings');
 document.getElementById('app-settings').setAttribute('aria-pressed',String(state.active==='settings'));
 const host=document.getElementById('tabs');host.replaceChildren();
 for(const [index,tab] of state.tabs.entries()){
  const node=document.createElement('button');node.className='tab';node.setAttribute('role','tab');node.setAttribute('aria-selected',String(tab.id===state.active));node.tabIndex=tab.id===state.active?0:-1;node.textContent=tab.name;node.title=tab.name+' (Ctrl+'+(index+1)+')';
  node.onclick=()=>api.action('tab-select',tab.id);
  node.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?state.tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+state.tabs.length)%state.tabs.length;api.action('tab-select',state.tabs[next].id);}};
  host.append(node);
 }
});

document.getElementById('app-home').onclick=()=>api.action('home');
document.getElementById('app-tasks').onclick=()=>api.action('tasks');
document.getElementById('app-settings').onclick=()=>api.action('settings');
api.onEngine?.(state=>{
 document.getElementById('engine-label').textContent=state.preview?'界面预览':state.online?'引擎就绪':'引擎离线';
 document.getElementById('engine-dot').classList.toggle('online',state.online);
 document.getElementById('task-label').textContent=state.queue?state.queue+' 个任务':'任务';
});
