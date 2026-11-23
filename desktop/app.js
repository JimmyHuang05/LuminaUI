const $ = selector => document.querySelector(selector);
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200); }
const pages = {
  generate: ['图像生成', '让想象，有迹可循。', '从一句描述开始，探索画面的更多可能。', '下一张作品，始于你的想象'],
  edit: ['图像编辑', '让好画面，再进一步。', '替换、重绘、调整，让每一个细节恰到好处。', '放入图片，开启新的可能'],
  upscale: ['画质提升', '细节之中，自有天地。', '为值得保留的画面，留下更清晰的细节。', '让每一个细节，都被看见'],
  reader: ['图片反推', '读懂画面，捕捉灵感。', '从构图、光线与风格中，发现创作的线索。', '一张图片，也是一份灵感'],
  gallery: ['我的图库', '每一次灵感，都值得留存。', '在这里回看、整理，继续未完成的想象。'],
  resources: ['资源库', '为创作，收集更多可能。', '把常用的模型、LoRA 和提示词放在手边。'],
  settings: ['偏好设置', '让工作空间，更适合你。', '调整界面和创作偏好，找到舒服的节奏。']
};
function heading(data) { return `<div class="heading"><div><div class="eyebrow">YOUR PERSONAL STUDIO</div><h1>${data[1]}</h1><p>${data[2]}</p></div></div>`; }
function navigate(page) {
  document.querySelectorAll('.nav').forEach(button => { const active = button.dataset.page === page; button.classList.toggle('active', active); if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  const data = pages[page]; $('#breadcrumb').textContent = data[0];
  const isWorkbench = ['generate','edit','upscale','reader'].includes(page);
  $('#workbench').hidden = !isWorkbench; $('#other-page').hidden = isWorkbench;
  if(isWorkbench) {
    $('#title').textContent = data[1]; $('#subtitle').textContent = data[2]; $('#empty-title').textContent = data[3];
    $('#reference').hidden = page === 'generate' && !document.querySelector('[data-mode="reference"]').classList.contains('selected');
    $('#mode-tabs').hidden = page !== 'generate'; $('#prompt-label').textContent = page === 'edit' ? '描述你想调整的内容' : page === 'reader' ? '关注的画面细节' : '画面描述';
    $('#empty-copy').innerHTML = page === 'generate' ? '在右侧写下画面描述<br>让还没发生的灵感，在这里成形' : '添加一张参考图片<br>这里将展示你的创作结果';
    return;
  }
  let content = heading(data);
  if(page === 'gallery') content += `<div class="filter-bar"><button class="secondary" data-notice="当前没有作品可筛选">全部作品 · 0</button><input aria-label="搜索作品" placeholder="搜索作品或提示词…" id="gallery-search"></div><div class="page-empty"><span>▦</span><h2>你的作品集，正在等第一张图</h2><p>当前为 UI 预览，尚无生成记录。</p><button class="secondary" id="go-create">开始一次创作 ↗</button></div>`;
  if(page === 'resources') content += `<div class="resource-grid">${[['◇','创作模型','Z-Image Turbo / Qwen Image 2.1','管理用于生成与编辑的模型'],['◎','LoRA 收藏','风格与人物的一致性','整理常用的风格和人物资源'],['✧','提示词灵感','把好想法收进灵感库','保存描述，快速复用创作思路']].map(item=>`<article class="resource-card"><span>${item[0]}</span><h2>${item[1]}</h2><p>${item[2]}<br>${item[3]}</p><button class="secondary" data-notice="${item[1]}管理将在后续接入">查看资源 ↗</button></article>`).join('')}</div><p class="hint">此处为资源分类示意，未读取本机模型或收藏。</p>`;
  if(page === 'settings') content += `<div class="settings-list"><div class="setting-row"><div><h2>界面外观</h2><p>当前设计方向：深色工作空间与柔和的鼠尾草绿。</p></div><span class="preview-badge">深色 · SAGE</span></div><div class="setting-row"><div><h2>启动页面</h2><p>用于预览设置控件，不会更改实际启动行为。</p></div><select aria-label="启动页面"><option>图像生成</option><option>我的图库</option></select></div><div class="setting-row"><div><h2>输出目录</h2><p>接入功能后，可在这里选择作品保存位置。</p></div><button class="secondary" data-notice="目录选择将在接入本地功能后启用">选择文件夹</button></div><div class="setting-row"><div><h2>关于 LuminaUI</h2><p>个人图像创作工作空间 · 桌面界面探索版</p></div><span class="subtle">0.1.0 / UI PREVIEW</span></div></div>`;
  $('#other-page').innerHTML = content;
  $('#go-create')?.addEventListener('click', () => navigate('generate'));
  $('#gallery-search')?.addEventListener('input', event => { $('#other-page .page-empty h2').textContent = event.target.value ? '没有找到匹配的作品' : '你的作品集，正在等第一张图'; });
}
document.querySelectorAll('.nav').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
document.addEventListener('click', event => { const button = event.target.closest('[data-notice]'); if(button) toast(button.dataset.notice); });
$('.brand').addEventListener('click', event => { event.preventDefault(); navigate('generate'); });
$('#prompt').addEventListener('input', () => $('#count').textContent = `${$('#prompt').value.length} / 2000`);
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-mode]').forEach(item=>item.classList.toggle('selected',item===button)); $('#reference').hidden = button.dataset.mode === 'text'; }));
const dimensions = {'1:1':'1024 × 1024','4:5':'1024 × 1280','3:2':'1536 × 1024','16:9':'1536 × 864'};
document.querySelectorAll('[data-ratio]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-ratio]').forEach(item=>item.classList.toggle('selected',item===button)); $('#ratio-label').textContent=button.dataset.ratio; $('#dimensions').textContent=dimensions[button.dataset.ratio]; }));
document.querySelectorAll('.quantities button').forEach(button => button.addEventListener('click', () => document.querySelectorAll('.quantities button').forEach(item => item.classList.toggle('selected',item===button))));
$('#steps').addEventListener('input', () => $('#step-value').textContent = $('#steps').value);
$('#inspiration').addEventListener('click', () => { $('#prompt').value='清晨的山间木屋，薄雾漫过松林，温柔的自然光洒在木质窗台，远山层叠，安静的电影感构图，低饱和绿色与温暖的胶片质感。'; $('#prompt').dispatchEvent(new Event('input')); });
$('#reset').addEventListener('click', () => { $('#prompt').value=''; $('#prompt').dispatchEvent(new Event('input')); $('#seed').value=''; $('#steps').value=20; $('#step-value').textContent=20; $('#model').selectedIndex=0; document.querySelector('[data-ratio="4:5"]').click(); document.querySelector('.quantities button').click(); toast('已重置当前创作设置'); });
$('#help').addEventListener('click', () => toast('这是桌面界面原型，可切换页面、调整参数；尚未连接生成服务。'));
$('#upload').addEventListener('click', () => toast('参考图区域布局预览，文件上传将在后续接入。'));
$('#view-gallery').addEventListener('click', () => navigate('gallery'));
$('#expand').addEventListener('click', () => $('#preview-dialog').showModal());
$('#close-dialog').addEventListener('click', () => $('#preview-dialog').close());
$('#generate').addEventListener('click', () => { $('#preview-dialog').showModal(); toast('仅展示画布视觉效果，没有提交生成任务。'); });
navigate('generate');
