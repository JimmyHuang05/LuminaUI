function normalize(options={}){
  const buttons=Array.isArray(options.buttons)&&options.buttons.length?options.buttons.slice(0,4).map(String):['知道了'];
  const index=(value,fallback)=>Number.isInteger(value)&&value>=0&&value<buttons.length?value:fallback;
  return {type:['info','question','warning','error','success'].includes(options.type)?options.type:'info',
    message:String(options.message||'提示'),detail:String(options.detail||''),
    buttons,cancelId:index(options.cancelId,0),defaultId:index(options.defaultId,0),
    primaryId:index(options.primaryId,buttons.length-1),danger:!!options.danger,
    checkboxLabel:String(options.checkboxLabel||''),checkboxChecked:options.checkboxChecked===true,
    size:['small','medium','large'].includes(options.size)?options.size:'medium'};
}
module.exports={normalize};
