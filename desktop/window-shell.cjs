const {BrowserWindow,WebContentsView,Menu,ipcMain,dialog,shell,nativeTheme}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const TAB_HEIGHT=50;
const BAR_HEIGHT=TAB_HEIGHT;
const shellURL=pathToFileURL(path.join(__dirname,'titlebar.html')).href;
const shells=new Map();
const store=require('./tab-store.cjs');
const {showAppDialog}=require('./app-dialog.cjs');
function createShell({title='LuminaUI',partition,preview=false,loadTab}={}){
  nativeTheme.themeSource='dark';
  const win=new BrowserWindow({width:1480,height:940,minWidth:1000,minHeight:680,title,icon:path.join(__dirname,'lumina.ico'),backgroundColor:'#171717',
    // Keep native window controls above the full-width 1px header divider.
    titleBarStyle:'hidden',titleBarOverlay:{color:'#171717',symbolColor:'#aaa',height:TAB_HEIGHT-1},autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'titlebar-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const file=path.join(__dirname,'data',preview?'sections-preview.json':'sections.json');
  const sections=[{id:'home',name:'首页',route:'/',page:'home.html'},{id:'workbench',name:'工作台',route:'/workbench',page:'index.html'},{id:'resources',name:'资源库',route:'/resources',page:'resources.html'},{id:'pe-chat',name:'LuminaGPT',route:'/pe-chat',page:'pe-chat.html'},{id:'settings',name:'设置',route:'/settings',page:'settings.html',utility:true}];
  // Every launch begins on the welcome page; loaded sections retain state during the session.
  const saved={active:'home'};
  const entry={win,preview,tabs:[],active:saved.active,view:null};
  const shellId=win.webContents.id;
  shells.set(shellId,entry);
  function persist(){try{store.write(file,{tabs:entry.tabs.map(t=>({id:t.id,name:t.name})),active:entry.active});}catch(error){showAppDialog(win,{type:'error',message:'标签保存失败',detail:error.message});}}
  function sync(){if(!win.isDestroyed())win.webContents.send('titlebar-state',{title,tabs:entry.tabs.filter(t=>!t.utility).map(t=>({id:t.id,name:t.name})),active:entry.active});}
  function resize(){if(win.isDestroyed())return;const [width,height]=win.getContentSize();for(const tab of entry.tabs)tab.view.setBounds({x:0,y:BAR_HEIGHT,width,height:Math.max(0,height-BAR_HEIGHT)});}
  function load(tab,url){
    tab.loaded=true;
    Promise.resolve(loadTab?.(win,tab.view.webContents,tab.id,url||'http://127.0.0.1:18290'+tab.route,tab.page)).catch(error=>{tab.loaded=false;if(!win.isDestroyed())showAppDialog(win,{type:'error',message:'页面加载失败',detail:error.message});});
  }
  function activate(id,url){const tab=entry.tabs.find(t=>t.id===id);if(!tab)return;entry.active=id;entry.view=tab.view;win.contentWebContents=tab.view.webContents;for(const t of entry.tabs)t.view.setVisible(t===tab);resize();persist();sync();if(!tab.loaded)load(tab,url);else if(url)tab.view.webContents.loadURL(url);tab.view.webContents.focus();}
  for(const section of sections){
    const view=new WebContentsView({webPreferences:{...(partition?{partition}:{}),preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    entry.tabs.push({...section,view,loaded:false});win.contentView.addChildView(view);view.setBackgroundColor('#171717');view.setVisible(false);
    view.webContents.on('page-title-updated',event=>event.preventDefault());
    view.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.control&&sections.some((_,index)=>String(index+1)===input.key)){event.preventDefault();activate(sections[Number(input.key)-1].id);}});
  }
  function globalAction(action){
    if(action==='settings'){activate('settings');return;}
    const tab=entry.tabs.find(t=>t.id==='workbench');
    const send=()=>{const wc=tab.view.webContents;if(!wc.isDestroyed()&&/\/(workbench|index\.html)(?:[?#]|$)/.test(wc.getURL())){tab.pendingAction=null;wc.send('lumina-global-action',action);}};
    tab.pendingAction=action;activate('workbench');if(!tab.view.webContents.isLoading())send();
  }
  for(const tab of entry.tabs)tab.view.webContents.on('did-finish-load',()=>{if(tab.pendingAction&&/\/(workbench|index\.html)(?:[?#]|$)/.test(tab.view.webContents.getURL())){const action=tab.pendingAction;tab.pendingAction=null;tab.view.webContents.send('lumina-global-action',action);}});
  let statusTimer;
  async function updateEngine(){
    if(win.isDestroyed())return;
    let state={online:false,queue:0,preview};
    if(!preview)try{const response=await fetch('http://127.0.0.1:18290/api/status',{signal:AbortSignal.timeout(4500)});if(response.ok){const data=await response.json();state={online:!!data.online,queue:Number(data.queue)||0};}}catch{}
    if(!win.isDestroyed()){win.webContents.send('engine-state',state);statusTimer=setTimeout(updateEngine,5000);}
  }
  win.webContents.once('did-finish-load',updateEngine);
  win.on('closed',()=>clearTimeout(statusTimer));
  Object.assign(entry,{activate,sync,persist,globalAction});
  win.openSection=url=>{
    const legacy=new URL(url);if(legacy.pathname==='/image-reader'||legacy.pathname.endsWith('/image-reader.html')){legacy.pathname=preview?legacy.pathname.replace('image-reader.html','pe-chat.html'):'/pe-chat';legacy.searchParams.set('mode','image');url=legacy.href;}
    const parsed=new URL(url);if(parsed.pathname==='/generated'||parsed.pathname.endsWith('/generated.html')){parsed.pathname=preview?parsed.pathname.replace('generated.html','resources.html'):'/resources';parsed.searchParams.set('view','output');url=parsed.href;}const tab=entry.tabs.find(t=>preview?parsed.pathname.endsWith('/'+t.page):t.route===parsed.pathname)||entry.tabs.find(t=>t.id==='workbench');
    activate(tab.id,parsed.search||parsed.hash?url:undefined);
  };
  activate(saved.active);
  require('./close-behavior.cjs').attachCloseBehavior(win,{preview,tabs:entry.tabs});
  win.on('resize',resize);win.on('enter-full-screen',resize);win.on('leave-full-screen',resize);
  win.on('closed',()=>{shells.delete(shellId);for(const tab of entry.tabs)if(!tab.view.webContents.isDestroyed())tab.view.webContents.close();});
  win.once('ready-to-show',()=>win.show());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('did-finish-load',()=>{win.setTitle(title);sync();win.show();});win.loadFile(path.join(__dirname,'titlebar.html'));
  require('./live-reload.cjs').attachLiveReload(win,{preview,getContents:()=>entry.tabs.filter(t=>t.loaded).map(t=>t.view.webContents)});
  return win;
}
function ownerOf(contents){for(const {win,tabs} of shells.values())if(tabs.some(t=>t.view.webContents===contents))return win;return null;}
ipcMain.on('titlebar-action',(event,action,data)=>{
  const entry=shells.get(event.sender.id);
  if(!entry||event.senderFrame!==event.sender.mainFrame||event.sender.getURL()!==shellURL)return;
  if(action==='tab-select')entry.activate(data);
  if(action==='home')entry.activate('home');
  if(['tasks','settings'].includes(action))entry.globalAction(action);
});
module.exports={createShell,ownerOf,BAR_HEIGHT};
