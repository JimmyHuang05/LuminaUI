(() => {
  'use strict';
  const note='桌面 UI 预览 · 功能暂未接入';
  window.fetch=async (input, options={}) => {
    const raw=typeof input==='string'?input:input.url;
    const pathname=new URL(raw,raw.startsWith('/')?'http://preview':location.href).pathname;
    const method=(options.method || input?.method || 'GET').toUpperCase();
    const fixture=window.desktopPreviewFixtures[pathname];
    const available=method==='GET' && fixture!==undefined;
    return new Response(JSON.stringify(available?fixture:{error:note}),{status:available?200:503,headers:{'Content-Type':'application/json'}});
  };
  window.EventSource=class extends EventTarget { static CONNECTING=0;static OPEN=1;static CLOSED=2;readyState=2;close(){} };
  window.WebSocket=class { constructor(){throw new Error(note);} };
  const routes={'/':'home.html','/workbench':'index.html','/resources':'resources.html','/generated':'generated.html','/image-reader':'image-reader.html','/pe-chat':'pe-chat.html','/settings':'settings.html'};
  const openLocal=window.open.bind(window);
  window.open=(url)=>{const dest=routes[url];if(dest)openLocal(dest);else notify();return null;};
  function notify(){let el=document.getElementById('desktop-preview-notice');if(!el){el=document.createElement('div');el.id='desktop-preview-notice';el.setAttribute('role','status');el.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 18px;border:1px solid #555;border-radius:6px;background:#292929;color:#ddd;font:12px system-ui;z-index:99999';document.body.append(el);}el.textContent=note;el.hidden=false;clearTimeout(window.desktopPreviewNoticeTimer);window.desktopPreviewNoticeTimer=setTimeout(()=>el.hidden=true,2600);}
  document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();notify();},true);
  document.addEventListener('click',event=>{const link=event.target.closest('a');if(link){const url=new URL(link.href);if(url.protocol==='file:'){event.preventDefault();openLocal(link.href);}else{event.preventDefault();notify();}}const upload=event.target.closest('input[type=file]');if(upload){event.preventDefault();notify();}},true);
  document.addEventListener('DOMContentLoaded',()=>{
    document.title='LuminaUI · 桌面预览';
    const connection=document.getElementById('connection');
    if(connection){const label=()=>{if(connection.textContent!==note)connection.textContent=note;};new MutationObserver(label).observe(connection,{childList:true});label();}
    document.querySelectorAll('input[type=password]').forEach(input=>{input.disabled=true;input.placeholder='预览版不填写密钥';});
  });
})();
