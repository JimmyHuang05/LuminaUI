const fs=require('node:fs');
const path=require('node:path');
const actions=['ask','tray','exit'];
function read(file){
  try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return {closeAction:actions.includes(value.closeAction)?value.closeAction:'ask'};}
  catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return {closeAction:'ask'};throw error;}
}
function write(file,value){
  if(!value||!actions.includes(value.closeAction))throw Error('请选择有效的关闭行为');
  const result={closeAction:value.closeAction};
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(result,null,2));fs.renameSync(temp,file);
  return result;
}
module.exports={read,write};
