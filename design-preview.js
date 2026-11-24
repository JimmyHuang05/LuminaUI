(() => {
  const design = new URLSearchParams(location.search).get('design');
  document.body.dataset.design = design;
  const content = {
    gallery: [
      ['光，折成一件作品。','用本地 Qwen-Image-2.1 创作。从这件玻璃习作开始。'],
      ['一道光，一种材质。','“钴蓝色半透明玻璃带，在朱红色展厅里折叠。侧面的日光穿过玻璃，投下棱镜状的反射。”'],
      ['从画框，到画布。','在工作台调整描述与画幅。每次生成的作品都保存在本机，可从输出库重新打开。'],
      ['布置你的工作室。','首次准备约需下载 19.4 GB。请预留 40 GB 空间；已验证的资源将直接复用。'],
      ['工作室已就绪。','模型与工作流已连接。从首页开始你的第一件作品。']
    ],
    canvas: [
      ['给想法一张画布。','欢迎使用 LuminaUI。写下一句描述，就能在自己的电脑上生成图像。'],
      ['试试不同的画幅。','点选下面的比例，看看同一张样图在画布里的构图变化。'],
      ['作品就在这里。','生成之后，可以在输出库查看作品、找到提示词，再回到画布继续尝试。'],
      ['准备好你的画布。','接下来会下载并验证运行环境和模型。首次下载约 19.4 GB，建议预留 40 GB 空间。'],
      ['开始创作吧。','你的本地工作台已经准备好了。']
    ],
    system: [
      ['设置 LuminaUI','完成一次本地设置，即可使用 Qwen-Image-2.1 生成图像。'],
      ['了解本机要求','准备支持 CUDA 的 NVIDIA 显卡、可用的网络连接，以及约 40 GB 可用磁盘空间。'],
      ['找到你的作品','工作流随应用安装。作品默认保存在安装目录的 ComfyUI/output 文件夹中。'],
      ['安装资源','下载、安装和校验完成后，将连接本地引擎。中断后可继续准备。'],
      ['设置完成','资源校验已完成，可以进入 LuminaUI 首页。']
    ]
  };
  const art=document.querySelector('.art');
  const stage=document.createElement('div');stage.className='variant-art';art.append(stage);
  const picker=document.createElement('div');picker.className='ratio-picker';
  picker.setAttribute('aria-label','样图画幅');
  document.getElementById('copy').after(picker);
  for (const ratio of ['1:1','3:4','16:9']) {
    const btn=document.createElement('button');btn.type='button';btn.textContent=ratio;
    btn.onclick=()=>{stage.style.setProperty('--aspect',ratio.replace(':',' / ')); for(const sibling of picker.children)sibling.setAttribute('aria-pressed',String(sibling===btn));};
    picker.append(btn);
  }
  picker.firstChild.click();
  const skip=document.createElement('button');skip.className='skip';skip.textContent='直接准备资源';document.querySelector('nav').prepend(skip);
  skip.onclick=()=>{page=3;render();};
  const shapes='<div class="prism"><i></i><i></i><i></i></div>';
  const files='<div class="folders"><b>ComfyUI</b><span>└　output</span><span>　　└　文生图</span></div>';
  const stages=['环境检查','模型下载','工作流校验'];
  const list=stages.map((x,i)=>'<div class="sys-row"><span>'+['◈','↓','✓'][i]+'</span>'+x+'</div>').join('');
  let previous=-1;
  function paint(){
    document.getElementById('title').textContent=content[design][page][0];document.getElementById('copy').textContent=content[design][page][1];
    picker.hidden=design!=='canvas'||page!==1;skip.hidden=design!=='canvas'||page>=3;
    if(previous===page)return;
    previous=page;
    const images=['<img src="docs/images/glass-study.jpg" alt="钴蓝色玻璃雕塑">','<img src="docs/images/qwen-studio.jpg" alt="蓝色陶瓷茶壶">','<img src="docs/images/index.png" alt="本地工作台">'];
    stage.innerHTML=design==='gallery'?[images[0],images[0],images[2],'<div class="mount">'+images[0]+'</div>',''][page]:
      design==='canvas'?[images[1],images[1],images[2],shapes,''][page]:
      [shapes,list,files,list,''][page];
    if(design==='gallery')document.querySelector('.sample').textContent='玻璃习作　/　Qwen-Image-2.1';
  }
  window.addEventListener('intro-render',paint);paint();
})();
