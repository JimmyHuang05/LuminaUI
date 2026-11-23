(() => {
  const validId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
  const coverURL = (id, size = 'thumb') => validId(id) && ['thumb','full'].includes(size) ? `/api/prompt-covers/${id}/${size}` : null;
  const matchesPrompt = (job, row) => row?.id && (job.library_prompt_id || job.library_prompt?.id) ? row.id === (job.library_prompt_id || job.library_prompt?.id) : !!row?.prompt && (job.base_prompt || job.prompt || '').trim() === row.prompt.trim();
  if (typeof module !== 'undefined' && module.exports) { module.exports = {coverURL, matchesPrompt}; return; }
  const el = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function button(text, action) {
    const b = el('button','secondary',text); b.type = 'button'; b.onclick = action; return b;
  }
  function placeholder() {
    const box = el('span','prompt-cover-empty');
    box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg>';
    box.append(el('span','', '设置封面')); return box;
  }
  function thumbnail(row, onClick, size = 'full') {
    const b = button('',onClick); b.className = 'prompt-cover';
    b.setAttribute('aria-label', (coverURL(row.cover_id) ? '查看封面：' : '设置封面：') + row.title);
    b.title = coverURL(row.cover_id) ? '点击放大封面' : '点击设置封面';
    b.append(placeholder());
    const src = coverURL(row.cover_id, size);
    if (src) {
      const image = el('img'); image.alt = row.title + ' · 提示词封面'; image.loading = 'lazy'; image.decoding = 'async';
      image.onload = () => b.classList.add('has-cover');
      image.onerror = () => { image.remove(); b.classList.remove('has-cover'); b.title = '封面文件不可用，可在编辑中重新设置'; };
      image.src = src; b.append(image);
    }
    return b;
  }
  function dialog(title) {
    const d = el('dialog','prompt-cover-dialog');
    const header = el('div','prompt-cover-dialog-heading');
    const heading = el('h3','',title); heading.id = 'cover-heading-' + crypto.randomUUID(); d.setAttribute('aria-labelledby',heading.id);
    const close = button('×',() => d.close()); close.setAttribute('aria-label','关闭封面窗口');
    header.append(heading,close); d.append(header);
    d.addEventListener('close',() => d.remove()); document.body.append(d); return d;
  }
  async function preview(row) {
    const source=coverURL(row.cover_id,'full');
    if(!source)return;
    try{const resolved=await api(`/api/prompt-covers/${row.cover_id}/source`);showLightbox(resolved.url,resolved.job);}
    catch{showLightbox(source);}
  }
  async function chooseOutput(row, onChoose) {
    const d = dialog('从生成结果选择封面');
    const hint = el('p','prompt-cover-note','只选择现有结果，不会启动生成。封面会独立保存。');
    const filter = el('label','prompt-cover-filter'), check = el('input'); check.type = 'checkbox';
    filter.append(check,document.createTextNode('只看这条提示词的生成结果'));
    const grid = el('div','prompt-cover-grid'), status = el('p','prompt-cover-note','正在读取生成结果…');
    status.setAttribute('role','status');
    const more = button('显示更多',() => {limit += 24; render();}); more.hidden = true;
    d.append(hint,filter,grid,status,more); d.showModal();
    let rows = [], limit = 24, pending = false;
    function render() {
      grid.replaceChildren(); const filtered = rows.filter(r => !check.checked || matchesPrompt(r.job,row));
      status.textContent = filtered.length ? `共 ${filtered.length} 张${check.checked ? '匹配结果' : '生成图片'} · 点击图片选择` : check.checked ? '这条提示词暂无生成结果，可以取消筛选查看其他图片。' : '暂无可选的生成结果，也可以上传封面图片。';
      more.hidden = filtered.length <= limit;
      for (const {job,image,index} of filtered.slice(0,limit)) {
        const b = button('',async () => {
          if (pending) return;
          pending = true; grid.querySelectorAll('button').forEach(item => item.disabled = true);
          status.textContent = '正在保存封面副本…';
          try { await onChoose(job.prompt_id,index); d.close(); }
          catch (e) { status.textContent = e.message; }
          finally { pending = false; grid.querySelectorAll('button').forEach(item => item.disabled = item.dataset.missing === 'true'); }
        });
        b.className = 'prompt-cover-result';
        b.setAttribute('aria-label','用作封面：'+image.filename);
        const img = el('img'); img.alt = image.filename; img.loading = 'lazy'; img.decoding = 'async';
        img.src = '/image?' + new URLSearchParams({filename:image.filename,subfolder:image.subfolder || '',type:'output'});
        img.onerror = () => {img.replaceWith(el('span','prompt-cover-note','原图不可用')); b.disabled = true; b.dataset.missing = 'true';};
        b.append(img,el('span','',job.label || '生成结果')); grid.append(b);
      }
    }
    check.onchange = () => {limit = 24; render();};
    try {
      const data = await api('/api/status');
      rows = [...data.jobs].reverse().filter(j => j.status === 'success').flatMap(job => (job.images || []).map((image,index) => ({job,image,index}))).filter(r => r.image.type === 'output');
      check.checked = rows.some(r => matchesPrompt(r.job,row)); if (d.open) render();
    } catch (e) {status.textContent = e.message;}
  }
  function editor(row, onBusy, currentPrompt = () => row) {
    let id = row?.cover_id || null, ratio = row?.recommended_ratio || null, pending = false;
    const root = el('section','prompt-cover-editor'); root.setAttribute('aria-label','提示词封面');
    const previewBox = el('div','prompt-cover-editor-preview');
    const content = el('div','prompt-cover-editor-content');
    const label = el('b','','卡片封面');
    const note = el('p','prompt-cover-note','推荐比例根据完整封面自动识别，应用提示词时同步切换。');
    const actions = el('div','prompt-cover-editor-actions');
    const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true;
    const status = el('p','prompt-cover-note'); status.setAttribute('role','status');
    async function run(task) {
      if (pending) return;
      pending = true; onBusy(true); status.textContent = '正在保存封面…';
      try { const result = await task(); id = result.cover_id; ratio = result.recommended_ratio; status.textContent = '封面已选好，保存提示词后生效。'; }
      catch (e) {status.textContent = e.message; throw e;}
      finally {pending = false; onBusy(false); render();}
    }
    const upload = button('上传封面',() => file.click());
    file.onchange = async () => {
      const selected = file.files[0]; if (!selected) return;
      try {
        if (selected.size > 30 * 1024 * 1024) throw Error('封面不能超过 30MB');
        await run(() => {const form = new FormData(); form.append('image',selected); return api('/api/prompt-covers/upload',{method:'POST',body:form});});
      } catch (e) {status.textContent = e.message;} finally {file.value = '';}
    };
    const generated = button('从生成结果选择',() => chooseOutput(currentPrompt(), (prompt_id,image_index) => run(() => api('/api/prompt-covers/from-output',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt_id,image_index})
    }))));
    const clear = button('移除封面',() => {id = null; ratio = null; status.textContent = '保存提示词后移除封面；原图不会删除。'; render();});
    actions.append(upload,generated,clear); content.append(label,note,actions,status); root.append(previewBox,content,file);
    function render() {
      previewBox.replaceChildren(thumbnail({title:row?.title || '提示词',cover_id:id},() => id ? preview({title:row?.title || '提示词',cover_id:id}) : file.click(), 'full'));
      const coverButton=previewBox.querySelector('button');coverButton.title=id?'查看图片':'上传图片';coverButton.setAttribute('aria-label',id?'查看图片':'上传图片');
      previewBox.append(actions);
      label.textContent = '卡片封面 · 推荐比例：' + (ratio || '未设置');
      clear.disabled = !id || pending;
      root.dispatchEvent(new CustomEvent('coverchange',{bubbles:true}));
    }
    render(); return {element:root,value:() => id,ratio:() => ratio};
  }
  window.promptCovers = {thumbnail,preview,editor};
})();
