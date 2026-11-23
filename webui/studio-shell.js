(() => {
  const pages = {
    resources:{title:'提示词库',description:'收藏画面，延续灵感。',note:'提示词与生成输出'},
    generated:{title:'输出库',description:'每一次创作，都有迹可循。',note:'最近生成优先'},
    reader:{title:'图片反推',description:'读懂画面，让灵感成为文字。',note:'图像识别'},
    chat:{title:'PE 对话',description:'从一个想法开始，和 PE 一起打磨。',note:'对话记录保存在本机'}
  };
  function mount(){
    const kind=document.body.dataset.studioPage, config=pages[kind];
    if(!config||document.querySelector('.studio-shell'))return;
    const shell=document.createElement('div');shell.className='studio-shell';
    shell.innerHTML=`<header class="studio-topbar"><a class="studio-brand" href="${location.protocol==='file:'?'home.html':'/'}" aria-label="返回首页">Lumina<span>UI</span></a><nav aria-label="页面导航"><span class="studio-breadcrumb"></span><a class="studio-home" href="${location.protocol==='file:'?'home.html':'/'}">返回首页 ↗</a></nav></header><section class="studio-heading"><div><h1></h1><p></p></div><span class="studio-note"></span></section><div class="studio-tools" aria-label="页面工具"></div><main class="studio-content"></main><footer class="studio-footer"><span class="studio-signature">LUMINA · 私人创作空间</span><div class="studio-status" role="status"></div></footer>`;
    shell.querySelector('h1').textContent=config.title;shell.querySelector('.studio-heading p').textContent=config.description;shell.querySelector('.studio-breadcrumb').textContent=config.title;shell.querySelector('.studio-note').textContent=config.note;
    const tools=shell.querySelector('.studio-tools'),content=shell.querySelector('.studio-content'),status=shell.querySelector('.studio-status');
    const move=(selector,parent)=>{const node=document.querySelector(selector);if(node)parent.append(node);return node;};
    if(kind==='resources'){
      move('.collection-types',tools);move('.toolbar',tools);move('.result-line',tools);
      move('#gallery',content);move('#empty',content);move('#output-panel',content);move('#output-toolbar',tools);
      document.querySelector('.page')?.remove();
    }else if(kind==='generated'){
      move('.toolbar',tools);move('#grid',content);move('#count',status);move('#status',status);
      document.querySelector('body>header')?.remove();document.querySelector('body>main')?.remove();
    }else if(kind==='reader'){
      move('.controls',tools);move('#recognize',tools);move('.workspace',content);move('#status',status);
      document.querySelector('.page')?.remove();
    }else if(kind==='chat'){
      move('.pe-chat-tools',tools);move('.pe-chat-status',status);move('#pe-chat-panel',content);
      content.querySelector('.pe-chat-heading')?.remove();
    }
    document.body.prepend(shell);document.body.classList.add('studio-page');
    if(kind==='resources'){
      const output=document.getElementById('output-panel');
      const positions={prompt:0,output:0};let selected=null;
      function selectView(view){
        if(selected===view)return;
        if(selected)positions[selected]=content.scrollTop;
        selected=view;
        const isOutput=view==='output';shell.classList.toggle('library-output',isOutput);output.hidden=!isOutput;
        for(const button of tools.querySelectorAll('[data-library-view]'))button.setAttribute('aria-pressed',String(button.dataset.libraryView===view));
        const url=new URL(location.href);if(isOutput)url.searchParams.set('view','output');else url.searchParams.delete('view');history.replaceState(null,'',url);
        window.dispatchEvent(new Event('resize'));
        // The prompt masonry measures its height on resize; restore after that layout settles.
        requestAnimationFrame(()=>requestAnimationFrame(()=>{if(selected===view)content.scrollTop=positions[view];}));
      }
      for(const button of tools.querySelectorAll('[data-library-view]'))button.onclick=()=>selectView(button.dataset.libraryView);
      selectView(new URLSearchParams(location.search).get('view')==='output'?'output':'prompt');
    }
    // Preserve the existing listeners and controls while giving each page the same frame.
    window.dispatchEvent(new Event('resize'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
