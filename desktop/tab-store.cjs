const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
function newTab(index=1){return {id:randomUUID(),name:'画布 '+index};}
function normalize(data){
  const seen=new Set();
  const tabs=(Array.isArray(data?.tabs)?data.tabs:[]).filter(t=>t&&typeof t.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(t.id)&&!seen.has(t.id)&&seen.add(t.id)).slice(0,64).map((t,i)=>({id:t.id,name:typeof t.name==='string'&&t.name.trim()?t.name.trim().slice(0,60):'画布 '+(i+1)}));
  if(!tabs.length)tabs.push(newTab());
  return {version:1,tabs,active:tabs.some(t=>t.id===data?.active)?data.active:tabs[0].id};
}
function read(file){try{return normalize(JSON.parse(fs.readFileSync(file,'utf8')));}catch{return normalize(null);}}
function write(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(normalize(data),null,2),'utf8');fs.renameSync(temp,file);}
module.exports={newTab,normalize,read,write};
