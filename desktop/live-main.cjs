const { app, BrowserWindow, session, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {ORIGIN,createBackend} = require('./backend.cjs');
const {createShell,ownerOf}=require('./window-shell.cjs');
const {showAppDialog}=require('./app-dialog.cjs');
const root=path.resolve(__dirname,'..');
const backend=createBackend({root});
const splash=pathToFileURL(path.join(__dirname,'startup.html')).href;
let primary;
app.setName('LuminaUI');
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>{if(primary&&!primary.isDestroyed()){if(primary.isMinimized())primary.restore();primary.show();primary.moveTop();primary.focus();}});
  app.whenReady().then(start).catch(error=>{dialog.showErrorBox('LuminaUI 启动失败',error.stack||error.message);app.quit();});
}
function local(url){try{return new URL(url).origin===ORIGIN;}catch{return false;}}
async function external(url){try{const parsed=new URL(url);if(['https:','http:'].includes(parsed.protocol))await shell.openExternal(parsed.href);}catch{}}
function newWindow(){return createShell({partition:'persist:lumina',loadTab:async(win,contents,id,url)=>{wire(win,contents);await connect(win,contents,url||ORIGIN+'/workbench?page='+encodeURIComponent(id));}});}
function wire(win,contents){
  contents.setWindowOpenHandler(({url})=>{
    if(local(url))win.openSection(url);
    else external(url);
    return {action:'deny'};
  });
  contents.on('will-navigate',(event,url)=>{if(!local(url)){event.preventDefault();external(url);}else if(new URL(url).pathname!==new URL(contents.getURL()).pathname){event.preventDefault();win.openSection(url);}});
  contents.on('will-redirect',(event,url)=>{if(!local(url))event.preventDefault();});
}
async function connect(win,contents=win.contentWebContents,target=ORIGIN+'/workbench'){
  if(win.isDestroyed()||contents.isDestroyed())return;
  await contents.loadFile(path.join(__dirname,'startup.html'));
  const report=(message,error=false)=>{if(!win.isDestroyed()&&!contents.isDestroyed())contents.send('startup-status',{message,error});};
  try{await backend.ensure(report);if(!win.isDestroyed()&&!contents.isDestroyed())await contents.loadURL(target);}
  catch(error){report(error.message,true);}
}
async function start(){
  const ses=session.fromPartition('persist:lumina');
  ses.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  ses.setPermissionCheckHandler(()=>false);
  ses.on('will-download',(_event,item,contents)=>{
    item.setSaveDialogOptions({title:'保存图片',defaultPath:path.join(app.getPath('downloads'),item.getFilename())});
    item.once('done',(_e,state)=>{if(state==='interrupted'){const owner=ownerOf(contents);if(owner)showAppDialog(owner,{type:'error',message:'图片保存失败，请重试。'});}});
  });
  primary=newWindow();
}
ipcMain.on('startup-retry',event=>{if(event.sender.getURL()!==splash)return;const win=ownerOf(event.sender);if(win)connect(win,event.sender);});
ipcMain.on('startup-logs',event=>{if(event.sender.getURL()===splash)shell.openPath(path.join(__dirname,'logs'));});
app.on('window-all-closed',()=>app.quit());
