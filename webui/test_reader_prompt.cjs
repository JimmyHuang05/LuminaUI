const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('webui/image-reader.html','utf8');
const source=html.slice(html.indexOf('let promptDraft=null'),html.indexOf("config().catch(e=>notice(e.message,true));"));
async function scenario(failUpdate=false){
 const nodes=new Map(),calls=[],store=new Map();let fail=failUpdate;
 const $=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:false,textContent:'',setAttribute(){},removeAttribute(){},focus(){}});return nodes.get(id);};
 class FormData {append(){}}
 const context={$,result:'A red circle and a blue square on a white background.',selected:{},pending:false,token:'test',crypto:require('node:crypto').webcrypto,Uint8Array,FormData,location:{origin:'http://test'},document:{body:{classList:{add(){},remove(){}}}},window:{addEventListener(){}},sessionStorage:{setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},notice(){},config:async()=>{},fetch:async(path,options)=>{const body=options.body instanceof FormData?null:JSON.parse(options.body);calls.push(body?.task||'cover');if(body?.task==='update'&&fail){fail=false;return {ok:false,json:async()=>({error:'test metadata failure'})};}return {ok:true,json:async()=>body?.task==='format'?{prompt:'[Subject Description]\nA red circle and a blue square.'}:body?.task==='update'?{title:'白底红圆蓝方图案',card_summary:'白底上的红圆与蓝方',module_summaries:{},content_rating:{level:'sfw'}}:{cover_id:'a'.repeat(32)}};}};
 vm.createContext(context);vm.runInContext(source,context);await $('organize').onclick();
 if(failUpdate){assert.equal(store.size,0);assert.equal(context.result,'A red circle and a blue square on a white background.');await $('organize').onclick();assert.deepEqual(calls,['format','update','update','cover']);}else assert.deepEqual(calls,['format','update','cover']);
 const draft=JSON.parse([...store.values()][0]);assert.equal(draft.cover_id,'a'.repeat(32));assert.equal(draft.title,'白底红圆蓝方图案');assert.equal($('prompt-review').hidden,false);assert.equal($('organize').disabled,false);
 await $('organize').onclick();assert.equal(calls.length,failUpdate?4:3);assert(!calls.includes('save'));
}
(async()=>{await scenario();await scenario(true);console.log('PASS: format/update/cover ordering; failure retains description; retry resumes; review opens without library save; cached reopen.');})();
