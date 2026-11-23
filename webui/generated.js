// Shared image actions, including images displayed inside native dialogs.
(() => {
 const bindings=new WeakMap(),pending=new Set(),deleted=new Set();
 let menu=null,anchor=null,notice=null,noticeTimer;
 function asset(item){
  if(!item)return null;
  let media=item;
  if(!media.filename){try{const url=new URL(item.url||item.src,location.href);if(url.origin!==location.origin||url.pathname!=='/image')return null;media=Object.fromEntries(url.searchParams);}catch{return null;}}
  if(!['input','output'].includes(media.type)||typeof media.filename!=='string'||!media.filename)return null;
  return {type:media.type,filename:media.filename,subfolder:media.subfolder||''};
 }
 const key=item=>{const media=asset(item);return media?JSON.stringify([media.type,media.subfolder,media.filename]):'';};
 function close(restore=false){const target=anchor;menu?.remove();menu=null;anchor=null;if(restore&&target?.isConnected)target.focus({preventScroll:true});}
 function notify(message,error=false){
  clearTimeout(noticeTimer);notice?.remove();notice=document.createElement('div');notice.className='lumina-media-notice';notice.setAttribute('role',error?'alert':'status');notice.textContent=message;
  ([...document.querySelectorAll('dialog[open]')].at(-1)||document.body).append(notice);
  noticeTimer=setTimeout(()=>{notice?.remove();notice=null;},5000);
 }
 async function act(action,media){
  const identity=key(media);if(pending.has(identity))return;pending.add(identity);
  try{
   const config=await fetch('/api/config',{cache:'no-store'});if(!config.ok)throw Error('无法连接服务，请稍后重试。');
   const {token}=await config.json();
   const response=await fetch('/api/media/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':token},body:JSON.stringify(media)});
   const result=await response.json();if(!response.ok)throw Error(result.error||'图片操作失败，请重试。');
   if(action==='delete'){
    deleted.add(identity);document.dispatchEvent(new CustomEvent('lumina-media-deleted',{detail:media}));notify('已移入回收站');
   }
  }catch(error){notify(error.message||'图片操作失败，请重试。',true);}finally{pending.delete(identity);}
 }
 function open(target,point){
  const media=asset(bindings.get(target));if(!media)return;close();anchor=target;
  menu=document.createElement('div');menu.className='lumina-media-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','图片操作');menu.setAttribute('popover','manual');
  for(const [label,action,path] of [
   ['在文件夹中打开','open-folder','M3 7V5h6l2 2h10v13H3V7Z'],
   ['删除（移入回收站）','delete','M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6']]){
   const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.disabled=pending.has(key(media));
   button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';const span=document.createElement('span');span.textContent=label;button.append(span);
   button.onclick=()=>{close();act(action,media);};menu.append(button);
  }
  (target.closest('dialog[open]')||document.body).append(menu);menu.showPopover();
  const box=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(point.x,innerWidth-box.width-8))+'px';menu.style.top=Math.max(8,Math.min(point.y,innerHeight-box.height-8))+'px';
  menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
 }
 function bound(target){for(let node=target;node&&node!==document;node=node.parentElement)if(bindings.has(node))return node;return null;}
 document.addEventListener('contextmenu',event=>{const target=bound(event.target);if(!target||!asset(bindings.get(target)))return;event.preventDefault();event.stopPropagation();open(target,{x:event.clientX,y:event.clientY});});
 document.addEventListener('keydown',event=>{
  if(menu&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);return;}
  if(menu?.contains(event.target)){
   event.stopPropagation();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
   if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();}
   if(event.key==='Tab')close(true);return;
  }
  if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){
   const target=bound(event.target);if(!target)return;event.preventDefault();event.stopPropagation();const box=target.getBoundingClientRect();open(target,{x:box.left+20,y:box.top+20});
  }
 },true);
 document.addEventListener('pointerdown',event=>{if(menu&&!menu.contains(event.target))close();},true);
 document.addEventListener('scroll',()=>{if(menu)close();},true);
 document.addEventListener('close',()=>close(),true);window.addEventListener('resize',()=>close());window.addEventListener('blur',()=>close());
 window.luminaMediaMenu={
  bind(node,item){bindings.set(node,item);node.dataset.mediaKey=key(item);if(node.tagName==='IMG')node.tabIndex=0;},
  key,same:(a,b)=>!!key(a)&&key(a)===key(b),wasDeleted:item=>deleted.has(key(item))
 };
})();

