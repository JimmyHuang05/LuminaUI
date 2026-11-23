(() => {
  const RECIPE = 'moody_zit_simple';
  const clone = value => JSON.parse(JSON.stringify(value));
  const scopeKey = (preset, model, workflow) => [preset, model, workflow].join('/');
  const supported = (preset, model, workflow) => preset === '01_text_to_image' && model === 'pro_mix' && workflow === RECIPE;
  function createState(saved = {}) {
    const scopes = clone(saved);
    return {
      rows: key => scopes[key] || [],
      set(key, rows) { scopes[key] = clone(rows); },
      snapshot: () => clone(scopes),
      count: () => Object.values(scopes).reduce((n, rows) => n + rows.length, 0),
    };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {createState, scopeKey, supported};
    return;
  }

  const byId = id => document.getElementById(id);
  const storageKey = 'studio.lora.v2.' + (new URLSearchParams(location.search).get('page') || 'standalone');
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch {}
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || Object.values(saved).some(v => !Array.isArray(v))) saved = {};
  const state = createState(saved);
  let catalog = null, loadError = '', pickerDialog = null;
  const context = () => [mode, byId('generation-model').value, byId('generation-workflow').value];
  const currentKey = () => scopeKey(...context());
  const allowed = () => supported(...context());
  const activeKey = scopeKey('01_text_to_image', 'pro_mix', RECIPE);
  const fileInfo = id => catalog?.items.find(file => file.id === id);
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const button = (text, action) => {
    const el = node('button', text, 'secondary');
    el.type = 'button'; el.onclick = action; return el;
  };
  const panel = node('section', undefined, 'lv2-panel');
  panel.id = 'lora-v2-panel'; panel.setAttribute('aria-label', 'LoRA 效果');
  const heading = node('header');
  const title = node('h3', 'LoRA 效果');
  const add = button('＋ 添加效果', () => picker());
  heading.append(title, add);
  const caption = node('p', '', 'lv2-caption');
  const list = node('div', undefined, 'lv2-rows');
  const status = node('p', '', 'lv2-caption'); status.setAttribute('role', 'status');
  panel.append(heading, caption, list, status);
  byId('generation-workflow').closest('.field').after(panel);

  function persist(key, rows) {
    state.set(key, rows);
    try { sessionStorage.setItem(storageKey, JSON.stringify(state.snapshot())); }
    catch { status.textContent = '当前页面仍可使用，但浏览器未能保存 LoRA 草稿。'; }
    panel.dispatchEvent(new Event('change', {bubbles:true}));
  }
  function reasonFor(row, file) {
    if (!file) return catalog ? '文件不在模型库中，请恢复文件或移除效果' : '正在读取档案';
    if (file.reason) return file.reason;
    if (row.sha256 !== file.sha256 || row.profile_revision !== file.profile.revision) return '档案或文件已变更，请移除后重新添加';
    return '';
  }
  function render() {
    const on = allowed(), key = on ? currentKey() : activeKey;
    const rows = state.rows(key);
    panel.hidden = !on && !state.count();
    add.disabled = !on || !catalog;
    caption.textContent = on ? '可选 · 当前支持一个人物或风格 LoRA' : '已暂停：切回 Pro Mix 文生图 / ZIT Simple 后恢复。';
    status.textContent = loadError;
    list.replaceChildren();
    if (!rows.length && on) list.append(node('p', '不添加效果时，使用原工作流生成。', 'lv2-empty'));
    rows.forEach((row, index) => {
      const file = fileInfo(row.id), p = file?.profile;
      const reason = reasonFor(row, file);
      const card = node('div', undefined, 'lv2-row');
      const top = node('div', undefined, 'lv2-row-title');
      const enabled = node('input'); enabled.type = 'checkbox'; enabled.checked = row.enabled;
      enabled.setAttribute('aria-label', '启用 ' + (p?.label || file?.label || row.id));
      enabled.disabled = !on;
      enabled.onchange = () => { row.enabled = enabled.checked; persist(key, rows); render(); };
      const name = node('span', p?.label || file?.label || row.id);
      const remove = button('×', () => { persist(key, rows.filter((_, i) => i !== index)); render(); });
      remove.setAttribute('aria-label', '移除 ' + name.textContent);
      top.append(enabled, name, remove); card.append(top);
      if (reason) card.append(node('p', reason, 'lv2-warning'));
      if (p) {
        const strength = node('div', undefined, 'lv2-strength');
        const label = node('label', '强度'); label.htmlFor = 'lv2-weight-' + index;
        const slider = node('input'); slider.type = 'range'; slider.min = p.min_strength; slider.max = p.max_strength;
        slider.step = '0.05'; slider.value = row.strength; slider.setAttribute('aria-label', '效果强度');
        const value = node('input'); value.type = 'number'; value.id = label.htmlFor; value.step = 'any';
        value.min = p.min_strength; value.max = p.max_strength; value.value = row.strength;
        slider.disabled = value.disabled = !on || !row.enabled || !!reason;
        slider.oninput = () => { row.strength = slider.valueAsNumber; value.value = row.strength; persist(key, rows); };
        value.oninput = () => { if (Number.isFinite(value.valueAsNumber)) {row.strength = value.valueAsNumber; slider.value = row.strength; persist(key, rows);} };
        value.onchange = () => { if (!value.value) value.value = row.strength; };
        strength.append(label, slider, value); card.append(strength);
        const details = node('details'), summary = node('summary', '触发词与加载设置'); details.append(summary);
        if (p.trigger) {
          const trigger = node('label', undefined, 'lv2-check');
          const cb = node('input'); cb.type = 'checkbox'; cb.checked = row.use_trigger; cb.disabled = !on || !row.enabled;
          cb.onchange = () => {row.use_trigger = cb.checked; persist(key, rows);};
          trigger.append(cb, node('span', '自动附加触发词')); details.append(trigger, node('p', p.trigger, 'lv2-caption'));
        } else details.append(node('p', '此档案没有触发词。', 'lv2-caption'));
        if (p.patch_target === 'model_clip') {
          const label = node('label', '文本编码器强度', 'lv2-field');
          const input = node('input'); input.type = 'number'; input.step = 'any'; input.min = p.min_strength; input.max = p.max_strength;
          input.value = row.clip_strength; input.disabled = !on || !row.enabled || !!reason;
          input.oninput = () => {if (Number.isFinite(input.valueAsNumber)) {row.clip_strength = input.valueAsNumber; persist(key, rows);}};
          label.append(input); details.append(label);
        }
        details.append(node('p', '作用阶段：基础生成 + 潜空间细化。原始提示词不会被改写。', 'lv2-caption'));
        card.append(details);
      }
      list.append(card);
    });
  }
  async function reload() {
    try { catalog = await api('/api/lora-v2'); loadError = ''; }
    catch (e) { loadError = 'LoRA 列表读取失败：' + e.message; }
    render();
    return catalog;
  }
  function dialog(titleText) {
    const d = node('dialog', undefined, 'lv2-dialog');
    const header = node('header'); header.append(node('h3', titleText), button('关闭', () => d.close())); d.append(header);
    d.addEventListener('close', () => d.remove());
    document.body.append(d); return d;
  }
  async function picker() {
    if (pickerDialog?.open) return;
    const key = currentKey();
    const d = dialog('添加 LoRA 效果'); pickerDialog = d;
    const searchBox = node('div', undefined, 'lv2-search');
    const search = node('input'); search.type = 'search'; search.placeholder = '搜索 LoRA…'; search.setAttribute('aria-label', '搜索 LoRA');
    searchBox.append(search); window.mountDrawerSearch(searchBox);
    const controls = node('div', undefined, 'lv2-picker-controls');
    const label = node('label', undefined, 'lv2-check'), all = node('input'); all.type = 'checkbox'; label.append(all, node('span', '显示全部与不可用项'));
    const refresh = button('刷新列表', async () => {refresh.disabled = true; await reload(); refresh.disabled = false; draw();});
    controls.append(label, refresh);
    const host = node('div', undefined, 'lv2-picker-list'); host.setAttribute('aria-live', 'polite');
    d.append(searchBox, controls, host, node('p', '本地文件目录：ComfyUI/models/loras。添加文件后刷新，再填写用途和兼容资料；不会自动下载。', 'lv2-caption'));
    function draw() {
      host.replaceChildren();
      const files = (catalog?.items || []).filter(f => (all.checked || !f.reason) &&
        (f.label + ' ' + f.name + ' ' + (f.profile?.label || '')).toLowerCase().includes(search.value.toLowerCase()));
      if (!files.length) host.append(node('p', loadError || '暂无适用效果。可打开“显示全部”查看待配置文件和不兼容原因。', 'lv2-empty'));
      for (const file of files) {
        const item = node('div', undefined, 'lv2-picker-item'), text = node('div');
        text.append(node('strong', file.profile?.label || file.label));
        text.append(node('p', file.reason || ((file.profile?.category === 'character' ? '人物' : '风格') + ' · 声明兼容，待实图验证'), 'lv2-caption'));
        const actions = node('div', undefined, 'lv2-picker-actions');
        if (file.installed && !file.internal && !file.inspection.error) actions.append(button('资料', () => editProfile(file, draw)));
        const b = button('添加', () => {
          const rows = state.rows(key), p = file.profile;
          rows.push({id:file.id,enabled:true,strength:p.default_strength,
            clip_strength:p.patch_target === 'model_clip' ? p.default_strength : null,
            use_trigger:!!p.trigger,sha256:file.sha256,profile_revision:p.revision});
          persist(key, rows); render(); d.close();
        });
        const selected = state.rows(key).some(r => r.id === file.id);
        b.disabled = !!file.reason || selected;
        if (selected) b.textContent = '已添加';
        actions.append(b); item.append(text, actions); host.append(item);
      }
    }
    search.oninput = all.onchange = draw;
    draw(); d.showModal(); search.focus();
    await reload(); if (d.open) draw();
  }
  function editProfile(file, onSaved = () => {}) {
    const d = dialog('LoRA 兼容资料');
    if (file.internal || !file.installed || file.inspection.error) {
      d.append(node('p', file.reason, 'lv2-caption')); d.showModal(); return;
    }
    const p = file.profile || {}, revision = catalog.revision;
    const form = node('form', undefined, 'lv2-profile'), fields = {};
    function field(name, label, type, value, choices) {
      const wrapper = node('label', label, 'lv2-field');
      const input = node(choices ? 'select' : type === 'textarea' ? 'textarea' : 'input');
      if (choices) for (const [key, text] of Object.entries(choices)) {const option = node('option', text); option.value = key; input.append(option);}
      else if (type !== 'textarea') input.type = type;
      if (type === 'checkbox') {input.checked = !!value; wrapper.className = 'lv2-check';}
      else input.value = value;
      if (type === 'number') {input.step = 'any'; input.min = '-100'; input.max = '100'; input.required = true;}
      fields[name] = input; wrapper.append(input); form.append(wrapper);
      return input;
    }
    d.append(node('p', file.name, 'lv2-caption'), node('p', '资料声明不代表验证成功。运行时仍会核对文件版本，并检查权重是否实际加载。', 'lv2-caption'));
    field('label', '显示名称', 'text', p.label || file.label).required = true;
    field('category', '用途分类', 'text', p.category || 'other', catalog.categories);
    field('base_family', '训练底模', 'text', p.base_family || 'unknown', {unknown:'未知',zimage_turbo:'ZImage Turbo',zimage_base:'ZImage Base',qwen:'Qwen',krea2:'Krea2',other:'其他'});
    field('pro_mix_compatible', '资料确认适用于 Pro Mix / ZIT Simple', 'checkbox', p.models?.includes('pro_mix'));
    field('evidence', '兼容依据 / 作者说明链接', 'textarea', p.evidence || '');
    field('patch_target', '加载目标', 'text', p.patch_target || (file.inspection.has_clip ? 'model_clip' : 'model_only'), {model_only:'仅模型权重',model_clip:'模型 + 文本编码器权重'});
    field('default_strength', '默认强度', 'number', p.default_strength ?? 1);
    field('min_strength', '最小强度', 'number', p.min_strength ?? 0);
    field('max_strength', '最大强度', 'number', p.max_strength ?? 2);
    field('trigger', '触发词（可选）', 'textarea', p.trigger || '');
    const message = node('p', '', 'lv2-warning'); message.setAttribute('role', 'status');
    const save = node('button', '保存资料', 'secondary'); save.type = 'submit'; form.append(message, save);
    form.onsubmit = async e => {
      e.preventDefault(); save.disabled = true;
      const profile = {};
      for (const [key, input] of Object.entries(fields)) profile[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? input.valueAsNumber : input.value;
      try {
        await api('/api/lora-v2/profile', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:file.id,revision,profile})});
        await reload(); onSaved(); d.close(); window.dispatchEvent(new Event('lora-library-updated'));
      } catch (e) { message.textContent = e.message; }
      finally { save.disabled = false; }
    };
    d.append(form); d.showModal();
  }
  window.openLoRAInfo = async file => {
    await reload(); const item = fileInfo(file.id);
    if (item) editProfile(item); else byId('error').textContent = loadError || '未找到此 LoRA';
  };
  window.generationLoRAs = {
    async payload(preset, model, prompt) {
      const workflow = byId('generation-workflow').value;
      if (!supported(preset, model, workflow)) return {};
      const rows = clone(state.rows(scopeKey(preset, model, workflow)));
      const config = {schema:2,recipe:RECIPE,items:rows};
      if (!rows.length) return {};
      const result = await api('/api/lora-v2/validate', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({preset,generation_model:model,generation_workflow:workflow,prompt,lora_v2:config})});
      if (result.warnings.length && !confirm(result.warnings.join('\n') + '\n\n继续本次生成？')) throw Error('已取消，LoRA 选择仍保留。');
      config.acknowledgement = result.acknowledgement;
      return {lora_v2:config};
    },
    restore(job) {
      if (!allowed()) return;
      persist(currentKey(), job.lora_v2?.schema === 2 ? job.lora_v2.items : []); render();
    },
    reload,
  };
  byId('generation-model').addEventListener('change', render);
  byId('generation-workflow').addEventListener('change', render);
  window.addEventListener('creative-mode-change', render);
  render(); reload();
})();
