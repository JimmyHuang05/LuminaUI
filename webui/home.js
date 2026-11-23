(() => {
  const $ = id => document.getElementById(id);
  const now = new Date();
  $('date').textContent = now.toLocaleDateString('zh-CN', {month:'long',day:'numeric',weekday:'long'});
  $('welcome-time').textContent = now.getHours() < 6 ? '夜深了，欢迎回来。' : now.getHours() < 12 ? '上午好，欢迎回来。' : now.getHours() < 18 ? '下午好，欢迎回来。' : '晚上好，欢迎回来。';
  const element = (tag, className, text) => {const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
  const date = value => {const d=new Date(Number(value)*1000);return Number.isFinite(d.getTime())?d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'时间未记录';};
  const route = url => {
    if(location.protocol !== 'file:')return url;
    const target=new URL(url,'http://preview');
    const pages={'/workbench':'index.html','/resources':'resources.html','/generated':'generated.html','/image-reader':'image-reader.html','/pe-chat':'pe-chat.html'};
    return (pages[target.pathname]||'home.html')+target.search;
  };
  function empty(host, text, href, label) {
    const content=element('div','empty',text);
    if(href){const a=element('a','',label);a.href=route(href);content.append(a);}
    host.replaceChildren(content);
  }
  async function request(path){const response=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('本地服务暂不可用');return response.json();}
  function summary(data) {
    $('image-count').textContent=Number(data.image_count||0).toLocaleString();
    $('prompt-count').textContent=Number(data.prompt_count||0).toLocaleString();
    $('engine-state').textContent=data.online?'引擎已连接':'引擎未连接';
    $('engine-state').classList.toggle('online',!!data.online);
    $('queue-dot').classList.toggle('ready',!!data.online);
    $('queue-label').textContent=data.active_jobs?`${data.active_jobs} 个任务进行中`:data.online?'引擎就绪':'引擎离线';
    const images=$('recent-images');images.replaceChildren();
    if(!data.images?.length)empty(images,'这里将展示最近生成的作品。','/workbench','创作第一张图片 ↗');
    for(const row of data.images||[]){
      const card=element('a','image-card');card.href=route('/resources?'+new URLSearchParams({view:'output',output_image:row.url}));card.setAttribute('aria-label','查看输出：'+(row.title||'生成图片'));
      const wrap=element('span','image-wrap');const img=element('img');img.src=row.url;img.alt=row.title||'生成图片';img.loading='lazy';img.decoding='async';
      img.onerror=()=>{img.remove();wrap.append(element('span','empty','图片暂不可用'));};wrap.append(img);
      const caption=element('span','image-caption');caption.append(element('b','',row.title||'生成图片'),element('small','',date(row.created)));
      card.append(wrap,caption);images.append(card);
    }
    const recent=$('recent-prompts');recent.replaceChildren();
    if(!data.recent?.length)empty(recent,'使用过的提示词会出现在这里。','/resources','浏览提示词库 ↗');
    for(const row of data.recent||[]){
      const item=element('div','prompt-row');const content=element('div','prompt-copy');content.title=row.title;
      content.append(element('b','',row.title),element('small','',date(row.used_at)+' · 提示词'));
      const link=element('a','text-link','↗');link.setAttribute('aria-label','继续使用 '+row.title);link.href=route('/workbench?prompt_id='+encodeURIComponent(row.id));
      item.append(element('span','prompt-symbol','≡'),content,link);recent.append(item);
    }
  }
  const finite = value => typeof value==='number' && Number.isFinite(value);
  function device(label,name,percent,detail){
    const box=element('div','device'),head=element('div','device-label');head.append(element('span','',label),element('span','',finite(percent)?Math.round(percent)+'%':''));
    const deviceName=element('p','device-name',name);deviceName.title=name;box.append(head,deviceName);
    if(finite(percent)){const meter=element('span','meter'),fill=element('span');fill.style.width=Math.min(100,Math.max(0,percent))+'%';meter.setAttribute('role','meter');meter.setAttribute('aria-label',label+'使用率');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.setAttribute('aria-valuenow',String(Math.min(100,Math.max(0,percent))));meter.append(fill);box.append(meter);}
    if(detail)box.append(element('div','device-meta',detail));return box;
  }
  function hardware(data){
    const host=$('hardware');host.replaceChildren();
    const strip=$('hardware-summary');strip.replaceChildren();
    if(data.unavailable){const message=data.failed?'设备数据暂不可用':'预览模式';strip.append(element('span','hardware-unavailable',message));empty(host,data.failed?'设备信息暂不可用，请稍后刷新。':'正式运行时显示本机设备信息。');$('hardware-time').textContent='';return;}
    const gpu=(data.gpus||[]).find(g=>finite(g.used_gb)&&finite(g.total_gb))||data.gpus?.[0], memory=data.memory||{};
    for(const [label,value] of [['GPU',finite(gpu?.usage_percent)?Math.round(gpu.usage_percent)+'%':'—'],['显存',finite(gpu?.used_gb)&&finite(gpu?.total_gb)?`${gpu.used_gb} / ${gpu.total_gb} GB`:'—'],['内存',finite(memory.usage_percent)?Math.round(memory.usage_percent)+'%':'—']]){const item=element('span','hardware-stat');item.append(element('span','',label),element('b','',value));strip.append(item);}
    strip.title=gpu?.name||'显卡信息暂不可用';
    for(const gpu of data.gpus||[]){const memory=finite(gpu.used_gb)&&finite(gpu.total_gb)?`显存 ${gpu.used_gb} / ${gpu.total_gb} GB`:'显存数据暂不可用';host.append(device('GPU · 显卡',gpu.name||'未知显卡',gpu.usage_percent,memory));}
    if(!data.gpus?.length)host.append(device('GPU · 显卡','未检测到显卡信息',null,''));
    const cpu=data.cpu||{},mem=data.memory||{};
    host.append(device('CPU · 处理器',cpu.name||'暂不可用',cpu.usage_percent,[cpu.cores?cpu.cores+' 核心':'',cpu.threads?cpu.threads+' 线程':''].filter(Boolean).join(' · ')));
    host.append(device('RAM · 内存',finite(mem.total_gb)?mem.total_gb+' GB':'暂不可用',mem.usage_percent,finite(mem.used_gb)?'当前已使用 '+mem.used_gb+' GB':''));
    $('hardware-time').textContent=[data.os,'更新于 '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})].filter(Boolean).join(' · ');
  }
  let busy=false,lastSummary=0;
  async function refresh(full=true){
    if(busy)return;busy=true;$('refresh').disabled=true;
    const tasks=[request('/api/hardware').then(hardware).catch(()=>hardware({unavailable:true,failed:true}))];
    if(full||Date.now()-lastSummary>30000)tasks.push(request('/api/dashboard').then(data=>{summary(data);lastSummary=Date.now();}).catch(()=>{
      $('engine-state').textContent='服务未连接';$('engine-state').classList.remove('online');$('queue-dot').classList.remove('ready');$('queue-label').textContent='等待本地服务';
      if(!lastSummary){empty($('recent-images'),'作品暂时无法读取，请点击右上角刷新。');empty($('recent-prompts'),'使用记录暂时无法读取。');}
      $('updated').textContent='记录同步失败，请稍后刷新';
    }));
    try{await Promise.allSettled(tasks);if(lastSummary&&Date.now()-lastSummary<30000)$('updated').textContent='记录已同步至 '+new Date(lastSummary).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}
    finally{busy=false;$('refresh').disabled=false;}
  }
  $('refresh').onclick=()=>refresh();
  $('hardware-details').addEventListener('toggle',event=>$('hardware-toggle').setAttribute('aria-expanded',String(event.newState==='open')));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('focus',()=>{if(Date.now()-lastSummary>10000)refresh();});
  setInterval(()=>{if(!document.hidden)refresh(false);},15000);
  refresh();
})();
