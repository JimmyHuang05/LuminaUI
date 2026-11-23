(() => {
  const field=document.getElementById('prompt-field'),input=document.getElementById('prompt');
  const card=document.createElement('div');card.className='selected-prompt-card';card.hidden=true;field.append(card);
  const supplement=document.createElement('div');supplement.className='field';supplement.id='prompt-supplement-field';supplement.innerHTML='<label class="step-label" data-step="2" for="prompt-supplement">提示词补充（可选）</label><textarea id="prompt-supplement" maxlength="10000" placeholder="补充动作、表情、光线等细节…"></textarea>';field.after(supplement);
  const extra=supplement.querySelector('textarea'),states={};let current=mode;
  const supported=()=>['01_text_to_image','02_character_consistency'].includes(mode);
  const clone=row=>JSON.parse(JSON.stringify(row));
  function remember(){states[current]={row:states[current]?.row||null,extra:extra.value};}
  function render(){
    const row=states[mode]?.row;
    if(field.nextElementSibling!==supplement)field.after(supplement);
    supplement.hidden=!supported()||!row;card.hidden=!supported()||!row;input.hidden=supported()&&!!row;
    supplement.querySelector('label').dataset.step=mode==='01_text_to_image'?'2':'3';
    if(row&&supported()){
      card.replaceChildren();const title=document.createElement('strong');title.textContent=row.title;const preview=document.createElement('p');preview.textContent=row.prompt.replace(/\s+/g,' ').trim();
      const tags=document.createElement('div');tags.className='prompt-card-tags';
      if(window.promptRatings.visible(row)){const ratingTag=document.createElement('span');ratingTag.className='prompt-card-tag '+window.promptRatings.tagClass(row);ratingTag.textContent=window.promptRatings.label(row);tags.append(ratingTag);}
      for(const value of window.promptRatings.normalTags(row)){const tag=document.createElement('span');tag.className='prompt-card-tag';tag.textContent=value;tags.append(tag);}
      const close=document.createElement('button');close.type='button';close.className='selected-prompt-close';close.textContent='×';close.setAttribute('aria-label','取消使用提示词卡片');close.title='取消使用提示词卡片';
      close.onclick=()=>{input.value=extra.value;extra.value='';states[mode]={row:null,extra:''};render();input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();};
      card.append(close,title,preview);if(tags.children.length)card.append(tags);
    }
    const ratio=document.querySelector('#ratio-field label');if(ratio)ratio.dataset.step=mode==='01_text_to_image'?'3':'4';
  }
  extra.oninput=remember;
  input.addEventListener('input',()=>{if(supported()&&states[mode]?.row&&input.value!==states[mode].row.prompt){states[mode].row=null;render();}});
  window.addEventListener('creative-mode-change',()=>{remember();current=mode;extra.value=states[mode]?.extra||'';if(states[mode]?.row)input.value=states[mode].row.prompt;render();});
  window.promptSelection={
    apply(row){if(supported()&&row.recommended_ratio){const select=document.getElementById('ratio');if([...select.options].some(o=>o.value===row.recommended_ratio)){select.value=row.recommended_ratio;select.dispatchEvent(new Event('change',{bubbles:true}));}}if(!supported()){input.value=row.prompt;input.dispatchEvent(new Event('input',{bubbles:true}));return;}states[mode]={row:clone(row),extra:extra.value};input.value=row.prompt;render();input.dispatchEvent(new Event('input',{bubbles:true}));},
    update(old,row){for(const state of Object.values(states)){if((old.id?state.row?.id===old.id:state.row?.title===old.title&&state.row?.prompt===old.prompt))state.row=clone(row);}if(states[mode]?.row)input.value=states[mode].row.prompt;render();},
    payload(){if(!supported())return {};const base=states[mode]?.row?.prompt??input.value,addition=extra.value.trim();return {base_prompt:base,prompt_supplement:addition,library_prompt:states[mode]?.row?clone(states[mode].row):null,prompt:base+(addition?'\n\n'+addition:'')};},
    restore(job){if(!supported())return;states[mode]={row:job.library_prompt?clone(job.library_prompt):null,extra:job.prompt_supplement||''};extra.value=states[mode].extra;input.value=job.base_prompt??job.prompt;render();}
  };
  render();
})();
