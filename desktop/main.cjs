const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {createShell}=require('./window-shell.cjs');
require('./build-preview.cjs');
const previewRoot = pathToFileURL(path.join(__dirname, 'web-preview') + path.sep).href;
function createWindow() {
  createShell({title:'LuminaUI · 桌面预览',partition:'persist:lumina-preview',preview:true,loadTab:async(win,contents,id,url,page)=>{
    contents.setWindowOpenHandler(({url})=>{if(url.startsWith(previewRoot))win.openSection(url);return {action:'deny'};});
    contents.on('will-navigate',(event,url)=>{event.preventDefault();if(url.startsWith(previewRoot))win.openSection(url);});
    if(url?.startsWith(previewRoot))await contents.loadURL(url);else await contents.loadFile(path.join(__dirname,'web-preview',page),{query:{page:id}});
  }});
}
app.whenReady().then(() => {
  // This preview can load only its own local assets. No backend or external traffic.
  session.fromPartition('persist:lumina-preview').webRequest.onBeforeRequest((details, callback) => {
    callback({cancel: !details.url.startsWith(previewRoot) && !details.url.startsWith('data:') && !details.url.startsWith('blob:')});
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