(() => {
const embedded=!!document.getElementById('output-panel');
const $=id=>document.getElementById((embedded?'output-':'')+id);
let rows=[],allRows=[],detailRows=[],total=0,active=-1,controller,loading,timer,shown=0,lastLoaded=0,signature="";
const activeTags=new Set();let metadata=new Map();
const detail=$('detail'),originLink=$('origin'),photo=$('photo');
const photoStatus=document.createElement('p');photoStatus.className='ld-empty';photoStatus.setAttribute('role','status');photoStatus.hidden=true;photo.after(photoStatus);
let returnFocus=null,returnScroll=[],detailRevision=0,openRequest=0;
// Keep original images inside the app instead of navigating to a bare image document.
const originalViewer=document.createElement('dialog');originalViewer.className='lumina-original';originalViewer.setAttribute('aria-label','查看原图');
const originalClose=document.createElement('button');originalClose.type='button';originalClose.className='lumina-original-close';originalClose.setAttribute('aria-label','关闭原图');originalClose.title='关闭原图（Esc）';originalClose.textContent='×';originalClose.autofocus=true;
const originalImage=document.createElement('img');
const originalStatus=document.createElement('p');originalStatus.setAttribute('role','status');
originalViewer.append(originalImage,originalStatus,originalClose);document.body.append(originalViewer);
originalClose.onclick=()=>originalViewer.close();
originalViewer.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();originalViewer.close();}});
originalViewer.addEventListener('cancel',event=>{event.preventDefault();originalViewer.close();});
originalViewer.addEventListener('close',()=>{originalImage.removeAttribute('src');originalImage.onload=null;originalImage.onerror=null;if(detail.open)$('original').focus({preventScroll:true});});
$('original').onclick=()=>{
 const row=detailRows[active];if(!row?.url)return;
 originalImage.hidden=true;originalImage.alt=row.title||'原图';originalStatus.hidden=false;originalStatus.textContent='正在加载原图…';
 originalImage.onload=()=>{originalImage.hidden=false;originalStatus.hidden=true;};
 originalImage.onerror=()=>{originalImage.hidden=true;originalStatus.hidden=false;originalStatus.textContent='原图暂时无法显示，请关闭后重试。';};
 originalImage.src=row.url;window.luminaMediaMenu.bind(originalImage,row);originalViewer.showModal();
};
const retry=document.createElement('button');retry.type='button';retry.className='collection-retry';retry.textContent='重新加载';retry.hidden=true;$('status').after(retry);retry.onclick=load;
$('status').setAttribute('role','status');

