(() => {
  'use strict';
  const $=id=>document.getElementById(id), gallery=$('gallery'), detail=$('detail');
  const headings=['Subject Description','Clothing & Accessories','Action & Pose','Scene / Background','Composition / View','Lighting & Color','Style & Texture','Essential Constraints'];
  const fineFields=window.promptFieldGroups.flatMap(([,fields])=>fields);
  headings.push(...fineFields.map(x=>x[0]));
  const labels=['人物','衣着','动态','场景','镜头','光线与色彩','风格与质感','关键约束'];
  labels.push(...fineFields.map(x=>x[1]));
  headings.push('Presence');labels.push('气质');
  let rows=[], visibleRows=[], detailRows=[], current=null, frame=0;
  const activeTags=new Set();
  let resourceType='prompt';
  let loading=false,lastLoaded=0,signature='';
  let imageRequest=null, galleryImages=[], detailTrigger=null;
  const results=$('prompt-images-stage');
  const detailPosition=$('detail-position');
  const detailInspector=detail.querySelector('.ld-inspector');
  const kind=row=>row.resource_type==='character'?'人物卡':'提示词';
  const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  function layout(){
    frame=0;const width=gallery.clientWidth;if(!width)return;
    const gap=width<600?16:24, columns=Math.max(1,Math.min(6,Math.floor((width+gap)/(230+gap)))), cardWidth=(width-gap*(columns-1))/columns, heights=Array(columns).fill(0);
    for(const card of gallery.children){card.style.width=cardWidth+'px';const col=heights.indexOf(Math.min(...heights));card.style.transform=`translate(${col*(cardWidth+gap)}px,${heights[col]}px)`;heights[col]+=card.offsetHeight+26;}
    gallery.style.height=Math.max(0,...heights)+'px';
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(layout);}
  new ResizeObserver(schedule).observe(gallery);
  function cover(row){
    const box=element('div','cover');
    const fallback=()=>{box.replaceChildren(element('span','fallback-mark','Aa'),element('p','',row.card_summary||row.title||'提示词'));box.classList.add('fallback');box.append(element('span','resource-badge',kind(row)));schedule();};
    if(/^[a-f0-9]{32}$/.test(row.cover_id||'')){const img=element('img');img.alt='';img.loading='lazy';img.decoding='async';img.src='/api/prompt-covers/'+row.cover_id+'/full';img.onload=()=>{img.dataset.ready="true";schedule();};img.onerror=fallback;box.append(img);}else fallback();
    if(!box.querySelector('.resource-badge'))box.append(element('span','resource-badge',kind(row)));
    return box;
  }
  function tags(row,target,limit=Infinity){for(const tag of window.promptRatings.normalTags(row).slice(0,limit))target.append(element('span','',tag));}
  function render(){
    $('new-character').hidden=resourceType!=='character';$('new-prompt').hidden=resourceType!=='prompt';
    const query=$('search').value.trim(), rating=document.querySelector('[name="rating"]:checked').value, sort=document.querySelector('[name="sort"]:checked').value;
    const filtered=window.promptSearch.search(rows,query).filter(row=>(!resourceType||row.resource_type===resourceType)&&(!rating||row.content_rating?.level===rating)&&(!activeTags.size||window.promptRatings.normalTags(row).some(tag=>activeTags.has(tag))));
    if(sort==='recent')filtered.sort((a,b)=>(Date.parse(b.last_used_at)||0)-(Date.parse(a.last_used_at)||0));
    if(sort==='title')filtered.sort((a,b)=>(a.title||'').localeCompare(b.title||'','zh-CN',{numeric:true}));
    visibleRows=filtered;
    gallery.replaceChildren();
    for(const row of filtered){
      const card=element('button','card');card.type='button';card.setAttribute('aria-label','查看'+kind(row)+'：'+(row.title||'未命名提示词'));
      const info=element('div','card-info'),heading=element('div','card-heading');heading.append(element('h2','',row.title||'未命名提示词'),element('span','rating',window.promptRatings.label(row)));info.append(heading);
      if(row.card_summary)info.append(element('p','card-summary',row.card_summary));const tagList=element('div','card-tags');tags(row,tagList,3);info.append(tagList);card.append(cover(row),info);card.onclick=()=>openDetail(row);gallery.append(card);
    }
    $('reset').hidden=!(query||rating||activeTags.size);$('empty').hidden=!!filtered.length;$('retry').hidden=true;$('empty-message').textContent=rows.length?'没有匹配的资源，试试其他关键词。':'还没有资源。';
    $('rating-label').textContent=window.promptRatings.labels[rating]||'全部分级';
    $('sort-label').textContent={recent:'最近使用',title:'标题 A–Z',relevance:query?'搜索相关度':'最近使用'}[sort];
    $('filter-count').textContent=activeTags.size;$('filter-count').hidden=!activeTags.size;
    for(const input of $('tags').querySelectorAll('input'))input.checked=activeTags.has(input.value);
    schedule();
  }
  function buildTags(){
    const counts=new Map();for(const row of rows)for(const tag of window.promptRatings.normalTags(row))counts.set(tag,(counts.get(tag)||0)+1);
    $('tags').replaceChildren();for(const [tag,count] of [...counts].sort((a,b)=>b[1]-a[1])){const label=element('label','menu-option'),input=element('input');input.type='checkbox';input.value=tag;input.checked=activeTags.has(tag);input.onchange=()=>{if(input.checked)activeTags.add(tag);else activeTags.delete(tag);render();};label.append(input,element('span','tag-name',tag),element('small','',String(count)));$('tags').append(label);}filterTags();
  }
  function filterTags(){const query=$('tag-search').value.trim().toLowerCase();let visible=0;for(const label of $('tags').children){label.hidden=!label.querySelector('input').value.toLowerCase().includes(query);if(!label.hidden)visible++;}$('no-tags').hidden=!!visible;}
  function openDetail(row,{preserveView=false}={}){
    const sameResource=detail.open&&current?.id===row.id;
    const scrollNodes=[detailInspector,detail.querySelector('.ld-layout'),detail.querySelector('.ld-heading'),results,detail.querySelector('.ld-main')];
    const scrollPositions=scrollNodes.map(node=>node.scrollTop);
    if(!detail.open){detailRows=visibleRows.some(item=>item.id===row.id)?[...visibleRows]:[row];detailTrigger=document.activeElement;}
    current=row;const character=row.resource_type==='character';
    detail.dataset.resourceKind=character?'character':'prompt';
    results.hidden=character;$('prompt-works-heading').hidden=character;$('prompt-id-fact').hidden=character;
    $('detail-kind').textContent=kind(row);
    $('detail-text-heading').textContent=character?'人物提示词':'提示词正文';
    $('edit-prompt').hidden=character;$('copy').hidden=character;$('use').hidden=character;$('edit-character').hidden=!character;
    $('detail-title').textContent=row.title||'未命名'+kind(row);
    $('detail-summary').textContent=row.card_summary||'';$('detail-summary').hidden=!row.card_summary;
    $('detail-tags').replaceChildren();tags(row,$('detail-tags'));
    $('detail-rating').textContent=window.promptRatings.label(row);$('detail-rating').hidden=!$('detail-rating').textContent;
    $('detail-tags').parentElement.hidden=!$('detail-tags').children.length&&$('detail-rating').hidden;
    $('copy-status').textContent='';$('copy').disabled=!row.prompt;
    $('detail-type').textContent=kind(row);$('detail-prompt-id').textContent=row.id||'';
    const source=$('detail-source');source.replaceChildren();
    const raw=typeof row.source_url==='string'?row.source_url.trim():'';
    if(!raw)source.textContent='未填写';
    else{
      try{
        const url=new URL(raw);
        if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid source');
        const link=element('a','ld-link',url.hostname+' ↗');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.title=raw;link.setAttribute('aria-label','打开来源：'+url.hostname);source.append(link);
      }catch{source.textContent=raw;}
    }
    const cover=$('detail-cover');cover.replaceChildren();cover.hidden=!character;
    if(character){
      if(/^[a-f0-9]{32}$/.test(row.cover_id||'')){const image=element('img');image.src='/api/prompt-covers/'+row.cover_id+'/full';image.alt=row.title||'人物参考图';image.onerror=()=>cover.replaceChildren(element('p','ld-empty','参考图片暂时无法显示'));cover.append(image);}
      else cover.append(element('p','ld-empty','暂无参考图片'));
    }
    const text=row.prompt||'',parts=[...text.matchAll(/^\s*\[([^\]\r\n]+)\]\s*$/gm)],body=$('detail-body');body.replaceChildren();
    function section(title,content){if(!content.trim())return;const block=element('section','ld-module');if(title)block.append(element('h4','',title));block.append(element('p','',content.trim()));body.append(block);}
    if(parts.length){section('',text.slice(0,parts[0].index));parts.forEach((part,i)=>section(labels[headings.indexOf(part[1])]||part[1],text.slice(part.index+part[0].length,parts[i+1]?.index??text.length)));}else section('',text);
    if(!body.children.length)body.append(element('p','ld-hint','暂无提示词正文。'));
    $('use').href=(location.protocol==='file:'?'index.html':'/workbench')+'?prompt_id='+encodeURIComponent(row.id);
    const index=detailRows.findIndex(item=>item.id===row.id);
    detailPosition.textContent=(index+1)+' / '+detailRows.length;
    $('previous').disabled=index<=0;$('next').disabled=index<0||index>=detailRows.length-1;
    if(!detail.open)detail.showModal();
    scrollNodes.forEach((node,index)=>node.scrollTop=preserveView&&sameResource?scrollPositions[index]:0);
    if(!character){if(!preserveView||!sameResource)loadPromptImages(row.id);}else{imageRequest?.abort();galleryImages=[];}
  }
  const imageDate=value=>value?new Date(typeof value==='number'?value*1000:value).toLocaleString():'时间未知';
  let promptShown=0,promptLayoutFrame=0;
  const promptPending=new Set();
  const promptSizes=new ResizeObserver(entries=>{
    for(const entry of entries)promptPending.add(entry.target.closest('.ld-art-card'));
    if(!promptLayoutFrame)promptLayoutFrame=requestAnimationFrame(()=>{
      const updates=[];
      for(const card of promptPending){if(!card?.isConnected)continue;const media=card.firstElementChild.getBoundingClientRect();if(!media.width)continue;updates.push([card,Math.ceil((media.height+card.querySelector('.ld-art-caption').getBoundingClientRect().height+20)/26)]);}
      for(const [card,span] of updates)card.style.gridRowEnd='span '+span;
      promptPending.clear();promptLayoutFrame=0;
    });
  });
  const promptMore=element('button','ld-load-more','加载更多');promptMore.type='button';promptMore.hidden=true;$('prompt-image-grid').after(promptMore);
  promptMore.onclick=appendPromptImages;
  new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!promptMore.hidden)appendPromptImages();},{root:results,rootMargin:'400px'}).observe(promptMore);
  function appendPromptImages(){
    const end=Math.min(promptShown+60,galleryImages.length),fragment=document.createDocumentFragment();
    for(let index=promptShown;index<end;index++){
      const item=galleryImages[index];
      const card=element('button','ld-art-card');card.type='button';card.setAttribute('aria-label','查看生成图片 '+(index+1));
      const image=element('img');image.loading='lazy';image.decoding='async';image.alt='生成图片 '+(index+1);
      image.onload=()=>image.dataset.ready='true';image.onerror=()=>{image.remove();const fallback=element('div','ld-image-unavailable','图片文件已不可用');card.prepend(fallback);promptSizes.observe(fallback);card.disabled=true;};image.src=item.url;
      const caption=element('div','ld-art-caption');caption.append(element('span','',imageDate(item.created)));
      card.append(image,caption);window.luminaMediaMenu.bind(card,item);card.onclick=()=>openImage(galleryImages.indexOf(item));fragment.append(card);promptSizes.observe(image);promptSizes.observe(caption);
    }
    $('prompt-image-grid').append(fragment);promptShown=end;promptMore.hidden=end>=galleryImages.length;
  }
  async function loadPromptImages(id){
    imageRequest?.abort();const controller=new AbortController();imageRequest=controller;
    galleryImages=[];promptShown=0;promptMore.hidden=true;promptSizes.disconnect();promptPending.clear();$('prompt-image-grid').replaceChildren();$('prompt-image-count').textContent='';$('prompt-image-status').textContent='正在读取生成记录…';
    try{
      const response=await fetch('/api/prompts/'+encodeURIComponent(id)+'/images',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('暂时无法读取生成图片，请点击刷新重试。');
      const data=await response.json();if(current?.id!==id||controller.signal.aborted)return;
      galleryImages=Array.isArray(data.images)?data.images.filter(item=>!window.luminaMediaMenu.wasDeleted(item)):[];$('prompt-image-count').textContent=String(galleryImages.length);
      $('prompt-image-status').textContent=galleryImages.length?'':'还没有作品。带入工作台，开始第一张创作。';
      appendPromptImages();
    }catch(error){if(error.name!=='AbortError'&&current?.id===id)$('prompt-image-status').textContent=error.message;}
  }
  async function openImage(index){
    if(!galleryImages[index]||!current)return;
    const row=current;
    try{await window.luminaOutputDetails.open(galleryImages,index,{title:row.title,library_prompt_id:row.id,library_prompt:row.prompt},()=>current?.id===row.id&&detail.open);}
    catch{if(current?.id===row.id)$('prompt-image-status').textContent='暂时无法打开作品，请稍后重试。';}
  }
  document.addEventListener('lumina-media-deleted',event=>{
    const media=event.detail,identity=window.luminaMediaMenu.key(media);
    galleryImages=galleryImages.filter(item=>!window.luminaMediaMenu.same(item,media));
    for(const card of $('prompt-image-grid').children){if(card.dataset.mediaKey===identity){for(const node of card.children)promptSizes.unobserve(node);promptPending.delete(card);card.remove();}}
    promptShown=$('prompt-image-grid').children.length;promptMore.hidden=promptShown>=galleryImages.length;
    $('prompt-image-count').textContent=String(galleryImages.length);
    $('prompt-image-status').textContent=galleryImages.length?'':'还没有作品。带入工作台，开始第一张创作。';
  });
  $('refresh-prompt-images').onclick=()=>{if(current)loadPromptImages(current.id);};
  detail.addEventListener('close',()=>{imageRequest?.abort();if(detailTrigger?.isConnected)detailTrigger.focus({preventScroll:true});});
  $('detail-back').onclick=()=>detail.close();
  function moveDetail(step){const index=detailRows.findIndex(row=>row.id===current?.id),row=detailRows[index+step];if(index>=0&&row)openDetail(row);}
  $('previous').onclick=()=>moveDetail(-1);$('next').onclick=()=>moveDetail(1);
  detail.addEventListener('keydown',event=>{if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();moveDetail(event.key==='ArrowLeft'?-1:1);}});
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(current.prompt||'');$('copy-status').textContent='已复制';}catch{$('copy-status').textContent='复制失败，请手动复制';}};
  $('close').onclick=()=>detail.close();detail.addEventListener('click',event=>{if(event.target===detail){const r=detail.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)detail.close();}});
  $('search').addEventListener('input',render);
  for(const input of document.querySelectorAll('[name="rating"],[name="sort"]'))input.onchange=()=>{const menu=input.closest('details');menu.open=false;menu.querySelector('summary').focus();render();};
  $('tag-search').oninput=filterTags;$('clear-tags').onclick=()=>{activeTags.clear();render();};
  $('reset').onclick=()=>{$('search').value='';document.querySelector('[name="rating"][value=""]').checked=true;activeTags.clear();render();};
  const menus=[...document.querySelectorAll('.toolbar-menu')];
  for(const menu of menus)menu.addEventListener('toggle',()=>{if(menu.open)for(const other of menus)if(other!==menu)other.open=false;});
  document.addEventListener('pointerdown',event=>{for(const menu of menus)if(!menu.contains(event.target))menu.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=menus.find(menu=>menu.open);if(menu){menu.open=false;menu.querySelector('summary').focus();}}});
  async function load(){if(loading)return;loading=true;gallery.setAttribute('aria-busy','true');$('retry').disabled=true;try{const responses=await Promise.all(['/api/prompts','/api/characters'].map(url=>fetch(url,{cache:'no-store'})));if(responses.some(r=>!r.ok))throw Error();const [prompts,characters]=await Promise.all(responses.map(r=>r.json()));const next=[...prompts.map(r=>({...r,resource_type:'prompt'})),...characters.map(r=>({...r,resource_type:'character'}))];const serial=JSON.stringify(next);lastLoaded=Date.now();if(serial!==signature){signature=serial;rows=next;buildTags();render();}else{$('retry').hidden=true;$('empty').hidden=!!visibleRows.length;$('empty-message').textContent=rows.length?'没有匹配的资源，试试其他关键词。':'还没有资源。';}const target=new URLSearchParams(location.search).get('prompt_id');if(target&&!detail.open){const row=rows.find(r=>r.id===target);if(row)openDetail(row);const url=new URL(location.href);url.searchParams.delete('prompt_id');history.replaceState(null,'',url);}}catch{$('empty').hidden=false;$('empty-message').textContent='暂时无法读取提示词库，请重试。';$('retry').hidden=false;}finally{loading=false;gallery.setAttribute('aria-busy','false');$('retry').disabled=false;}}
  for(const button of document.querySelectorAll('[data-type]'))button.onclick=()=>{resourceType=button.dataset.type;for(const other of document.querySelectorAll('[data-type]'))other.setAttribute('aria-pressed',String(other===button));render();};
  const editor=$('character-editor');let editing=null,coverId=null,busy=false;
  function preview(id){coverId=id;$('character-preview').hidden=!id;if(id)$('character-preview').src='/api/prompt-covers/'+id+'/full';$('reference-label').textContent=id?'更换参考图片':'上传参考图片';}
  const characterFields=[...window.promptFieldGroups[0][1],['Presence','气质'],...window.promptFieldGroups.at(-1)[1]];
  const characterInputs=new Map();
  for(const [name,label] of characterFields){const host=element('label','',label),input=element('textarea');input.rows=name==='Face'?4:2;input.maxLength=10000;input.placeholder='未设定 · 可留空';input.setAttribute('aria-label','人物'+label);host.append(input);$('character-field-inputs').append(host);characterInputs.set(name,input);}
  function loadCharacterFields(prompt){
    for(const input of characterInputs.values())input.value='';
    const matches=[...prompt.matchAll(/^[ \t]*\[([^\]\r\n]+)\][ \t]*\r?\n?/gm)],unknown=[];
    if(!matches.length)unknown.push(prompt);else{
      if(prompt.slice(0,matches[0].index).trim())unknown.push(prompt.slice(0,matches[0].index));
      matches.forEach((m,i)=>{const end=matches[i+1]?.index??prompt.length,value=prompt.slice(m.index+m[0].length,end).trim(),input=characterInputs.get(m[1]);if(input)input.value+=[input.value?'\n\n':'',value].join('');else unknown.push(prompt.slice(m.index,end));});
    }
    $('character-legacy').value=unknown.join('\n\n').trim();$('character-legacy-label').hidden=!$('character-legacy').value;
  }
  function characterPrompt(){const values=characterFields.map(([name])=>'['+name+']\n'+characterInputs.get(name).value.trim());if($('character-legacy').value.trim())values.push($('character-legacy').value.trim());return values.join('\n\n');}
  function editCharacter(row=null){editing=row;$('character-form').reset();$('character-status').textContent='';$('character-editor-title').textContent=row?'编辑人物卡':'新建人物卡';$('character-title').value=row?.title||'';$('character-description').value=row?.card_summary||'';loadCharacterFields(row?.prompt||'');$('character-tags').value=(row?.tags||[]).join('，');$('character-rating').value=row?.content_rating?.level||'sfw';preview(row?.cover_id||null);editor.showModal();}
  async function post(url,body){const config=await fetch('/api/config',{cache:'no-store'});if(!config.ok)throw Error('无法连接服务');const {token}=await config.json();const multipart=body instanceof FormData;const response=await fetch(url,{method:'POST',headers:{'X-App-Token':token,...(multipart?{}:{'Content-Type':'application/json'})},body:multipart?body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'保存失败，请重试');return data;}
  function setBusy(value){busy=value;for(const input of editor.querySelectorAll('input,textarea,select,button'))input.disabled=value;}
  const promptOverlay=$('prompt-create-overlay'),promptFrame=$('prompt-create-frame');
  let promptEditorFocus=null,promptEditorId=null;
  function closePromptEditor(){
    promptOverlay.close();promptOverlay.hidden=true;promptFrame.removeAttribute('src');promptEditorId=null;
    if(promptEditorFocus?.isConnected)promptEditorFocus.focus({preventScroll:true});
    load();
  }
  function openPromptEditor(row=null){
    if(promptOverlay.open)return;
    promptEditorFocus=row?$('edit-prompt'):$('new-prompt');promptEditorId=row?.id||null;
    promptFrame.title=row?'编辑提示词':'新建提示词';
    promptFrame.src=(location.protocol==='file:'?'index.html':'/workbench')+(row?'?edit_prompt='+encodeURIComponent(row.id):'?new_prompt=1');
    promptOverlay.hidden=false;promptOverlay.showModal();
  }
  $('new-prompt').onclick=()=>openPromptEditor();
  $('edit-prompt').onclick=()=>{if(current?.resource_type==='prompt')openPromptEditor(current);};
  promptOverlay.addEventListener('cancel',event=>{event.preventDefault();closePromptEditor();});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==promptFrame.contentWindow||!promptOverlay.open)return;
    if(event.data?.type==='reader-draft-saved'){
      const saved=event.data.row;
      if(!saved?.id||typeof saved.prompt!=='string'||promptEditorId&&saved.id!==promptEditorId)return;
      promptEditorId=saved.id;
      const updated={...saved,resource_type:'prompt'},index=rows.findIndex(row=>row.id===saved.id&&row.resource_type==='prompt');
      if(index<0)rows.push(updated);else rows[index]=updated;
      detailRows=detailRows.map(row=>row.id===saved.id&&row.resource_type==='prompt'?updated:row);
      signature=JSON.stringify(rows);buildTags();render();
      if(detail.open&&current?.id===saved.id)openDetail(updated,{preserveView:true});
    }else if(event.data?.type==='reader-draft-closed')closePromptEditor();
    else if(event.data?.type==='reader-draft-error'){
      const message=event.data.message||'暂时无法打开编辑器，请重试。';closePromptEditor();
      if(detail.open)$('copy-status').textContent=message;
      else{$('empty-message').textContent=message;$('empty').hidden=false;}
    }
  });
  $('new-character').onclick=()=>editCharacter();$('edit-character').onclick=()=>editCharacter(current);
  $('cancel-character').onclick=()=>editor.close();editor.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('character-file').onchange=async()=>{const file=$('character-file').files[0];if(!file)return;setBusy(true);$('character-status').textContent='正在上传…';try{const data=new FormData();data.append('image',file);preview((await post('/api/prompt-covers/upload',data)).cover_id);$('character-status').textContent='';}catch(e){$('character-status').textContent=e.message;}finally{setBusy(false);$('character-file').value='';}};
  $('character-form').onsubmit=async event=>{event.preventDefault();if(busy)return;if(!coverId){$('character-status').textContent='请上传一张参考图片';return;}setBusy(true);$('character-status').textContent='正在保存…';try{const row=await post('/api/characters',{id:editing?.id,revision:editing?.revision,title:$('character-title').value,card_summary:$('character-description').value,prompt:characterPrompt(),tags:$('character-tags').value.split(/[,，]/).map(t=>t.trim()).filter(Boolean),cover_id:coverId,content_rating:{level:$('character-rating').value}});editor.close();if(detail.open)detail.close();await load();openDetail({...row,resource_type:'character'});}catch(e){$('character-status').textContent=e.message;}finally{setBusy(false);}};
  $('retry').onclick=load;window.addEventListener('focus',()=>{if(Date.now()-lastLoaded>30000&&!detail.open&&!$('character-editor').open&&$('prompt-create-overlay').hidden)load();});document.fonts.ready.then(schedule);load();
})();
