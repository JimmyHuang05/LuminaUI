(() => {
  if (legacyPreview) return;
  const art = document.querySelector('.art');
  const story = document.querySelector('.story');
  const title = document.getElementById('title');
  const copy = document.getElementById('copy');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelector('.dots').append(document.createElement('i'));
  art.innerHTML = '<figure><img class="feature-image"><figcaption></figcaption></figure>';
  const image = art.querySelector('img');
  const caption = art.querySelector('figcaption');

  const features = [
    ['生成图像','写下画面描述，选择画幅，用 Qwen-Image-2.1 生成图像。','glass-study.jpg','玻璃习作 · 本地生成样张'],
    ['调整参数','在工作台调整种子、采样步数和画幅，尝试同一描述的不同版本。','index.png','LuminaUI 工作台'],
    ['收藏提示词','把常用描述收进提示词库，下次构图时可以再次使用。','resources.png','LuminaUI 提示词库']
  ];
  let selected = 0;
  const chooser = document.createElement('div');
  chooser.className = 'feature-picker';
  chooser.setAttribute('role','group');
  chooser.setAttribute('aria-label','功能预览');
  copy.after(chooser);
  function showFeature(index) {
    selected = index;
    const [, description, file, label] = features[index];
    copy.textContent = description;
    image.src = 'docs/images/' + file;
    image.alt = label;
    caption.textContent = label;
    art.classList.toggle('screenshot', index !== 0);
    Array.from(chooser.children).forEach((button,i) => button.setAttribute('aria-pressed', String(i === index)));
  }
  features.forEach(([label],index) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => showFeature(index);
    chooser.append(button);
  });

  const advantages = document.createElement('div');
  advantages.className = 'advantages';
  advantages.innerHTML = '<section><h2>内置工作流</h2><p>模型与节点已经配好。资源就绪后，输入描述即可开始。</p></section><section><h2>本地 API</h2><p>脚本可以提交生成任务，并查询运行状态。</p></section>';
  chooser.after(advantages);
  const apiPanel = document.createElement('aside');
  apiPanel.className = 'api-panel';
  apiPanel.setAttribute('aria-label','本地 HTTP 接口');
  apiPanel.innerHTML = '<div class="endpoint"><i></i>本地 HTTP 服务</div><strong>127.0.0.1</strong><span class="port">端口 18290</span><dl><div><dt>POST</dt><dd>/api/generate</dd></div><div><dt>GET</dt><dd>/api/status</dd></div></dl>';
  art.after(apiPanel);
  const serviceView = document.createElement('div');
  serviceView.append(...apiPanel.childNodes);
  const resources = document.getElementById('resources');
  apiPanel.append(serviceView,resources);
  const summary = document.createElement('div');
  summary.className = 'download-summary';
  summary.innerHTML = '<div class="endpoint"><i></i><span></span></div><strong><span></span><small></small></strong>';
  resources.prepend(summary);
  function showMetric(label,value,unit) {
    summary.querySelector('.endpoint span').textContent = label;
    summary.querySelector('strong span').textContent = value;
    summary.querySelector('small').textContent = unit;
  }
  const downloadNotes = document.createElement('div');
  downloadNotes.className = 'advantages';
  downloadNotes.innerHTML = '<section><h2>支持续传</h2><p>如果下载中断，重新打开即可继续。</p></section><section><h2>自动校验</h2><p>已通过校验的文件会直接复用。</p></section>';
  advantages.after(downloadNotes);

  const skip = document.createElement('button');
  skip.textContent = '跳过'; skip.className = 'canvas-skip';
  document.querySelector('nav').prepend(skip);
  skip.onclick = () => { page = 3; render(); };
  const rows = [...document.querySelectorAll('#resources li')];
  const components = [
    ['运行环境','Python、PyTorch 与 ComfyUI','2.1 GB'],
    ['生成模型','主模型、文本编码器与 VAE','17.3 GB'],
    ['文生图工作流','随 LuminaUI 提供','已安装']
  ];
  rows.forEach((row,i) => {
    const [label, detail, status] = components[i];
    row.innerHTML = '<div><b>'+label+'</b><small>'+detail+'</small></div><span>'+status+'</span>';
  });

  const appearance = document.createElement('fieldset');
  appearance.className = 'appearance-options';
  appearance.setAttribute('aria-labelledby','title');
  const systemLight = matchMedia('(prefers-color-scheme: light)');
  function previewAppearance() {
    const mode = appearance.querySelector(':checked').value;
    document.body.dataset.finishTone = mode === 'system' ? (systemLight.matches ? 'light' : 'dark') : mode;
  }
  for (const [mode,label] of [['light','浅色'],['dark','深色'],['system','跟随系统']]) {
    const option = document.createElement('label');
    option.innerHTML = '<input type="radio" name="appearance" value="'+mode+'"><i aria-hidden="true"><b></b></i><span>'+label+'</span>';
    option.firstChild.checked = mode === 'dark';
    appearance.append(option);
  }
  document.getElementById('notice').before(appearance);
  appearance.addEventListener('change',previewAppearance);
  systemLight.addEventListener('change',previewAppearance);
  previewAppearance();
  document.getElementById('enter').textContent = '进入首页';

  let previous = '';
  function sync() {
    const scene = page + (ready && page===3 ? '-ready' : '');
    document.body.dataset.ready = String(ready);
    document.getElementById('chapter').textContent = ['欢迎','功能介绍','本地优先','资源下载','个性化设置'][page];
    if (page === 0) title.innerHTML = '<small>欢迎使用</small>Lumina<span>UI</span>';
    chooser.hidden = art.hidden = page !== 1;
    if (page===1) showFeature(selected);
    apiPanel.hidden = page !== 2 && page !== 3;
    serviceView.hidden = advantages.hidden = page !== 2;
    downloadNotes.hidden = page !== 3 || ready;
    apiPanel.setAttribute('aria-label',page===3?'本地资源状态':'本地 HTTP 接口');
    if(page===3 && !busy) {
      if(ready) showMetric('组件已就绪','3','/ 3');
      else showMetric('首次完整下载约','19.4','GB');
    }
    appearance.hidden = page !== 4;
    skip.hidden = page >= 3;
    art.removeAttribute('aria-hidden');
    if (!busy) rows.forEach((row,i) => {
      row.dataset.state = ready || i===2 ? 'done' : 'waiting';
      row.lastElementChild.textContent = ready && i<2 ? '已就绪' : components[i][2];
    });
    if (previous !== scene && !reduced.matches) {
      story.getAnimations().forEach(animation => animation.cancel());
      story.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],
        {duration:400,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
    previous = scene;
  }
  window.addEventListener('intro-render',sync);
  window.addEventListener('intro-progress',({detail}) => {
    if (detail.state !== 'working') return;
    const phase = (detail.phase || 'runtime').trim();
    const stage = ['runtime','extract','cuda'].includes(phase) ? 0 : phase==='engine' ? 2 : 1;
    if(detail.total>0) {
      const percent = Math.min(100,Math.floor(100*(detail.bytes || 0)/detail.total));
      showMetric('当前文件下载进度',String(percent),'%');
    } else {
      showMetric(['准备运行环境','准备生成模型','连接本地引擎'][stage],String(stage+1),'/ 3');
    }
    rows.forEach((row,i) => {
      row.dataset.state = i === 2 || i < stage ? 'done' : i === stage ? 'active' : 'waiting';
      row.lastElementChild.textContent = i === 2 ? '已安装' : i < stage ? '已就绪' : i === stage ? ['准备中','下载或校验中'][i] : components[i][2];
    });
  });
  sync();
})();
