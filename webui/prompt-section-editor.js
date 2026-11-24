(() => {
  const legacyFields = [
    ['Subject Description','人物'],['Clothing & Accessories','衣着'],
    ['Action & Pose','动态'],['Scene / Background','场景'],
    ['Composition / View','镜头'],['Lighting & Color','光线与色彩'],
    ['Style & Texture','风格与质感'],['Essential Constraints','关键约束']
  ];
  const groups = window.promptFieldGroups;
  const fields=groups.flatMap(([,fields])=>fields);
  const aliases = {'Composition / Camera':'Composition / View','Essential Pose Emphasis':'Action & Pose'};
  function parse(text) {
    const matches=[...text.matchAll(/^[ \t]*(?:#{1,6}[ \t]+)?\[([^\]\r\n]+)\][ \t]*\r?\n?/gm)];
    const parts=[];
    if(!matches.length){if(text)parts.push({name:'未分节内容',start:0,end:text.length});}
    else {
      if(text.slice(0,matches[0].index).trim())parts.push({name:'未分节内容',start:0,end:matches[0].index});
      matches.forEach((m,i)=>parts.push({name:m[1],start:m.index+m[0].length,end:matches[i+1]?.index??text.length}));
    }
    return parts;
  }
  // scrollHeight is rounded to whole pixels; snap to exact line boxes so
  // swapping the preview for the textarea doesn't change short card heights.
  function fitInput(input) {
    if(!input.getClientRects().length)return;
    const mirror=input.cloneNode(false),computed=getComputedStyle(input);
    mirror.removeAttribute('id');mirror.removeAttribute('aria-label');mirror.setAttribute('aria-hidden','true');mirror.tabIndex=-1;
    mirror.value=input.value;
    mirror.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;height:0;min-height:0;max-height:none;padding:0;border:0;overflow:hidden;box-sizing:border-box;';
    for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing','whiteSpace','overflowWrap'])mirror.style[key]=computed[key];
    // Imported editors hide body siblings. Measure inside the visible editor so
    // its page-level hiding rule cannot collapse the mirror to a single line.
    mirror.style.setProperty('width',input.getBoundingClientRect().width+'px','important');input.parentElement.append(mirror);
    const height=Math.max(parseFloat(computed.lineHeight),mirror.scrollHeight);mirror.remove();
    if(Math.abs(input.getBoundingClientRect().height-height)>.5)input.style.height=height+'px';
  }

  const css=document.createElement('style');css.textContent=`.prompt-composer-dialog .prompt-field-group{border:0;border-bottom:1px solid var(--day-line,#333);border-radius:0;background:none;padding:0 0 10px;margin:0}.prompt-composer-dialog .prompt-field-group>.prompt-group-body{gap:6px}.prompt-composer-dialog .prompt-section-field.is-empty>summary{padding:10px 14px}.prompt-field-group>summary{cursor:pointer;padding:10px 2px;font-size:13px;color:var(--day-ink,#ddd)}.prompt-group-body{display:grid;gap:8px}.prompt-composer-dialog .prompt-section-field.is-empty>summary{cursor:pointer!important;pointer-events:auto!important}.prompt-composer-dialog .prompt-section-field.is-empty .module-card-arrow{display:block}.prompt-composer-dialog .prompt-section-field.is-empty textarea{min-height:44px}.prompt-composer-dialog .prompt-section-field.is-empty .module-card-top{opacity:.75}`;document.head.append(css);
  css.textContent+=`.prompt-composer-dialog .prompt-section-plain .prompt-field-group{display:contents!important}.prompt-section-plain .prompt-field-group>summary{display:none!important}.prompt-composer-dialog .prompt-section-plain .prompt-section-grid,.prompt-composer-dialog .prompt-section-plain .prompt-group-body{display:block!important}.prompt-composer-dialog .prompt-section-plain .prompt-section-field{border:0!important;border-bottom:1px solid var(--day-line,#ffffff10)!important;border-radius:0!important;background:none!important;padding:18px 0!important;margin:0!important;box-shadow:none!important}.prompt-composer-dialog .prompt-section-plain .prompt-section-field>summary{padding:0!important;list-style:none}.prompt-composer-dialog .prompt-section-plain .module-card-top{padding:0!important;min-height:0!important;gap:8px;margin:0 0 9px!important}.prompt-composer-dialog .prompt-section-plain .module-card-top>span:first-child{font-size:12px;font-weight:400;color:var(--day-secondary,#929292)}.prompt-section-plain .module-card-arrow{display:none!important}.prompt-section-plain .module-card-translation{display:block;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--day-secondary,#929292);font-size:11px;font-weight:400}.prompt-section-plain .module-card-translation:empty{display:none}.prompt-section-plain .module-card-top>span:first-child,.prompt-section-plain .module-card-copy{flex-shrink:0}.prompt-composer-dialog .prompt-section-plain .module-card-excerpt{display:block;max-height:none!important;-webkit-line-clamp:unset!important;white-space:pre-wrap;font-size:13px;line-height:1.95;color:var(--day-ink,#c5c5c5);margin:0!important;padding:0!important}.prompt-composer-dialog .prompt-section-plain .prompt-section-field[open] .module-card-excerpt{display:none!important}.prompt-composer-dialog .prompt-section-plain .prompt-section-field textarea{width:100%!important;margin:0!important;padding:0!important;font-size:13px!important;line-height:1.95!important;color:var(--day-ink,#c5c5c5)!important}.prompt-section-plain .module-card-copy{margin-left:auto;opacity:0;transition:opacity .15s}.prompt-section-plain .prompt-section-field:hover .module-card-copy,.prompt-section-plain .prompt-section-field:focus-within .module-card-copy{opacity:1}.prompt-section-plain:not(.show-empty-fields) .prompt-section-field.is-empty:not([open]){display:none!important}.prompt-empty-toggle{margin:18px 0 8px;background:none;border:0;color:var(--day-secondary,#888);padding:6px 0;font-size:11px;cursor:pointer}.prompt-empty-toggle:hover{color:var(--day-ink,#ddd)}`;
  css.textContent+=`.prompt-composer-dialog .prompt-section-plain .prompt-section-field textarea{display:block!important;min-height:0!important;max-height:none!important;height:auto;overflow:hidden!important;resize:none!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;outline:none!important;font-family:inherit;white-space:pre-wrap;cursor:text}.prompt-section-plain:not(.show-empty-fields) .prompt-section-field.is-empty:focus-within{display:block!important}.prompt-section-plain .module-card-top{display:flex;align-items:center}`;
  css.textContent+=`.prompt-composer-dialog .prompt-section-plain .prompt-section-field.first-content-field{padding-top:0!important}`;
  window.createPromptSectionEditor = (preview, getSummaries=()=>({})) => {
    const root=document.createElement('div');root.className='prompt-section-editor prompt-section-plain';root.tabIndex=-1;
    const grid=document.createElement('div');grid.className='prompt-section-grid';root.append(grid);
    const emptyToggle=document.createElement('button');emptyToggle.type='button';emptyToggle.className='prompt-empty-toggle';emptyToggle.textContent='显示空字段';emptyToggle.setAttribute('aria-pressed','false');emptyToggle.onclick=()=>{const show=root.classList.toggle('show-empty-fields');emptyToggle.textContent=show?'隐藏空字段':'显示空字段';emptyToggle.setAttribute('aria-pressed',String(show));requestAnimationFrame(()=>{for(const input of grid.querySelectorAll('textarea'))if(input.getClientRects().length)fitInput(input);});};root.append(emptyToggle);
    let rendered=null;
    const sync=(force=false)=>{
      const text=preview.value;if(!force&&text===rendered)return;rendered=text;grid.replaceChildren();
      const parts=parse(text);
      const entries=parts.map(p=>({...p,label:[...fields,...legacyFields].find(([name])=>name===(aliases[p.name]||p.name))?.[1]||p.name}));
      for(const [name,label] of fields)if(!parts.some(p=>(aliases[p.name]||p.name)===name))entries.push({name,label,missing:true});
      entries.sort((a,b)=>{const rank=x=>{const i=fields.findIndex(([n])=>n===(aliases[x.name]||x.name));return i<0?-1:i;};return rank(a)-rank(b);});
      const containers=new Map();
      for(const [title,items] of groups){
        const group=document.createElement('details');group.className='prompt-field-group';
        const heading=document.createElement('summary');heading.textContent=title;
        const body=document.createElement('div');body.className='prompt-group-body';group.append(heading,body);grid.append(group);
        for(const [key] of items)containers.set(key,body);
        group.open=true;
      }
      let legacy;
      for(const entry of entries){
        const label=document.createElement('section');label.className='prompt-section-field';
        const summary=document.createElement('div');const top=document.createElement('div');top.className='module-card-top';
        const excerpt=document.createElement('p');excerpt.className='module-card-excerpt';
        const copy=document.createElement('button');copy.type='button';copy.className='module-card-copy';copy.title='复制'+entry.label;copy.setAttribute('aria-label','复制'+entry.label);copy.innerHTML='<svg width=14 height=14 viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x=8 y=8 width=12 height=12 rx=2></rect><path d="M16 8V4H4v12h4"></path></svg>';
        copy.onclick=async e=>{e.preventDefault();e.stopPropagation();try{await navigator.clipboard.writeText(input.value);copy.textContent='已复制';setTimeout(()=>{copy.innerHTML='<svg width=14 height=14 viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x=8 y=8 width=12 height=12 rx=2></rect><path d="M16 8V4H4v12h4"></path></svg>';},1200);}catch{copy.textContent='重试';copy.title='复制失败，请选择正文手动复制';}};
        const heading=document.createElement('span');heading.textContent=entry.label;
        const translation=document.createElement('span');translation.className='module-card-translation';
        const input=document.createElement('textarea');input.setAttribute('aria-label',entry.label);input.placeholder='可留空';input.spellcheck=false;input.addEventListener('pointerdown',()=>{if(document.activeElement!==input)input.focus({preventScroll:true});});
        const raw=entry.missing?'':text.slice(entry.start,entry.end);
        input.value=raw.trim();input.rows=1;
        let current=raw,missing=entry.missing,start=entry.start;
        const fit=()=>{if(input.getClientRects().length)fitInput(input);};

        const updateExcerpt=()=>{const body=input.value.trim(),empty=!body;label.classList.toggle('is-empty',empty);excerpt.textContent=body;const values=getSummaries();const text=values[entry.name]??values[aliases[entry.name]||entry.name]??'';translation.textContent=empty?'':text;translation.title=translation.textContent;};updateExcerpt();

        input.addEventListener('input',()=>{fit();updateExcerpt();
          const latest=preview.value;let next;
          if(missing){
            if(!input.value.trim())return;
            const prefix=(latest&&!latest.endsWith('\n\n')?'\n\n':'')+'['+entry.name+']\n';
            start=latest.length+prefix.length;current=input.value;next=latest+prefix+current;missing=false;
          }else{
            // Locate fresh offsets after edits to other fields; duplicate headings stay distinct.
            const candidates=parse(latest).filter(p=>p.name===entry.name);
            const ordinal=parts.filter(p=>p.name===entry.name&&p.start<entry.start).length;
            const fresh=candidates[ordinal];if(!fresh)return;
            start=fresh.start;current=latest.slice(fresh.start,fresh.end);
            const lead=current.match(/^\s*/)[0],tail=current.trim()?current.match(/\s*$/)[0]:'';
            const replacement=lead+input.value+(tail||'\n\n');
            next=latest.slice(0,start)+replacement+latest.slice(fresh.end);current=replacement;
          }
          preview.value=next;rendered=next;preview.dispatchEvent(new Event('input',{bubbles:true}));
        });
        const arrow=document.createElement('span');arrow.className='module-card-arrow';arrow.innerHTML='<svg width=14 height=14 viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5"></path></svg>';arrow.setAttribute('aria-hidden','true');top.append(heading,translation,copy,arrow);summary.append(top);label.append(summary,input);let container=containers.get(entry.name);if(!container){if(!legacy){legacy=document.createElement('details');legacy.className='prompt-field-group';legacy.open=true;const title=document.createElement('summary');title.textContent='旧版与未分节内容 · 整理后细分';legacy.append(title);grid.prepend(legacy);}container=legacy;}container.append(label);
      }
      const firstContent=grid.querySelector('.prompt-section-field:not(.is-empty)');if(firstContent)firstContent.classList.add('first-content-field');
      requestAnimationFrame(()=>{for(const input of grid.querySelectorAll('textarea'))if(input.getClientRects().length)fitInput(input);});
    };
    const observer=new ResizeObserver(()=>{for(const input of root.querySelectorAll('textarea')){if(input.getClientRects().length)fitInput(input);}});observer.observe(root);
    return {root,sync,destroy:()=>observer.disconnect(),focus:()=>root.focus({preventScroll:true})};
  };
})();
