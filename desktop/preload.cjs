const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('luminaStartup',{
  retry:()=>ipcRenderer.send('startup-retry'),
  logs:()=>ipcRenderer.send('startup-logs'),
  onStatus:callback=>ipcRenderer.on('startup-status',(_event,data)=>callback(data))
});

// Keep unsent form edits intact when source files change during local development.
let edited=false;
window.addEventListener('input',event=>{if(event.isTrusted)edited=true;},true);
window.addEventListener('change',event=>{if(event.isTrusted)edited=true;},true);
ipcRenderer.on('development-update',(_event,update)=>{
  if(update.kind==='page'&&!edited&&!document.querySelector('dialog[open],iframe[src],form[aria-busy=true],[aria-busy=true]')){
    location.reload();return;
  }
  let notice=document.getElementById('lumina-development-update');
  if(!notice){notice=document.createElement('div');notice.id='lumina-development-update';notice.setAttribute('role','status');notice.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:480px;display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid #505050;border-radius:8px;background:#252525;color:#ddd;box-shadow:0 6px 25px #0005;font:12px/1.6 system-ui';document.body.append(notice);}
  notice.replaceChildren();
  const text=document.createElement('span');text.textContent=update.kind==='restart'?update.message:'界面已更新。刷新会清空本页未提交的内容。';notice.append(text);
  function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='flex-shrink:0;border:1px solid #666;border-radius:5px;background:#333;color:#eee;padding:5px 9px;font:12px system-ui;cursor:pointer';b.onclick=action;notice.append(b);}
  if(update.kind==='page')button('刷新',()=>location.reload());
  button('稍后',()=>notice.remove());
});

contextBridge.exposeInMainWorld('luminaDesktop',{shell:true,
  getClosePreferences:()=>ipcRenderer.invoke('desktop-close-preferences'),
  saveClosePreferences:value=>ipcRenderer.invoke('desktop-save-close-preferences',value)
});
window.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.add('lumina-desktop'));
let actionObserver,actionTimeout;
ipcRenderer.on('lumina-global-action',(_event,action)=>{
  if(!['tasks','settings'].includes(action))return;
  actionObserver?.disconnect();clearTimeout(actionTimeout);
  const apply=()=>{const button=document.getElementById(action==='tasks'?'queue-toggle':'settings-toggle');if(!button)return false;if(button.getAttribute('aria-expanded')!=='true')button.click();button.focus();return true;};
  if(apply())return;
  actionObserver=new MutationObserver(()=>{if(apply()){actionObserver.disconnect();clearTimeout(actionTimeout);}});
  actionObserver.observe(document,{childList:true,subtree:true});actionTimeout=setTimeout(()=>actionObserver?.disconnect(),12000);
});
