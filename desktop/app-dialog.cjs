const {WebContentsView,ipcMain}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {normalize}=require('./dialog-options.cjs');
const page=pathToFileURL(path.join(__dirname,'dialog.html')).href;
const pending=new Map(),queues=new WeakMap();
ipcMain.on('lumina-dialog-result',(event,response)=>{
  const request=pending.get(event.sender.id);
  if(!request||event.senderFrame!==event.sender.mainFrame||event.sender.getURL()!==page)return;
  const index=typeof response==='object'&&response?response.response:response;
  if(Number.isInteger(index)&&index>=0&&index<request.options.buttons.length)request.finish(index,!!request.options.checkboxLabel&&response?.checkboxChecked===true);
});
function present(win,options){return new Promise(resolve=>{
  if(win.isDestroyed()){resolve({response:options.cancelId});return;}
  const previous=win.contentWebContents;
  const view=new WebContentsView({webPreferences:{preload:path.join(__dirname,'dialog-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const contents=view.webContents,id=contents.id;let done=false;
  view.setBackgroundColor('#00000000');win.contentView.addChildView(view);
  function resize(){if(!win.isDestroyed()){const [width,height]=win.getContentSize();view.setBounds({x:0,y:0,width,height});}}
  function finish(response,checkboxChecked=false){if(done)return;done=true;pending.delete(id);win.removeListener('resize',resize);win.removeListener('closed',closed);
    if(!win.isDestroyed())win.contentView.removeChildView(view);
    if(!contents.isDestroyed())contents.close();
    if(!win.isDestroyed()&&previous&&!previous.isDestroyed())previous.focus();
    resolve({response,checkboxChecked});
  }
  function closed(){finish(options.cancelId);}
  pending.set(id,{options,finish});resize();win.on('resize',resize);win.once('closed',closed);
  contents.setWindowOpenHandler(()=>({action:'deny'}));contents.on('will-navigate',event=>event.preventDefault());
  contents.once('render-process-gone',closed);
  contents.once('did-finish-load',()=>{if(!done){contents.send('lumina-dialog-open',options);contents.focus();}});
  contents.loadURL(page).catch(closed);
});}
function showAppDialog(win,options){
  if(!win||win.isDestroyed())return Promise.resolve({response:normalize(options).cancelId});
  const next=(queues.get(win)||Promise.resolve()).then(()=>present(win,normalize(options)));
  const tail=next.catch(()=>{});queues.set(win,tail);
  tail.finally(()=>{if(queues.get(win)===tail)queues.delete(win);});
  return next;
}
module.exports={showAppDialog};