if(embedded){
 const toolbar=document.querySelector('.toolbar:not(#output-toolbar)').cloneNode(true);toolbar.id='output-toolbar';
 for(const el of toolbar.querySelectorAll('[id]'))el.id='output-'+el.id;
 for(const el of toolbar.querySelectorAll('[name]'))el.name='output-'+el.name;
 toolbar.querySelector('#output-search').placeholder='搜索标题、标签、提示词或文件名';
 toolbar.querySelector('#output-search').setAttribute('aria-label','搜索输出');
 toolbar.querySelector('#output-sort-label').textContent='最近生成';
 toolbar.querySelector('[value=recent]').nextElementSibling.textContent='最近生成';
 $('panel').querySelector('.toolbar').replaceWith(toolbar);
 const place=()=>document.querySelector('.studio-tools')?.append(toolbar);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',place,{once:true});else place();
}
function render(){
 sizeObserver.disconnect();pendingCards.clear();$('grid').replaceChildren();
 const query=$('search').value.trim().toLowerCase();
 const rating=document.querySelector('[name=output-rating]:checked')?.value||'';
 const sort=document.querySelector('[name=output-sort]:checked')?.value||'recent';
 rows=allRows.filter(r=>(!query||[r.title,r.prompt,r.filename,r.model,...(r.tags||[])].join(' ').toLowerCase().includes(query))&&(!rating||r.content_rating?.level===rating)&&(!activeTags.size||(r.tags||[]).some(t=>activeTags.has(t))));
 if(sort==='title')rows.sort((a,b)=>(a.title||'').localeCompare(b.title||'','zh-CN',{numeric:true}));
 else rows.sort((a,b)=>(b.created||0)-(a.created||0));
 if(sort==='relevance'&&query)rows.sort((a,b)=>Number((b.title||'').toLowerCase().includes(query))-Number((a.title||'').toLowerCase().includes(query)));
 total=rows.length;
 shown=0;appendCards();
 $('count').textContent=`共 ${allRows.length} 张 · 匹配 ${rows.length} 张`;$('status').textContent=rows.length?'':'没有匹配的输出。';
 if(embedded){$('rating-label').textContent=({sfw:'G',r15:'R-15',nsfw:'R-18'})[rating]||'全部分级';$('sort-label').textContent={recent:'最近生成',title:'标题 A–Z',relevance:'搜索相关度'}[sort];$('filter-count').hidden=!activeTags.size;$('filter-count').textContent=activeTags.size;}
}
function appendCards(){
 const fragment=document.createDocumentFragment();const end=Math.min(shown+60,rows.length);
 for(let index=shown;index<end;index++){const row=rows[index];
 const card=document.createElement('button');card.className='card';card.style.gridRowEnd='span 16';card.setAttribute('aria-label','查看生成图片 '+(index+1));
 const img=document.createElement('img');img.alt=row.title;img.loading='lazy';img.decoding='async';img.style.aspectRatio='3 / 4';img.onload=()=>{img.style.aspectRatio='auto';};img.onerror=()=>{img.alt='图片文件不可用';};img.src=row.url;
 const caption=document.createElement('span');caption.className='caption';const title=document.createElement('strong');title.textContent=row.title;const small=document.createElement('small');small.textContent=[stamp(row.created),row.model].filter(Boolean).join(' · ');caption.append(title,small);card.append(img,caption);window.luminaMediaMenu.bind(card,row);card.onclick=()=>openDetail(rows.indexOf(row),card);fragment.append(card);sizeObserver.observe(img);sizeObserver.observe(caption);
 }
 $('grid').append(fragment);shown=end;more.hidden=shown>=rows.length;
}

function buildTags(){
 if(!embedded)return;$('tags').replaceChildren();const tags=[...new Set(allRows.flatMap(r=>r.tags||[]))].sort();
 for(const tag of tags){const label=document.createElement('label');label.className='menu-option';const input=document.createElement('input');input.type='checkbox';input.value=tag;input.checked=activeTags.has(tag);input.onchange=()=>{input.checked?activeTags.add(tag):activeTags.delete(tag);render();};const name=document.createElement('span');name.textContent=tag;label.append(input,name);$('tags').append(label);}filterTags();
}
function filterTags(){let visible=0;for(const label of $('tags').children){label.hidden=!label.textContent.toLowerCase().includes($('tag-search').value.toLowerCase());if(!label.hidden)visible++;}$('no-tags').hidden=!!visible;}

