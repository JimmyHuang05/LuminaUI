const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCloseController}=require('./close-controller.cjs');
const prefs=require('./close-preferences.cjs');
function fixture({action='ask',answers=[],activity=0,trayError=false}={}){
  const win=new EventEmitter(),app=new EventEmitter(),dialogs=[],saved=[];
  let dead=false,hidden=false,quit=0,trays=0;
  Object.assign(win,{isDestroyed:()=>dead,isMinimized:()=>false,show:()=>{hidden=false;},focus(){},hide:()=>{hidden=true;},destroy:()=>{dead=true;win.emit('closed');}});
  app.quit=()=>{quit++;app.emit('before-quit',{preventDefault(){throw Error('Unexpected quit interception');}});};
  const control=createCloseController({win,app,read:()=>({closeAction:action}),write:value=>saved.push(value),ensureTray:()=>{if(trayError)throw Error('Tray failed');trays++;},getActivity:async()=>activity,showDialog:async(_win,options)=>{dialogs.push(options);return typeof answers[0]==='function'?answers.shift()():answers.shift()||{response:0};}});
  return {win,app,control,dialogs,saved,state:()=>({dead,hidden,quit,trays})};
}
test('cancel never hides, exits or remembers; default focuses tray',async()=>{const f=fixture({answers:[{response:0,checkboxChecked:true}]});await f.control.request();assert.deepEqual(f.state(),{dead:false,hidden:false,quit:0,trays:0});assert.deepEqual(f.saved,[]);assert.equal(f.dialogs[0].defaultId,2);});
test('tray choice persists and restore keeps window alive',async()=>{const f=fixture({answers:[{response:2,checkboxChecked:true}]});await f.control.request();assert.equal(f.state().hidden,true);assert.deepEqual(f.saved,[{closeAction:'tray'}]);f.control.restore();assert.equal(f.state().hidden,false);});
test('remembered tray skips prompt but explicit exit bypasses preference',async()=>{const f=fixture({action:'tray'});await f.control.request();assert.equal(f.dialogs.length,0);await f.control.request(true);assert.equal(f.state().quit,1);assert.equal(f.state().dead,true);});
test('active tasks cancel exit without saving choice',async()=>{const f=fixture({activity:2,answers:[{response:1,checkboxChecked:true},{response:0}]});await f.control.request();assert.equal(f.state().dead,false);assert.deepEqual(f.saved,[]);assert.match(f.dialogs[1].message,/2/);});
test('remembered exit still confirms active or unknown tasks',async()=>{for(const activity of [1,null]){const f=fixture({action:'exit',activity,answers:[{response:1}]});await f.control.request();assert.equal(f.dialogs.length,1);assert.equal(f.state().quit,1);}});
test('failed tray creation leaves window visible and preference unchanged',async()=>{const f=fixture({trayError:true,answers:[{response:2,checkboxChecked:true}]});await f.control.request();assert.equal(f.state().hidden,false);assert.equal(f.state().dead,false);assert.deepEqual(f.saved,[]);assert.equal(f.dialogs.at(-1).type,'error');});
test('repeated close events share one pending dialog',async()=>{let resolve;const f=fixture({answers:[()=>new Promise(r=>resolve=r)]});const first=f.control.request(),second=f.control.request();assert.equal(first,second);assert.equal(f.dialogs.length,1);resolve({response:0});await first;});
test('window close and application quit are both intercepted',async()=>{const f=fixture();let prevented=0;f.win.emit('close',{preventDefault(){prevented++;}});await f.control.request();f.app.emit('before-quit',{preventDefault(){prevented++;}});await f.control.request();assert.equal(prevented,2);assert.equal(f.state().quit,1);});
test('preferences survive reload and invalid values cannot overwrite them',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lumina-close-')),file=path.join(dir,'settings.json');try{assert.equal(prefs.read(file).closeAction,'ask');prefs.write(file,{closeAction:'tray'});assert.equal(prefs.read(file).closeAction,'tray');assert.throws(()=>prefs.write(file,{closeAction:'invalid'}));assert.equal(prefs.read(file).closeAction,'tray');fs.writeFileSync(file,'broken');assert.equal(prefs.read(file).closeAction,'ask');}finally{fs.rmSync(dir,{recursive:true,force:true});}});
