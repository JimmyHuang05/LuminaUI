const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('webui/app.js','utf8');
const policyCode=source.slice(source.indexOf('function editTaskPolicy('),source.indexOf('function closeEditor('));
const limitCode=source.slice(source.indexOf('function extraReferenceLimit('),source.indexOf('function renderReferences('));
const uploadCode=source.slice(source.indexOf('async function upload('),source.indexOf('// One drop path'));
const guardCode=source.split(/\r?\n/).find(line=>line.startsWith("$('form').addEventListener('submit'"));
const fields={};
for(const id of ['region-state','edit-frame','annotation-mode','local-edit','transparent-output','region-open','edit-task','error','submit','reference','annotation-options','form'])fields[id]={checked:false,value:'',textContent:'',disabled:false};
let mask=false,submitGuard;
fields.form.addEventListener=(event,callback,capture)=>{assert.equal(event,'submit');assert.equal(capture,true);submitGuard=callback;};
fields['edit-frame'].value='original';
const context={mode:'03_image_edit',$:id=>fields[id],document:{getElementById:id=>fields[id]},
  editor:{hasMask:()=>mask,hasAnnotations:()=>false,load:async()=>{mask=false;}},extraReferences:[],window:{},
  closeEditor:()=>{},showUploadedCanvas:()=>{},api:async()=>({image:'webui/new.png',url:'/image'}),
  FormData:class{append(){}},online:true,busy:false,uploading:false};
vm.createContext(context);vm.runInContext(policyCode+limitCode+uploadCode+guardCode,context);
const run=code=>vm.runInContext(code,context);
function task(value){fields['edit-task'].value=value;fields['edit-frame'].value='original';fields['local-edit'].checked=false;fields['annotation-mode'].checked=false;fields['transparent-output'].checked=false;context.extraReferences=[];mask=false;}

(async()=>{
  for(const name of ['face','local']){
    task(name);run('regionChanged()');
    assert.equal(fields['local-edit'].checked,true,`${name}: strict local mode is mandatory`);
    assert.equal(fields['local-edit'].disabled,true);
    assert.equal(fields['edit-frame'].disabled,true);
    await run('upload({})');
    assert.equal(fields['local-edit'].checked,true,`${name}: uploading cannot downgrade to whole-image editing`);
    assert.match(run('editFormError()'),/涂抹/);
    const event={preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
    submitGuard(event);assert.equal(event.prevented,true);assert.equal(event.stopped,true);
    if(name==='face')context.extraReferences=[{image:'ref.png',role:'identity'}];
    mask=true;assert.equal(run('editFormError()'),'');
    fields['edit-frame'].value='outpaint';assert.match(run('editFormError()'),/不支持扩图/);
  }
  task('general');run('regionChanged()');
  assert.equal(fields['local-edit'].checked,false,'general direct editing remains available');
  assert.equal(fields['local-edit'].disabled,false);
  mask=true;run('regionChanged(true)');assert.equal(fields['local-edit'].checked,true);
  for(const name of ['head','body']){
    task(name);mask=true;context.extraReferences=[{image:'ref.png',role:'identity'}];run('regionChanged(true)');
    assert.equal(fields['local-edit'].checked,true);
    assert.equal(fields['local-edit'].disabled,false);assert.equal(fields['region-open'].disabled,false);
    assert.equal(fields['annotation-mode'].disabled,true);assert.equal(run('editFormError()'),'');
  }
  for(const name of ['fusion']){
    task(name);mask=true;run('regionChanged(true)');
    assert.equal(fields['local-edit'].checked,false,`${name}: stored mask must not enable an unsupported route`);
    assert.equal(fields['local-edit'].disabled,true);assert.equal(fields['region-open'].disabled,true);
    assert.equal(fields['annotation-mode'].disabled,true);assert.equal(fields['transparent-output'].disabled,true);
    fields['local-edit'].checked=true;assert.match(run('editFormError()'),/整图直接编辑/);
  }
  for(const name of ['fusion','watermark']){
    task(name);assert.equal(run('extraReferenceLimit()'),0);
    context.extraReferences=[{image:'keep-this.png',role:'identity'}];
    assert.match(run('editFormError()'),/移除额外参考图/);
    assert.equal(context.extraReferences.length,1,'validation never discards user references');
  }
  task('general');fields['edit-frame'].value='outpaint';assert.equal(run('extraReferenceLimit()'),0);
  context.extraReferences=[{image:'keep-this.png',role:'identity'}];assert.match(run('editFormError()'),/移除额外参考图/);
  context.mode='01_text_to_image';task('watermark');context.extraReferences=[{image:'kept.png'}];
  assert.equal(run('editFormError()'),'','edit-specific validation does not leak into other modes');
  assert.equal(run('extraReferenceLimit()'),3);
  context.mode='03_image_edit';task('face');
  const reference={image:'kept.png',role:'identity',crop_rect:[0.1,0.2,0.3,0.4]};context.extraReferences=[reference];
  const facePayload=run('extraReferencePayload()');
  assert.deepEqual(JSON.parse(JSON.stringify(facePayload[0].crop_rect)),reference.crop_rect);
  facePayload[0].crop_rect[0]=0.9;assert.equal(reference.crop_rect[0],0.1,'submitted crop is a detached snapshot');
  fields['edit-task'].value='body';assert.equal(run('canCropExtraReference()'),false);
  assert.equal(run('extraReferencePayload()[0].crop_rect'),undefined,'body swap must never inherit head-only cropping');
  assert.equal(reference.crop_rect[0],0.1,'switching tasks retains the original reference crop for later use');
  console.log('PASS: local/face upload and mask contract, task capabilities, reference restrictions, submit guard and cross-mode isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
