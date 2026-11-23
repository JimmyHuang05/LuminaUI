(() => {
  const generationLoRAsEnabled=false;
  if(!generationLoRAsEnabled){window.generationLoRAs={payload:async()=>({}),restore(){},reload(){}};return;}
  const kindNames={character:'人物',style:'风格',clothing:'服装',detail:'细节',slider:'调节滑块',other:'其他'};
  const modelNames={cutie:'Krea2 · Moody Cutie',mix_v8:'Krea2 · Moody Mix',qwen:'Qwen · Image 2.1',ray:'Qwen · Ray Image 2.1'};
  const modeNames={'01_text_to_image':'文生图','02_character_consistency':'图生图'};
  let catalog=[],profiles={},rows=[],scope='',ready=false,validationVersion=0,validationTimer,persistChain=Promise.resolve();
  let acknowledgedSignature='',lastResult={errors:[],warnings:[]};
  const panel=document.createElement('section');panel.id='generation-loras';panel.className='generation-loras';panel.setAttribute('aria-label','LoRA 挂载');
  panel.innerHTML='<div class="lora-heading"><span class="step-label lora-step" data-step="2">LoRA（可选）</span><button type="button" class="secondary lora-add">＋ 添加 LoRA</button></div><div class="lora-rows"></div><div class="lora-check" role="status"></div>';
  document.getElementById('simple-advanced').append(panel);
  const stepLabel=panel.querySelector('.lora-step'),list=panel.querySelector('.lora-rows'),messages=panel.querySelector('.lora-check');
  const clone=value=>JSON.parse(JSON.stringify(value));
  const key=()=>mode+'/'+(mode==='02_character_consistency'?'qwen':document.getElementById('generation-model').value);
  const info=id=>catalog.find(f=>f.id===id);
  function compatible(file,model=scope.split('/')[1],preset=scope.split('/')[0]){
    const p=file.lora,family=file.inspection.family||p.family,current=['cutie','mix_v8'].includes(model)?'krea2':'qwen';
    return file.inspection.error||(!file.installed?'文件未安装':'')||(p.usage!=='generation'?'专用工作流扩展':'')||(family&&family!==current?'模型系列不兼容':'')||(p.models.length&&!p.models.includes(model)?'主模型版本不适用':'')||(!p.modes.includes(preset)?'当前模式不适用':'');
  }
  function signature(values=rows,preset=scope.split('/')[0],model=scope.split('/')[1],warnings=lastResult.warnings){return JSON.stringify([preset,model,values,warnings.map(w=>w.code)]);}
  function save(){if(!scope||!ready)return;profiles[scope]=clone(rows);const [preset,model]=scope.split('/'),items=clone(rows);persistChain=persistChain.catch(()=>{}).then(()=>api('/api/loras/profiles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:preset,model,items})})).catch(e=>{messages.textContent='配置未保存：'+e.message;});}
  function changed(render=true){acknowledgedSignature='';save();if(render)renderRows();scheduleValidation();}
  function add(file){const existing=rows.find(r=>r.id===file.id);if(existing){existing.enabled=true;}else rows.push({id:file.id,enabled:true,strength:file.lora.default_strength,clip_strength:file.inspection.has_clip?file.lora.default_strength:null,use_trigger:!!file.lora.triggers,sha256:'',preset_id:'',preset_hash:''});changed();}
  function button(text,action){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=text;b.onclick=action;return b;}
  function renderRows(){
    list.replaceChildren();
    for(const row of rows){
      const file=info(row.id),card=document.createElement('section');card.className='lora-row';
      const header=document.createElement('div');header.className='lora-row-heading';
      const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=row.enabled;enabled.setAttribute('aria-label','启用 '+(file?.label||row.id));enabled.onchange=()=>{row.enabled=enabled.checked;changed();};
      const name=document.createElement('b');name.textContent=file?.label||row.id;name.title=name.textContent;
      const menu=document.createElement('details');menu.className='lora-card-menu';const toggle=document.createElement('summary');toggle.textContent='⋯';toggle.setAttribute('aria-label',(file?.label||row.id)+' 更多操作');const actions=document.createElement('div');actions.className='lora-card-actions';menu.append(toggle,actions);header.append(enabled,name,menu);card.append(header);
      const menuButton=(text,action)=>button(text,()=>{menu.open=false;action();});
      actions.append(menuButton('移除挂载',()=>{rows=rows.filter(r=>r!==row);changed();}));
      const p=file?.lora;
      if(!p){const missing=document.createElement('p');missing.className='lora-issue';missing.textContent='文件缺失，请移除或恢复文件。';card.append(missing);list.append(card);continue;}
      const reason=compatible(file);if(reason){const warning=document.createElement('p');warning.className='lora-issue';warning.textContent=reason;card.append(warning);}
      const strength=document.createElement('div');strength.className='lora-strength';const slider=document.createElement('input');slider.type='range';slider.min=p.min_strength;slider.max=p.max_strength;slider.step=p.step;slider.value=row.strength;slider.disabled=!row.enabled||!!reason;slider.setAttribute('aria-label',file.label+' 强度');
      const number=document.createElement('input');number.type='number';number.min=p.min_strength;number.max=p.max_strength;number.step='any';number.value=row.strength;number.disabled=slider.disabled;number.setAttribute('aria-label',file.label+' 强度数值');
      slider.oninput=()=>{row.strength=Number(slider.value);number.value=row.strength;changed(false);};
      number.oninput=()=>{if(Number.isFinite(number.valueAsNumber)){row.strength=number.valueAsNumber;slider.value=row.strength;changed(false);}};
      number.onchange=()=>{if(!Number.isFinite(number.valueAsNumber))number.value=row.strength;};
      strength.append(slider,number);card.append(strength);
      if(p.presets_enabled){const field=document.createElement('div');field.className='lora-preset';const label=document.createElement('span');label.textContent='预设';const selected=(p.presets||[]).find(item=>item.id===row.preset_id);const choice=button(selected?.name||(row.preset_id?'预设已移除':p.presets?.length?'不使用预设':'尚无预设'),()=>presetPicker(row,file));choice.classList.add('lora-preset-choice');choice.setAttribute('aria-label',file.label+' 预设');choice.setAttribute('aria-haspopup','dialog');choice.disabled=!row.enabled||!!reason||!p.presets?.length&&!row.preset_id;field.append(label,choice);card.append(field);}
      actions.prepend(menuButton('编辑信息',()=>editInfo(file)),menuButton('恢复默认强度',()=>{row.strength=p.default_strength;if(row.clip_strength!==null)row.clip_strength=p.default_strength;changed();}));
      if(p.triggers){const trigger=document.createElement('label');trigger.className='lora-trigger';const cb=document.createElement('input');cb.type='checkbox';cb.checked=row.use_trigger;cb.onchange=()=>{row.use_trigger=cb.checked;changed(false);};const text=document.createElement('span');text.textContent='附加触发词：'+p.triggers;trigger.append(cb,text);actions.append(trigger);}
      if(file.inspection.has_clip){const advanced=document.createElement('label');advanced.className='lora-trigger';advanced.append('文本编码器强度 ');const clip=document.createElement('input');clip.type='number';clip.min=p.min_strength;clip.max=p.max_strength;clip.step='any';clip.value=row.clip_strength??p.default_strength;clip.disabled=!row.enabled||!!reason;clip.oninput=()=>{if(Number.isFinite(clip.valueAsNumber)){row.clip_strength=clip.valueAsNumber;changed(false);}};clip.onchange=()=>{if(!Number.isFinite(clip.valueAsNumber))clip.value=row.clip_strength??p.default_strength;};advanced.append(clip);actions.append(advanced);}
      if(file.source){const a=document.createElement('a');a.textContent='查看来源';a.href=file.source;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);}list.append(card);
    }
  }
  function showValidation(result){
    lastResult=result;messages.replaceChildren();
    if(acknowledgedSignature&&acknowledgedSignature!==signature())acknowledgedSignature='';
    for(const issue of [...result.errors,...result.warnings.filter(w=>!w.code.startsWith('unverified:'))]){
      const line=document.createElement('div');line.className='lora-message';const text=document.createElement('p');text.textContent=issue.message;line.append(text);
      for(const id of issue.ids){const row=rows.find(r=>r.id===id),file=info(id);if(row?.enabled)line.append(button('关闭 '+(file?.label||id),()=>{row.enabled=false;changed();}));else if(issue.code.startsWith('dependency:')&&file&&!compatible(file))line.append(button('添加依赖 '+file.label,()=>add(file)));}
      if(issue.code.startsWith('preset:')){const row=rows.find(r=>r.id===issue.ids[0]);if(row)line.append(button('不使用预设',()=>{row.preset_id='';row.preset_hash='';changed();}));}
      messages.append(line);
    }
  }
  async function validateCurrent(){
    const version=++validationVersion;const values=clone(rows),[preset,model]=scope.split('/'),prompt=document.getElementById('prompt').value;
    const result=await api('/api/loras/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:values,mode:preset,model,prompt})});
    if(version===validationVersion&&scope===preset+'/'+model)showValidation(result);return {result,values,preset,model,prompt};
  }
  function scheduleValidation(){clearTimeout(validationTimer);validationVersion++;if(panel.hidden||!ready)return;validationTimer=setTimeout(()=>validateCurrent().catch(e=>messages.textContent=e.message),180);}
  function sync(){
    panel.hidden=!Object.hasOwn(modeNames,mode);if(panel.hidden)return;
    stepLabel.classList.remove('step-label');stepLabel.removeAttribute('data-step');
    const next=key();if(next!==scope){if(scope&&ready)profiles[scope]=clone(rows);scope=next;rows=clone(profiles[scope]||[]);acknowledgedSignature='';renderRows();}
    scheduleValidation();
  }
  async function reload(){const data=await api('/api/loras');catalog=data.items;renderRows();scheduleValidation();window.dispatchEvent(new Event('lora-library-updated'));}
  function picker(){
    const dialog=document.createElement('dialog');dialog.className='lora-dialog';dialog.innerHTML='<header><h3>添加 LoRA</h3><button type="button" class="secondary">关闭</button></header><input type="search" placeholder="搜索名称或说明…" aria-label="搜索 LoRA"><label class="lora-show-all"><input type="checkbox">显示全部</label><div class="lora-picker-list"></div>';
    const search=dialog.querySelector('[type=search]'),all=dialog.querySelector('[type=checkbox]'),host=dialog.querySelector('.lora-picker-list');
    const draw=()=>{host.replaceChildren();for(const file of catalog){const reason=compatible(file);if((reason&&!all.checked)||!(file.label+' '+file.name+' '+file.lora.notes).toLowerCase().includes(search.value.toLowerCase()))continue;const item=document.createElement('div');item.className='lora-picker-item';const text=document.createElement('div');const title=document.createElement('b');title.textContent=file.label;const note=document.createElement('small');note.textContent=reason||((file.lora.family||'系列未知')+' · '+(kindNames[file.lora.kind]||'其他')+' · '+(file.lora.verification==='verified'?'有验证记录':'待验证'));text.append(title,note);const added=rows.some(r=>r.id===file.id);const addButton=button(added?'已添加':'添加',()=>{add(file);draw();});addButton.disabled=!!reason||added;item.append(text,addButton);host.append(item);}if(!host.children.length)host.textContent='暂无适用 LoRA，可在模型库补充兼容资料。';};
    search.oninput=all.onchange=draw;dialog.querySelector('header button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);draw();dialog.showModal();search.focus();
  }
  function presetPicker(row,file){
    const dialog=document.createElement('dialog');dialog.className='lora-dialog lora-preset-dialog';dialog.innerHTML='<header><h3>选择预设</h3><button type="button" class="secondary">关闭</button></header><input type="search" placeholder="搜索预设…" aria-label="搜索预设"><div class="lora-preset-list" role="listbox" aria-label="预设列表"></div>';
    const search=dialog.querySelector('input'),host=dialog.querySelector('.lora-preset-list');
    const draw=()=>{host.replaceChildren();for(const preset of [{id:'',name:'不使用预设',prompt:''},...(file.lora.presets||[])]){if(preset.id&&!(preset.name+' '+preset.prompt).toLowerCase().includes(search.value.toLowerCase()))continue;const item=button('',()=>{row.preset_id=preset.id;row.preset_hash='';changed();dialog.close();});item.setAttribute('role','option');item.setAttribute('aria-selected',String((row.preset_id||'')===preset.id));const name=document.createElement('b');name.textContent=preset.name;item.append(name);if(preset.prompt){const words=document.createElement('small');words.textContent=preset.prompt;item.append(words);}host.append(item);}};
    search.oninput=draw;dialog.querySelector('header button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);draw();dialog.showModal();search.focus();
  }
  panel.querySelector('.lora-add').onclick=picker;
  document.addEventListener('pointerdown',event=>{panel.querySelectorAll('.lora-card-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false;});});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')panel.querySelectorAll('.lora-card-menu[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary').focus();});});
  function confirmWarnings(warnings){return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='lora-dialog';dialog.innerHTML='<header><h3>LoRA 兼容提示</h3></header><div class="lora-submit-warnings"></div><footer class="lora-confirm-actions"></footer>';const host=dialog.querySelector('.lora-submit-warnings');for(const warning of warnings){const text=document.createElement('p');text.textContent=warning.message;host.append(text);}let accepted=false;dialog.querySelector('footer').append(button('取消',()=>dialog.close()),button('继续生成',()=>{accepted=true;dialog.close();}));dialog.onclose=()=>{dialog.remove();resolve(accepted);};document.body.append(dialog);dialog.showModal();});}
  document.getElementById('generation-model').addEventListener('change',sync);window.addEventListener('creative-mode-change',sync);document.getElementById('prompt').addEventListener('input',scheduleValidation);
  window.generationLoRAs={
    async payload(preset,model,prompt){if(!Object.hasOwn(modeNames,preset))return {};if(!ready)throw Error('LoRA 配置正在读取，请稍候');sync();const values=clone(rows);const result=await api('/api/loras/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:values,mode:preset,model,prompt})});showValidation(result);if(result.errors.length){panel.scrollIntoView({block:'nearest'});throw Error(result.errors[0].message);}const checked=signature(values,preset,model,result.warnings);if(result.warnings.length&&acknowledgedSignature!==checked){if(!await confirmWarnings(result.warnings))throw Error('已取消生成');acknowledgedSignature=checked;}return {loras:values,lora_acknowledged:result.warnings.map(w=>w.code)};},
    restore(job){if(!Object.hasOwn(modeNames,job.preset))return;scope=job.preset+'/'+(job.preset==='02_character_consistency'?'qwen':job.generation_model||'cutie');rows=clone(job.lora_config||job.loras||[]);const snapshots=new Map((job.loras||[]).map(r=>[r.id,r]));rows.forEach(r=>{if(snapshots.has(r.id)){const snapshot=snapshots.get(r.id);r.sha256=snapshot.sha256;r.preset_id=snapshot.preset?.id||'';r.preset_hash=snapshot.preset_hash||'';}});changed();},
    reload
  };
  window.openLoRAInfo=async file=>{if(!ready)await reload();const found=info(file.id);if(found)editInfo(found);};
  Promise.all([api('/api/loras'),api('/api/loras/profiles')]).then(([data,saved])=>{catalog=data.items;profiles=saved;ready=true;sync();}).catch(e=>{messages.textContent='LoRA 管理器读取失败：'+e.message;});

  function editInfo(file){
    const p=clone(file.lora),dialog=document.createElement('dialog');dialog.className='lora-dialog lora-info';
    dialog.innerHTML='<form><header><h3>编辑 LoRA 信息</h3><button type="button" class="secondary lora-close">关闭</button></header><div class="lora-info-body"></div><p class="lora-info-error" role="status"></p><footer><button type="submit" class="secondary">保存</button></footer></form>';
    const host=dialog.querySelector('.lora-info-body'),controls={};
    const field=(label,name,value,type='text')=>{const row=document.createElement('label');row.className='lora-info-field';row.append(label);const input=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value??'';input.name=name;row.append(input);host.append(row);controls[name]=input;return input;};
    field('原始文件名','filename',file.name).readOnly=true;field('备注名称','label',file.label).maxLength=100;field('来源链接','source',file.source||'','url');
    const presetGroup=document.createElement('fieldset');presetGroup.className='lora-preset-editor';const presetLegend=document.createElement('legend');presetLegend.textContent='预设';presetGroup.append(presetLegend);const presetToggle=document.createElement('input');presetToggle.type='checkbox';presetToggle.checked=!!p.presets_enabled;const presetToggleLabel=document.createElement('label');presetToggleLabel.append(presetToggle,'启用预设选择');presetGroup.append(presetToggleLabel);const presetHelp=document.createElement('p');presetHelp.className='help';presetHelp.textContent='每项填写名称和对应提示词。生成时只附加选中的一项；关闭开关保留列表。';presetGroup.append(presetHelp);const presetRows=document.createElement('div');presetRows.className='lora-preset-editor-rows';presetGroup.append(presetRows);const presetControls=[];
    const addPreset=value=>{const row=document.createElement('div');row.className='lora-preset-editor-row';const nameLabel=document.createElement('label'),name=document.createElement('input');name.type='text';name.maxLength=100;name.value=value?.name||'';nameLabel.append('预设名称',name);const promptLabel=document.createElement('label'),prompt=document.createElement('textarea');prompt.maxLength=4000;prompt.value=value?.prompt||'';promptLabel.append('对应提示词',prompt);const record={id:value?.id||crypto.randomUUID(),name,prompt,row};presetControls.push(record);row.append(nameLabel,promptLabel,button('移除预设',()=>{row.remove();presetControls.splice(presetControls.indexOf(record),1);}));presetRows.append(row);};
    (p.presets||[]).forEach(addPreset);presetGroup.append(button('添加预设',()=>{addPreset();presetControls.at(-1).name.focus();}));host.append(presetGroup);
    const select=(label,name,value,choices)=>{const row=document.createElement('label');row.className='lora-info-field';row.append(label);const input=document.createElement('select');for(const [key,text]of Object.entries(choices)){const o=document.createElement('option');o.value=key;o.textContent=text;input.append(o);}input.value=value;controls[name]=input;row.append(input);host.append(row);return input;};
    select('用途','usage',p.usage,{generation:'生图挂载',internal:'专用工作流管理'});select('模型系列','family',p.family,{'':'尚未确认',krea2:'Krea2',qwen:'Qwen'});select('类型','kind',p.kind,kindNames);
    function checks(label,name,values,choices){const group=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent=label;group.append(legend);const inputs=[];for(const [id,text]of Object.entries(choices)){const row=document.createElement('label'),cb=document.createElement('input');cb.type='checkbox';cb.value=id;cb.checked=values.includes(id);row.append(cb,text);group.append(row);inputs.push(cb);}host.append(group);controls[name]=inputs;}
    checks('适用主模型（不勾选表示按系列匹配）','models',p.models,modelNames);checks('适用模式','modes',p.modes,modeNames);
    for(const [name,label]of Object.entries({default_strength:'默认强度',min_strength:'允许最低强度',max_strength:'允许最高强度',step:'滑块步长',recommended_min:'建议最低强度（可留空）',recommended_max:'建议最高强度（可留空）'})){const input=field(label,name,p[name],'number');input.step='any';}
    field('触发词（附加到提示词，不修改原文）','triggers',p.triggers);checks('触发要求','trigger_required',p.trigger_required?['required']:[],{required:'需要触发词'});
    field('使用说明','notes',p.notes,'textarea');select('验证状态','verification',p.verification,{unverified:'尚未验证',verified:'有验证记录'});checks('验证记录适用的主模型','verified_models',p.verified_models||[],modelNames);field('验证依据（注明主模型、版本、测试或作者说明）','evidence',p.evidence,'textarea');
    const candidates=Object.fromEntries(catalog.filter(f=>f.id!==file.id&&f.lora.usage==='generation').map(f=>[f.id,f.label]));checks('需要同时启用的依赖','requires',p.requires,candidates);
    const rules=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='已知冲突规则';rules.append(legend);host.append(rules);const ruleControls=[];
    const addRule=value=>{const row=document.createElement('div');row.className='lora-rule';const target=document.createElement('select');const empty=document.createElement('option');empty.value='';empty.textContent='选择另一个 LoRA';target.append(empty);for(const [id,label]of Object.entries(candidates)){const o=document.createElement('option');o.value=id;o.textContent=label;target.append(o);}target.value=value?.id||'';
      const level=document.createElement('select');for(const [id,label]of [['warning','提示，允许尝试'],['error','禁止组合']]){const o=document.createElement('option');o.value=id;o.textContent=label;level.append(o);}level.value=value?.level||'warning';const reason=document.createElement('input');reason.placeholder='冲突原因及依据';reason.value=value?.reason||'';
      const scopeChecks=(title,choices,selected)=>{const group=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=title+'（不选表示全部）';group.append(legend);const inputs=[];for(const [id,text]of Object.entries(choices)){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=id;input.checked=selected.includes(id);label.append(input,text);group.append(label);inputs.push(input);}return {group,inputs};};
      const model=scopeChecks('适用模型',modelNames,value?.models||[]),preset=scopeChecks('适用模式',modeNames,value?.modes||[]);
      const threshold=document.createElement('input');threshold.type='number';threshold.min=0;threshold.step='any';threshold.placeholder='本项强度绝对值达到（可留空）';threshold.value=value?.min_strength??'';const record={target,level,reason,model,preset,threshold,row};ruleControls.push(record);row.append(target,level,reason,model.group,preset.group,threshold,button('移除规则',()=>{row.remove();ruleControls.splice(ruleControls.indexOf(record),1);}));rules.append(row);};
    p.conflicts.forEach(addRule);host.append(button('添加冲突规则',()=>addRule()));
    dialog.querySelector('.lora-close').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const save=dialog.querySelector('[type=submit]');save.disabled=true;try{const next={...p};next.presets_enabled=presetToggle.checked;next.presets=presetControls.map(r=>({id:r.id,name:r.name.value,prompt:r.prompt.value}));for(const name of ['usage','family','kind','triggers','notes','verification','evidence'])next[name]=controls[name].value;for(const name of ['models','modes','requires','verified_models'])next[name]=controls[name].filter(cb=>cb.checked).map(cb=>cb.value);next.trigger_required=controls.trigger_required.some(cb=>cb.checked);for(const name of ['default_strength','min_strength','max_strength','step','recommended_min','recommended_max'])next[name]=controls[name].value===''?null:controls[name].valueAsNumber;
      next.conflicts=ruleControls.map(r=>({id:r.target.value,level:r.level.value,reason:r.reason.value,models:r.model.inputs.filter(cb=>cb.checked).map(cb=>cb.value),modes:r.preset.inputs.filter(cb=>cb.checked).map(cb=>cb.value),min_strength:r.threshold.value===''?null:r.threshold.valueAsNumber}));
      await api('/api/loras/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:file.id,label:controls.label.value,source:controls.source.value,lora:next})});acknowledgedSignature='';await reload();dialog.close();
    }catch(e){dialog.querySelector('.lora-info-error').textContent=e.message;}finally{save.disabled=false;}};
    document.body.append(dialog);dialog.showModal();controls.label.focus();
  }
})();
