(() => {
  const key='studio.camera-preset.v1';
  let config={enabled:false,id:'auto',strength:'standard',noticed:false};
  try { Object.assign(config,JSON.parse(localStorage.getItem(key)||'{}')); } catch {}
  const panel=document.createElement('section');panel.className='lv2-panel';panel.id='camera-presets-panel';
  panel.innerHTML=`<header><h3>摄影预设</h3><label><input id="camera-enabled" type="checkbox"> 启用</label></header>
  <p class="lv2-caption">选择抓拍机位，智能调整摄影效果，保留人物与服装</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><select id="camera-kind" aria-label="机位"></select><select id="camera-strength" aria-label="机位效果强度"><option value="subtle">轻微</option><option value="standard">自然</option><option value="strong">明显</option></select><button id="camera-random" type="button" class="secondary">换个机位</button></div>
  <label><input id="camera-noticed" type="checkbox"> 发现镜头：轻微侧目</label>
  <p id="camera-description" class="lv2-caption"></p><details><summary>智能改写预览</summary><button id="camera-rewrite" type="button" class="secondary">生成改写预览</button><pre id="camera-preview" style="white-space:pre-wrap;font-size:12px;max-height:220px;overflow:auto"></pre></details>`;
  document.getElementById('prompt-supplement-field').after(panel);
  const style=document.createElement('style');style.textContent='#camera-presets-panel{margin:0 0 20px;padding:12px;border:1px solid var(--day-line,#393939);border-radius:8px;background:var(--day-surface,#1c1c1c)}#camera-presets-panel[hidden]{display:none}#camera-presets-panel header{display:flex;align-items:center;justify-content:space-between}#camera-presets-panel h3{font-size:12px;margin:0}#camera-presets-panel label{display:flex;align-items:center;gap:6px;font-size:11px;margin:10px 0}#camera-presets-panel input[type=checkbox]{width:auto;margin:0}#camera-presets-panel select{min-width:0;flex:1;padding:7px;font-size:11px}#camera-presets-panel button{font-size:11px;padding:6px 9px}#camera-presets-panel summary{font-size:11px;cursor:pointer}#camera-rewrite{margin:10px 0}';document.head.append(style);
  const el=id=>panel.querySelector('#camera-'+id);
  let items=[],version=0,snapshot=null;
  const source=()=>{const p=window.promptSelection?.payload()||{};return p.base_prompt!==undefined?p.base_prompt+(p.prompt_supplement?.trim()?'\n\n'+p.prompt_supplement.trim():''):document.getElementById('prompt').value;};
  const supported=()=>mode==='01_text_to_image' && document.getElementById('generation-workflow').value!=='moody_krea2_i2i_4khd';
  async function render(){
    const anchor=document.getElementById('prompt-supplement-field');if(anchor.nextElementSibling!==panel)anchor.after(panel);
    panel.hidden=!supported();el('enabled').checked=!!config.enabled;el('kind').value=config.id;el('strength').value=config.strength;el('noticed').checked=!!config.noticed;
    for(const id of ['kind','strength','noticed','random'])el(id).disabled=!config.enabled;
    el('description').textContent=items.find(x=>x.id===config.id)?.description||'';
    const revision=++version;
    el('rewrite').disabled=!config.enabled;
    if(!config.enabled){el('preview').textContent='未启用，不影响生成。';return;}
    el('preview').textContent=snapshot?'已有改写预览；生成时会核对原文与选项。':'点击生成改写预览，使用已配置的文本模型。人物、服装、动作和场景锁定。';
  }
  function save(){snapshot=null;localStorage.setItem(key,JSON.stringify(config));render();}
  el('enabled').onchange=()=>{config.enabled=el('enabled').checked;save();};
  el('kind').onchange=()=>{config.id=el('kind').value;save();};
  el('strength').onchange=()=>{config.strength=el('strength').value;save();};
  el('noticed').onchange=()=>{config.noticed=el('noticed').checked;save();};
  el('random').onclick=()=>{const alternatives=items.filter(x=>x.id!==config.id);if(alternatives.length)config.id=alternatives[Math.floor(Math.random()*alternatives.length)].id;save();};
  el('rewrite').onclick=async()=>{
    el('rewrite').disabled=true;el('preview').textContent='正在根据场景改写…';
    const input=source(),opts={...config};
    try {const r=await api('/api/camera-presets/rewrite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:input,camera_preset:opts})});
      if(input!==source()||JSON.stringify(opts)!==JSON.stringify(config))throw Error('原文或选项已变化，请重试');
      snapshot=r.snapshot;el('preview').textContent=r.snapshot.reason+'\n\n'+r.changes.map(x=>'['+x.field+']\n原：'+x.before+'\n改：'+x.after).join('\n\n');
    }catch(e){snapshot=null;el('preview').textContent=e.message;}finally{el('rewrite').disabled=false;}
  };
  window.cameraPresets={payload(){if(!supported()||!config.enabled)return {};if(!snapshot)throw Error('请先生成机位改写预览');return {camera_preset:{...config,engine:'smart',snapshot}};},restore(job){const c=job.camera_preset;config={enabled:!!c?.enabled,id:c?.id||'auto',strength:c?.strength||'standard',noticed:!!c?.noticed};save();snapshot=c?.snapshot||null;render();}};
  window.addEventListener('creative-mode-change',render);document.getElementById('generation-workflow').addEventListener('change',render);
  fetch('/camera-presets.json').then(r=>{if(!r.ok)throw Error('机位预设加载失败');return r.json();}).then(data=>{items=[{id:'auto',label:'自动适配',description:'由文本模型结合原场景选择机位'},...data.items];for(const item of items){const o=document.createElement('option');o.value=item.id;o.textContent=item.label;el('kind').append(o);}if(!items.some(x=>x.id===config.id))config.id='phone';render();}).catch(e=>{el('enabled').disabled=true;el('preview').textContent=e.message;});
})();
