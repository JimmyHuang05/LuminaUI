/* Workflow-specific controls. Schema is shared with backend validation. */
(() => {
  const $ = id => document.getElementById(id);
  const basicIds = ['generation-steps','generation-cfg','generation-sampler','generation-scheduler','krea-simple-mode','refine-scale','refine-strength','redraw-creativity','ratio','image-resolution'];
  const states = new Map();
  let schema, activeKey = '', rendering = false, transitioning = false;
  const controls = new Map();
  const basic = document.createElement('div'); basic.className='workflow-output-controls';
  document.querySelector('.output-settings-grid').append(basic);
  const advanced = document.createElement('section'); advanced.className='output-settings workflow-parameters';advanced.setAttribute('aria-label','工作流参数');
  advanced.innerHTML='<div class="output-heading">工作流参数</div><div class="workflow-stage-controls"></div>';
  const sampling = document.querySelector('.sampling-fields');
  const resetButton=sampling.querySelector('button.secondary'), originalReset=resetButton.onclick;
  const stage = advanced.querySelector('.workflow-stage-controls');
  const style = document.createElement('style');
  style.textContent='.workflow-output-controls{grid-column:1/-1}.workflow-output-controls:empty{display:none}.workflow-stage-controls:empty{display:none}.workflow-control-check{display:flex;align-items:center;gap:9px}.workflow-control-check input{width:16px!important;min-height:16px!important}.workflow-stage-controls .field{margin:14px 0}.workflow-output-controls .field{margin:14px 0 0}';

  style.textContent+=`.simple-panel #simple-advanced:has(>.workflow-parameters:not([hidden])){padding:0!important;border:0!important;border-radius:0!important;background:transparent;margin:0 0 20px!important}.workflow-parameters.output-settings{margin:0;padding:14px;border:1px solid var(--day-line,#353535);border-radius:8px;background:var(--day-canvas,#1b1b1b)}.workflow-parameters>.sampling-fields{margin-top:0}.workflow-parameters>.workflow-stage-controls:not(:empty){margin-top:14px;padding-top:2px;border-top:1px solid var(--day-line,#303030)}`;
  document.head.append(style);

  function context() {
    const model=$('generation-model').value;
    const profile=['qwen','ray'].includes(model)?model:model==='pro_mix'?'moody_zit_simple':$('generation-workflow').value;
    return {model,profile,key:model+':'+profile};
  }
  function defaults(model, profile) {
    const p=schema.models[model], values={};
    for(const key of schema.profiles[profile].fields) values[key]=schema.profiles[profile].defaults?.[key]??schema.fields[key].default;
    return {values,basic:{'generation-steps':p.steps,'generation-cfg':p.cfg,'generation-sampler':p.sampler,'generation-scheduler':p.scheduler,'krea-simple-mode':p.simple_mode||'standard','refine-scale':1.5,'refine-strength':p.refine_strength||.33,'redraw-creativity':49,'ratio':'3:4','image-resolution':'medium'}};
  }
  function snapshot() {
    if(!['01_text_to_image','02_character_consistency'].includes(mode)||context().key!==activeKey)return;
    const state=states.get(activeKey); if(!state)return;
    for(const id of basicIds)state.basic[id]=$(id).value;
    for(const [key,{input}] of controls)state.values[key]=input.type==='checkbox'?input.checked:Number(input.value);
  }
  function apply(state) {
    for(const [id,value] of Object.entries(state.basic))$(id).value=value;
    // Existing layout handlers remain responsible for reference slots and custom selects.
    for(const id of ['krea-simple-mode','ratio','image-resolution','generation-sampler','generation-scheduler','redraw-creativity'])
      $(id).dispatchEvent(new Event(id==='redraw-creativity'?'input':'change',{bubbles:true}));
  }
  function makeControls(profile,state) {
    basic.replaceChildren();stage.replaceChildren();controls.clear();
    for(const key of schema.profiles[profile].fields){
      const f=schema.fields[key],row=document.createElement('div');row.className='field';
      const label=document.createElement('label');label.htmlFor='workflow-'+key;label.textContent=f.label;
      const input=document.createElement(f.choices?'select':'input');input.id=label.htmlFor;
      if(f.choices)for(const value of f.choices)input.append(new Option(String(value)+(key==='upscale_factor'?'×':' px'),String(value)));
      else if(f.type==='boolean'){input.type='checkbox';input.checked=state.values[key];}
      else {input.type='number';input.min=f.min;input.max=f.max;input.step=f.step;}
      if(f.type!=='boolean')input.value=state.values[key];
      const help=document.createElement('p');help.className='help';help.textContent=f.help;
      if(f.type==='boolean'){label.className='workflow-control-check';label.prepend(input);row.append(label,help);}else row.append(label,input,help);
      (f.basic?basic:stage).append(row);controls.set(key,{input,row});
      input.addEventListener('change',()=>{snapshot();sync();});
      input.addEventListener('input',()=>{snapshot();sync();});
      if(f.choices)window.dispatchEvent(new CustomEvent('creative-select-added',{detail:input}));
    }
  }
  function sync() {
    if(!schema||rendering)return;
    rendering=true;
    try {
      const visible=['01_text_to_image','02_character_consistency'].includes(mode);basic.hidden=!visible;advanced.hidden=!visible;
      if(!visible){activeKey='';$('generation-steps').closest('.field').hidden=false;$('generation-steps').min=1;$('generation-steps').closest('.field').querySelector('.help').textContent='更多步数会增加耗时，但不一定更好。';resetButton.onclick=originalReset;resetButton.textContent='恢复当前模型推荐设置';return;}
      const c=context();
      if(c.key!==activeKey){
        activeKey=c.key;
        if(!states.has(c.key))states.set(c.key,defaults(c.model,c.profile));
        const state=states.get(c.key);apply(state);makeControls(c.profile,state);
      }
      // Show generation parameters in a permanent card; edit mode retains its own layout.
      const parent=$('simple-advanced');if(advanced.parentElement!==parent)parent.append(advanced);if(sampling.parentElement!==advanced)advanced.insertBefore(sampling,stage);
      parent.querySelector('.advanced-heading').hidden=true;
      const intro=parent.querySelector(':scope > p.help');if(intro)intro.hidden=true;
      const photo=c.profile==='moody_krea2_i2i_4khd',hd=c.profile.includes('4khd'),simple=c.profile==='moody_krea2_simple';
      const process=$('krea-simple-mode').value, settings=states.get(c.key).values;
      $('character-card-field').hidden=mode!=='01_text_to_image'||c.model==='ray';$('image-references-field').hidden=c.model==='ray';
      const nativeRedraw=c.model==='pro_mix'&&(imageReferences.length||$('character-card').value);
      $('ratio-field').hidden=photo||!!nativeRedraw;
      $('generation-steps').closest('.field').hidden=photo;
      $('generation-steps').disabled=photo;
      $('generation-steps').min=c.model==='pro_mix'?4:1;
      $('generation-steps').closest('.field').querySelector('.help').textContent=c.model==='pro_mix'?'双阶段按此采样计划截取区间。':'基础生成步数；后续细化和修脸单独设置。';
      if(photo)$('generation-steps').value=Number($('redraw-creativity').value)<=50?7:9;
      document.querySelector('.refine-controls').hidden=!simple||process==='standard';
      for(const [key,{row,input}] of controls){
        row.hidden=key==='character_strength'&&!$('character-card').value||key==='refine_steps'&&process==='standard'||key==='upscale_factor'&&process!=='upscale'||['face_steps','face_strength'].includes(key)&&!settings.face_enabled;input.disabled=row.hidden;
      }
      $('krea-simple-mode').options[0].textContent='快速生成';
      $('krea-simple-mode').options[2].textContent='细化并放大';
      if(hd)$('generation-workflow-help').textContent=photo?'上传原图后自动识图，保留构图与氛围；人物卡可选。':'分块细化与高清输出；人物卡和参考图可选。';
      $('sampling-recommendation').textContent=schema.profiles[c.profile].label+' · '+(photo?'重绘步数随变化程度自动选择；下方参数作用于基础重绘。':'采样参数作用于基础生成，后续步骤独立设置。');
      const help=$('resolution-help');help.hidden=false;
      help.textContent=hd?'这里选择基础尺寸；最终输出长边由下方控制。':nativeRedraw?'基础尺寸跟随原图比例，最终按细化倍率输出。':simple&&process==='upscale'?'这里选择基础尺寸；最终输出为基础尺寸的 '+settings.upscale_factor+' 倍。':simple&&process==='refine'?'最终尺寸为基础尺寸的 '+$('refine-scale').value+' 倍。':c.model==='pro_mix'?'最终尺寸约为基础尺寸的 '+settings.zit_scale+' 倍。':'';
      if(simple)$('krea-simple-help').textContent=process==='standard'?'':process==='refine'?'潜空间放大后补充细节。':'细化后使用 SeedVR2 放大。';
      const reset=sampling.querySelector('button.secondary');
      reset.textContent='恢复当前工作流默认设置';
      reset.onclick=()=>{const old=states.get(activeKey),state=defaults(c.model,c.profile);for(const id of ['ratio','image-resolution'])state.basic[id]=old.basic[id];states.set(activeKey,state);rendering=true;apply(state);makeControls(c.profile,state);rendering=false;sync();};
    } finally {rendering=false;}
  }
  const schedule=()=>queueMicrotask(()=>{sync();transitioning=false;});
  $('form').addEventListener('change',e=>{if(['generation-model','generation-workflow'].includes(e.target.id))transitioning=true;},true);
  $('form').addEventListener('input',e=>{if(!transitioning&&!rendering&&basicIds.includes(e.target.id)){snapshot();schedule();}});
  $('form').addEventListener('change',e=>{if(!transitioning&&!rendering&&basicIds.includes(e.target.id))snapshot();schedule();});
  for(const name of ['creative-mode-change','generation-references-changed'])window.addEventListener(name,schedule);
  window.workflowControls={describe(settings){return Object.entries(settings||{}).filter(([key])=>schema?.fields[key]).map(([key,value])=>schema.fields[key].label+'：'+(typeof value==='boolean'?(value?'开启':'关闭'):value)).join('\n');},payload(){sync();snapshot();return ['01_text_to_image','02_character_consistency'].includes(mode)?Object.fromEntries([...controls].filter(([,c])=>!c.input.disabled).map(([key])=>[key,states.get(activeKey).values[key]])):{};},restore(job){
    if(!schema||!['01_text_to_image','02_character_consistency'].includes(job.preset))return;
    const c=context(),state=defaults(c.model,c.profile);
    const mapping={'generation-steps':'steps','generation-cfg':'cfg','generation-sampler':'sampler_name','generation-scheduler':'scheduler','krea-simple-mode':'krea_simple_mode','refine-scale':'refine_scale','refine-strength':'refine_strength','redraw-creativity':'redraw_creativity','ratio':'ratio','image-resolution':'image_resolution'};
    for(const [id,key] of Object.entries(mapping))if(job[key]!==undefined&&job[key]!==null)state.basic[id]=job[key];
    for(const key of schema.profiles[c.profile].fields)if(job.workflow_settings?.[key]!==undefined)state.values[key]=job.workflow_settings[key];
    states.set(c.key,state);activeKey='';sync();
  }};
  window.addEventListener('DOMContentLoaded',()=>{const reuse=$('reuse').onclick;
    $('reuse').onclick=async()=>{const job=jobs.find(j=>j.prompt_id===selected);await reuse();if(job)window.workflowControls.restore(job);};
  });
  api('/api/config').then(config=>{schema=config.workflow_controls;if(schema)sync();}).catch(e=>console.error('工作流参数加载失败',e));
  window.addEventListener('focus',()=>{api('/api/config').then(config=>{schema=config.workflow_controls;}).catch(()=>{});});
})();
