(() => {
  const panel=document.getElementById('system-panel');if(!panel)return;
  const section=document.createElement('section');section.className='assistant-settings';
  const link=document.createElement('a');link.href='/settings#pe';link.textContent='管理 PE 模型 ↗';section.append(link);panel.append(section);
})();