const stamp=v=>v?new Date(v*1000).toLocaleString():'';
const pendingCards=new Set();let layoutFrame;
const sizeObserver=new ResizeObserver(entries=>{
 for(const entry of entries)pendingCards.add(entry.target.closest('.card'));
 if(!layoutFrame)layoutFrame=requestAnimationFrame(()=>{
  // Read all geometry first: interleaving a grid write with each read forces a full layout per card.
  const updates=[];
  for(const card of pendingCards){if(!card?.isConnected)continue;const img=card.querySelector('img').getBoundingClientRect();if(!img.width)continue;const height=img.height+card.querySelector('.caption').getBoundingClientRect().height+2;updates.push([card,Math.ceil((height+18)/26)]);}
  for(const [card,span] of updates){const value='span '+span;if(card.style.gridRowEnd!==value)card.style.gridRowEnd=value;}
  pendingCards.clear();layoutFrame=null;
 });
});
const more=document.createElement('button');more.type='button';more.className='output-load-more';more.textContent='加载更多';more.hidden=true;$('grid').after(more);more.onclick=appendCards;
const pageObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!more.hidden)appendCards();},{rootMargin:'400px'});pageObserver.observe(more);
function load(){
 if(loading)return loading;
 loading=loadRows().finally(()=>{loading=null;});
 return loading;
}
async function loadRows(){
 if(controller)return;const request=new AbortController();controller=request;retry.hidden=true;$('grid').setAttribute('aria-busy','true');if(!allRows.length)$('status').textContent='正在加载输出…';
 try{
 const collected=[];let offset=0;
 try{const response=await fetch('/api/prompts',{signal:AbortSignal.any([request.signal,AbortSignal.timeout(5000)])});if(response.ok)metadata=new Map((await response.json()).map(r=>[r.id,r]));}catch(e){if(request.signal.aborted)throw e;}
 do{
  const response=await fetch('/api/generated-images?'+new URLSearchParams({offset}),{signal:AbortSignal.any([request.signal,AbortSignal.timeout(15000)])});
  if(!response.ok)throw Error('读取失败，请重新进入页面重试');
  const data=await response.json();if(controller!==request)return;
  if(!Array.isArray(data.images))throw Error('输出记录格式错误');
  for(const row of data.images){if(window.luminaMediaMenu.wasDeleted(row))continue;const source=metadata.get(row.library_prompt_id);collected.push({...row,tags:row.tags||source?.tags||[],content_rating:row.content_rating||source?.content_rating});}
  // First paint and deep links must not wait for the entire archive.
  if(!allRows.length){allRows=collected.filter(row=>!window.luminaMediaMenu.wasDeleted(row));buildTags();render();}
  openLinkedOutput(collected,false);
  const next=data.next;
  if(next!=null&&(!Number.isInteger(next)||next<=offset||!data.images.length))throw Error('输出分页未前进');
  offset=next??null;
  if(offset!==null)$('status').textContent=`正在加载其余输出…（${collected.length}${data.total?' / '+data.total:''}）`;
 }while(offset!==null);
 const available=collected.filter(row=>!window.luminaMediaMenu.wasDeleted(row)),updated=JSON.stringify(available);lastLoaded=Date.now();if(updated!==signature){signature=updated;allRows=available;buildTags();render();}else $('status').textContent=rows.length?'':'没有匹配的输出。';
 openLinkedOutput(allRows,true);
 }catch(error){if(error.name!=='AbortError'&&controller===request){$('status').textContent='暂时无法加载输出，已有作品仍可查看。';retry.hidden=false;}}finally{if(controller===request){controller=null;$('grid').setAttribute('aria-busy','false');}}
}
function openLinkedOutput(items,complete){
 const target=new URL(location.href),imageURL=target.searchParams.get('output_image');if(!imageURL)return;
 const index=items.findIndex(row=>row.url===imageURL);if(index<0&&!complete)return;
 if(index>=0){++openRequest;beginDetail(items,index,$('search'),'返回输出库');}
 else $('status').textContent='这张作品已不在输出记录中，可以浏览其他作品。';
 target.searchParams.delete('output_image');history.replaceState(null,'',target);
}
function openDetail(index,opener){
 if(!rows[index])return;
 ++openRequest;
 // Keep navigation stable if the collection refreshes or its filters change behind the dialog.
 beginDetail(rows,index,opener,'返回输出库');
}
function beginDetail(items,index,opener,backLabel){
 detailRows=items.slice();returnFocus=opener;returnScroll=[];
 for(let node=opener?.parentElement;node;node=node.parentElement)if(node.scrollHeight>node.clientHeight||node.scrollWidth>node.clientWidth)returnScroll.push([node,node.scrollLeft,node.scrollTop]);
 for(const button of detail.querySelectorAll('[data-detail-back]')){
  const label=button.querySelector('span');if(label)label.textContent=backLabel;else button.textContent=backLabel;
 }
 show(index);
}
window.luminaOutputDetails={
 async open(items,index=0,context={},isCurrent=()=>true){
  if(!Array.isArray(items)||!items[index])return;
  const request=++openRequest,opener=document.activeElement,parentDialog=opener?.closest('dialog');
  if(loading)await loading;else if(!lastLoaded)await load();
  if(request!==openRequest||(parentDialog&&!parentDialog.open)||!isCurrent())return;
  const outputs=items.map(item=>{
   const saved=allRows.find(row=>(item.url&&row.url===item.url)||(item.job_id&&item.image_index!=null&&row.job_id===item.job_id&&row.image_index===item.image_index));
   // The library snapshot is context only; it must never stand in for a missing generation prompt.
   return {...context,...item,...saved,title:saved?.title||item.title||context.title||'生成作品',library_prompt_id:saved?.library_prompt_id||item.library_prompt_id||context.library_prompt_id,prompt:saved?.prompt||item.prompt||'',library_prompt:saved?.library_prompt||item.library_prompt||context.library_prompt||''};
  });
  beginDetail(outputs,index,opener,parentDialog?'返回提示词':'返回输出库');
 }
};
function setFacts(row,width,height){
 const entries=[['生成时间',stamp(row.created)],['模型',row.model],['尺寸',width>0&&height>0?`${width} × ${height}`:''],['Seed',row.seed],['文件名',row.filename],['提示词 ID',row.library_prompt_id]];
 const fragment=document.createDocumentFragment();
 for(const [label,value] of entries){
  if(value==null||value==='')continue;
  const fact=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');
  term.textContent=label;description.textContent=String(value);description.title=String(value);fact.append(term,description);fragment.append(fact);
 }
 $('meta').replaceChildren(fragment);
}
function show(index){
 const row=detailRows[index];if(!row)return;
 active=index;const revision=++detailRevision;
 $('title').textContent=row.title||'未命名作品';
 $('subtitle').textContent=['生成作品',stamp(row.created)].filter(Boolean).join(' · ');
 $('prompt').textContent=row.prompt||'这条历史记录未保存生成提示词。';
 $('copy').disabled=!row.prompt?.trim();$('copy-status').textContent='';
 $('library').textContent=row.library_prompt||'';
 $('snapshot').hidden=!row.library_prompt||row.library_prompt===row.prompt;
 originLink.hidden=!row.library_prompt_id;
 if(row.library_prompt_id){
  originLink.textContent='来源提示词 · '+(metadata.get(row.library_prompt_id)?.title||row.title||'查看来源')+' ↗';
  originLink.href=(location.protocol==='file:'?'resources.html':'/resources')+'?prompt_id='+encodeURIComponent(row.library_prompt_id);
  originLink.target='_blank';originLink.rel='noopener';
 }else{originLink.removeAttribute('href');originLink.textContent='';}
 setFacts(row,row.width,row.height);
 photo.hidden=false;photoStatus.hidden=true;photo.alt=row.title||'生成作品';window.luminaMediaMenu.bind(photo,row);
 const unavailable=()=>{if(revision!==detailRevision)return;photo.hidden=true;photoStatus.textContent='图片暂时无法显示，可以尝试打开原图。';photoStatus.hidden=false;};
 photo.onload=()=>{if(revision!==detailRevision)return;photo.hidden=false;photoStatus.hidden=true;setFacts(row,photo.naturalWidth||row.width,photo.naturalHeight||row.height);};
 photo.onerror=unavailable;
 if(row.url){photo.src=row.url;$('original').hidden=false;}
 else{photo.removeAttribute('src');$('original').hidden=true;unavailable();photoStatus.textContent='这条历史记录没有图片文件。';}
 $('prev').disabled=index===0;$('next').disabled=index===detailRows.length-1;
 $('position').textContent=`${index+1} / ${detailRows.length}`;
 for(const pane of detail.querySelectorAll('.ld-main,.ld-inspector,.ld-layout,.ld-heading'))pane.scrollTop=0;
 if(!detail.open)detail.showModal();
}
document.addEventListener('lumina-media-deleted',event=>{
 const media=event.detail,identity=window.luminaMediaMenu.key(media),matches=row=>window.luminaMediaMenu.same(row,media),selected=detailRows[active],removed=matches(selected);
 allRows=allRows.filter(row=>!matches(row));rows=rows.filter(row=>!matches(row));signature='';total=rows.length;
 for(const card of [...$('grid').children])if(card.dataset.mediaKey===identity){for(const node of card.children)sizeObserver.unobserve(node);pendingCards.delete(card);card.remove();}
 shown=$('grid').children.length;more.hidden=shown>=rows.length;
 $('count').textContent=`共 ${allRows.length} 张 · 匹配 ${rows.length} 张`;$('status').textContent=rows.length?'':'没有匹配的输出。';buildTags();
 detailRows=detailRows.filter(row=>!matches(row));
 if(detail.open){
  if(removed){if(originalViewer.open)originalViewer.close();if(detailRows.length)show(Math.min(active,detailRows.length-1));else closeDetail();}
  else{active=detailRows.indexOf(selected);$('position').textContent=`${active+1} / ${detailRows.length}`;$('prev').disabled=active<=0;$('next').disabled=active>=detailRows.length-1;}
 }
});
function closeDetail(){if(detail.open)detail.close();}
$('close').onclick=closeDetail;
for(const button of detail.querySelectorAll('[data-detail-back]'))button.onclick=closeDetail;
$('prev').onclick=()=>show(active-1);$('next').onclick=()=>show(active+1);
detail.addEventListener('close',()=>{
 if(originalViewer.open)originalViewer.close();
 ++detailRevision;++openRequest;photo.onload=null;photo.onerror=null;
 if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
 else $('search').focus({preventScroll:true});
 for(const [node,left,top] of returnScroll)if(node.isConnected)node.scrollTo(left,top);
 returnScroll=[];returnFocus=null;
});
detail.addEventListener('keydown',event=>{
 if(event.target.closest('input,textarea,select,[contenteditable="true"]')||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
 if(event.key==='ArrowLeft'&&active>0){event.preventDefault();show(active-1);}
 if(event.key==='ArrowRight'&&active<detailRows.length-1){event.preventDefault();show(active+1);}
});
$('copy').onclick=async()=>{
 const row=detailRows[active],revision=detailRevision;if(!row?.prompt?.trim())return;
 try{await navigator.clipboard.writeText(row.prompt);if(revision===detailRevision)$('copy-status').textContent='已复制提示词';}
 catch{if(revision===detailRevision)$('copy-status').textContent='复制失败，请选择正文手动复制';}
};
if($('refresh'))$('refresh').onclick=load;
$('search').oninput=()=>{clearTimeout(timer);timer=setTimeout(render,150);};
if(embedded){
 for(const input of document.querySelectorAll('[name=output-rating],[name=output-sort]'))input.onchange=()=>{const menu=input.closest('details');menu.open=false;menu.querySelector('summary').focus();render();};
 const menus=[...document.querySelectorAll('#output-toolbar details')];
 for(const menu of menus)menu.addEventListener('toggle',()=>{if(menu.open)for(const other of menus)if(other!==menu)other.open=false;});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=menus.find(m=>m.open);if(menu){menu.open=false;menu.querySelector('summary').focus();}}});
 $('tag-search').oninput=filterTags;$('clear-tags').onclick=()=>{activeTags.clear();buildTags();render();};
 document.addEventListener('click',e=>{for(const menu of document.querySelectorAll('#output-toolbar details[open]'))if(!menu.contains(e.target))menu.open=false;});
}window.addEventListener('focus',()=>{if(!$('detail').open&&Date.now()-lastLoaded>30000)load();});load();

})();
