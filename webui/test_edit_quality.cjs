const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('webui/app.js','utf8');
const fields=new Proxy({}, {get(target,key){return target[key]??=( {value:'',checked:false,hidden:false,oninput(){},dispatchEvent(){}} );}});
const context={mode:'03_image_edit',$:id=>fields[id],document:{getElementById:id=>fields[id]},updateQuality(){},
  jobs:[],selected:'history',change(id){context.mode=id;},select(){},renderReferences(){},renderImageReferences(){},
  window:{dispatchEvent(){}},Event:class{},CustomEvent:class{}};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function applyQualitySteps('),source.indexOf('function updateQuality(')),context);
fields['edit-model'].value='ray';fields.quality.value='pro_plus';fields['generation-cfg'].value=2.7;
fields['generation-sampler'].value='dpmpp_2m';fields['generation-scheduler'].value='karras';
vm.runInContext('applyQualitySteps()',context);assert.equal(fields['generation-steps'].value,40);
fields.quality.value='pro';vm.runInContext('applyQualitySteps()',context);assert.equal(fields['generation-steps'].value,25);
fields['edit-model'].value='qwen';vm.runInContext('applyQualitySteps()',context);assert.equal(fields['generation-steps'].value,30);
assert.equal(fields['generation-cfg'].value,2.7);assert.equal(fields['generation-sampler'].value,'dpmpp_2m');assert.equal(fields['generation-scheduler'].value,'karras');
context.mode='01_text_to_image';fields['generation-steps'].value=9;fields.quality.value='pro_plus';
vm.runInContext('applyQualitySteps()',context);assert.equal(fields['generation-steps'].value,9,'edit quality never overrides text-model sampling');
const reuseCode=source.split(/\r?\n/).find(line=>line.startsWith("$('reuse').onclick="));
vm.runInContext(reuseCode,context);
context.jobs=[{prompt_id:'history',preset:'03_image_edit',edit_model:'ray',edit_task:'head',quality:'pro_plus',steps:37,cfg:2.4,
  sampler_name:'dpmpp_2m',scheduler:'karras',prompt:'Stored requirements',references:[{image:'reference.png',role:'identity',crop_rect:[.1,.2,.3,.4]}]}];
(async()=>{
  await fields.reuse.onclick();
  assert.equal(fields['generation-steps'].value,37,'reuse restores recorded steps, not the quality preset');
  assert.equal(fields['generation-cfg'].value,2.4);assert.equal(fields['generation-sampler'].value,'dpmpp_2m');assert.equal(fields['generation-scheduler'].value,'karras');
  assert.deepEqual(JSON.parse(JSON.stringify(context.extraReferences[0].crop_rect)),[.1,.2,.3,.4]);
  console.log('PASS: quality adjusts actual step count only; history restores exact sampling and reference crop');
})().catch(error=>{console.error(error);process.exitCode=1;});
