const {app,Tray,Menu,ipcMain}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const preferences=require('./close-preferences.cjs');
const {createCloseController}=require('./close-controller.cjs');
const {showAppDialog}=require('./app-dialog.cjs');
const owners=new Map();
function trusted(event){
  const owner=owners.get(event.sender.id);
  if(!owner||event.senderFrame!==event.sender.mainFrame)return null;
  const url=new URL(event.sender.getURL());
  return (owner.preview?url.href.split(/[?#]/)[0]===pathToFileURL(path.join(__dirname,'web-preview/settings.html')).href:url.origin==='http://127.0.0.1:18290'&&url.pathname==='/settings')?owner:null;
}
ipcMain.handle('desktop-close-preferences',event=>{const owner=trusted(event);if(!owner)throw Error('仅设置页面可以读取关闭行为');return preferences.read(owner.file);});
ipcMain.handle('desktop-save-close-preferences',(event,value)=>{const owner=trusted(event);if(!owner)throw Error('仅设置页面可以修改关闭行为');return preferences.write(owner.file,value);});
function attachCloseBehavior(win,{preview,tabs}){
  const file=path.join(__dirname,'data',preview?'close-preferences-preview.json':'close-preferences.json');
  const contentIds=tabs.map(tab=>tab.view.webContents.id);
  for(const tab of tabs)owners.set(tab.view.webContents.id,{file,preview});
  let tray;
  const controller=createCloseController({win,app,showDialog:showAppDialog,read:()=>preferences.read(file),write:value=>preferences.write(file,value),
    getActivity:async()=>{
      if(preview)return 0;
      try{const response=await fetch('http://127.0.0.1:18290/api/status',{signal:AbortSignal.timeout(3500)});if(!response.ok)return null;const data=await response.json();return Math.max(Number(data.queue)||0,(data.jobs||[]).filter(j=>['queued','running'].includes(j.status)).length);}catch{return null;}
    },
    ensureTray:()=>{
      if(tray&&!tray.isDestroyed())return;
      const created=new Tray(path.join(__dirname,'lumina.ico'));
      try{
        created.setToolTip(preview?'LuminaUI · 桌面预览':'LuminaUI');
        created.setContextMenu(Menu.buildFromTemplate([
          {label:'打开主窗口',click:()=>controller.restore()},
          {label:'设置',click:()=>{controller.restore();win.openSection(preview?pathToFileURL(path.join(__dirname,'web-preview/settings.html')).href+'#desktop':'http://127.0.0.1:18290/settings#desktop');}},
          {type:'separator'},
          {label:'退出软件',click:()=>controller.request(true)}
        ]));
        created.on('click',()=>controller.restore());created.on('double-click',()=>controller.restore());
        tray=created;
      }catch(error){created.destroy();throw error;}
    }
  });
  win.once('closed',()=>{tray?.destroy();for(const id of contentIds)owners.delete(id);});
  return controller;
}
module.exports={attachCloseBehavior};
