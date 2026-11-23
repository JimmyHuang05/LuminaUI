const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {classify,watchSources}=require('./live-reload.cjs');
test('source classification excludes data and tests',()=>{
 assert.equal(classify('webui','home.css'),'css');assert.equal(classify('webui','home.js'),'page');assert.equal(classify('webui','server.py'),'backend');assert.equal(classify('desktop','titlebar.js'),'titlebar');assert.equal(classify('desktop','preload.cjs'),'desktop');assert.equal(classify('webui','jobs.json'),null);assert.equal(classify('desktop','backend.test.cjs'),null);
});
test('coalesces saves, handles atomic replacement and ignores unchanged contents',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lumina-watch-'));
 for(const dir of ['webui','desktop'])fs.mkdirSync(path.join(root,dir));
 const file=path.join(root,'webui/home.css');fs.writeFileSync(file,'first');
 const batches=[];let finish;
 const received=new Promise(resolve=>finish=resolve);
 const stop=watchSources({root,delay:40,onChanges:changes=>{batches.push(changes);finish();}});
 try{
 fs.writeFileSync(file,'second');fs.writeFileSync(path.join(root,'webui/save.tmp'),'third');fs.renameSync(path.join(root,'webui/save.tmp'),file);
 await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error('watch timeout')),2500).unref())]);
 assert.deepEqual(batches[0],[{area:'webui',name:'home.css',action:'css'}]);
 fs.writeFileSync(file,'third');fs.writeFileSync(path.join(root,'webui/jobs.json'),'[]');
 await new Promise(r=>setTimeout(r,160));assert.equal(batches.length,1);
 }finally{stop();fs.rmSync(root,{recursive:true,force:true});}
});
