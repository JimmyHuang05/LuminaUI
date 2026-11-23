const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('luminaDialog',{onOpen:callback=>ipcRenderer.on('lumina-dialog-open',(_event,options)=>callback(options)),respond:index=>ipcRenderer.send('lumina-dialog-result',index)});
