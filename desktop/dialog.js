let options,finished=false;
function reply(index){if(finished||!options)return;finished=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);window.luminaDialog.respond({response:index,checkboxChecked:document.getElementById('dialog-checkbox')?.checked===true});}
window.luminaDialog.onOpen(data=>{
  options=data;const dialog=document.getElementById('dialog');dialog.dataset.type=data.type;dialog.dataset.size=data.size;
  document.getElementById('dialog-title').textContent=data.message;
  document.getElementById('dialog-detail').textContent=data.detail;
  document.getElementById('dialog-detail').hidden=!data.detail;
  document.getElementById('dialog-check-label')?.remove();
  if(data.checkboxLabel){const label=document.createElement('label');label.id='dialog-check-label';const input=document.createElement('input');input.type='checkbox';input.id='dialog-checkbox';input.checked=data.checkboxChecked;label.append(input,document.createTextNode(data.checkboxLabel));document.querySelector('.copy').append(label);}
  document.getElementById('symbol').textContent={info:'i',question:'?',warning:'!',error:'!',success:'✓'}[data.type];
  const actions=document.getElementById('actions');actions.replaceChildren();
  data.buttons.forEach((label,index)=>{const button=document.createElement('button');button.textContent=label;button.type='button';if(index===data.primaryId)button.className=data.danger?'primary danger':'primary';button.onclick=()=>reply(index);actions.append(button);});
  actions.children[data.defaultId].focus();
});
document.getElementById('close').onclick=()=>reply(options?.cancelId);
document.addEventListener('keydown',event=>{
  if(!options)return;
  if(event.key==='Escape'){event.preventDefault();reply(options.cancelId);}
  if(event.key==='Tab'){const buttons=[...document.querySelectorAll('button:not(:disabled),input:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
});
