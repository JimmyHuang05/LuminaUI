const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

function classify(area,name){
  if(area==='webui'){
    if(/\.(css|html|js)$/.test(name))return name.endsWith('.css')?'css':'page';
    if(name.endsWith('.py'))return 'backend';
  }else{
    if(['titlebar.css','titlebar.html','titlebar.js'].includes(name))return name.endsWith('.css')?'css':'titlebar';
    if(/\.(cjs|js|py)$/.test(name)&&!name.includes('.test.'))return 'desktop';
  }
  return null;
}

function snapshot(dir,area){
  const files=new Map();
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    if(!item.isFile()||!classify(area,item.name))continue;
    try{files.set(item.name,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,item.name))).digest('hex'));}catch{}
  }
  return files;
}

// Run in the page's main world: only external stylesheets are replaced, never inputs.
function updatePage(changes){
  const basename=url=>{try{return decodeURIComponent(new URL(url,location.href).pathname).split('/').pop();}catch{return '';}};
  const relevant=changes.filter(change=>change.action==='css'
    ? [...document.querySelectorAll('link[rel=stylesheet]')].some(n=>basename(n.href)===change.name)
    : basename(location.href)===change.name||[...document.scripts].some(n=>n.src&&basename(n.src)===change.name)||[...document.querySelectorAll('iframe[src]')].some(n=>basename(n.src)===change.name));
  const reload=relevant.some(change=>change.action!=='css');
  if(!reload)for(const change of relevant)for(const old of document.querySelectorAll('link[rel=stylesheet]')){
    if(basename(old.href)!==change.name)continue;
    const next=old.cloneNode();const url=new URL(old.href);url.searchParams.set('lumina_reload',Date.now());next.href=url.href;
    next.onload=()=>old.remove();next.onerror=()=>next.remove();old.after(next);
  }
  return reload;
}

function watchSources({root,onChanges,onError=console.error,delay=350}){
  let timer,closed=false;
  const directories=['webui','desktop'].map(area=>({area,dir:path.join(root,area)}));
  for(const item of directories)item.files=snapshot(item.dir,item.area);
  function scan(){
    if(closed)return;
    const changes=[];
    for(const item of directories){
      const current=snapshot(item.dir,item.area);
      for(const [name,hash] of current)if(item.files.get(name)!==hash)changes.push({area:item.area,name,action:classify(item.area,name)});
      item.files=current;
    }
    if(changes.length)Promise.resolve(onChanges(changes)).catch(onError);
  }
  const watchers=directories.map(item=>{const watcher=fs.watch(item.dir,(_event,name)=>{
    if(name&&!classify(item.area,String(name)))return;
    clearTimeout(timer);timer=setTimeout(()=>{try{scan();}catch(error){onError(error);}},delay);
  });watcher.on('error',onError);return watcher;});
  return ()=>{closed=true;clearTimeout(timer);watchers.forEach(w=>w.close());};
}

function attachLiveReload(win,{preview,getContents}){
  const {app}=require('electron');
  if(app.isPackaged||process.env.LUMINA_LIVE_RELOAD==='0')return;
  const stop=watchSources({root:path.resolve(__dirname,'..'),onChanges:async changes=>{
    if(win.isDestroyed())return;
    if(preview&&changes.some(c=>c.area==='webui')){
      delete require.cache[require.resolve('./build-preview.cjs')];require('./build-preview.cjs');
    }
    const shellChanges=changes.filter(c=>c.area==='desktop'&&['css','titlebar'].includes(c.action));
    if(shellChanges.length){
      if(shellChanges.some(c=>c.action==='titlebar'))win.webContents.reloadIgnoringCache();
      else await win.webContents.executeJavaScript(`(${updatePage.toString()})(${JSON.stringify(shellChanges)})`);
    }
    const pageChanges=changes.filter(c=>c.area==='webui'&&['css','page'].includes(c.action));
    const needsRestart=changes.some(c=>['backend','desktop'].includes(c.action));
    for(const contents of getContents()){
      if(contents.isDestroyed()||!contents.getURL()||contents.isLoadingMainFrame())continue;
      try{
        if(pageChanges.length&&await contents.executeJavaScript(`(${updatePage.toString()})(${JSON.stringify(pageChanges)})`))contents.send('development-update',{kind:'page'});
        if(needsRestart)contents.send('development-update',{kind:'restart',message:'后台或桌面主进程代码已更新，需重启对应服务后生效。'});
      }catch(error){console.error('Live reload:',error.message);}
    }
  }});
  win.once('closed',stop);
}
module.exports={classify,watchSources,updatePage,attachLiveReload};
