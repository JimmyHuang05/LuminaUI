// Local integration for @yogesharc/thinking-orbs 0.1.1 (MIT, see adjacent LICENSE).
const liveOrbs = new Set();
let animationEnabled=true;
try{animationEnabled=localStorage.getItem('studio-particle-animation')!=='off';}catch{}
document.body.classList.toggle('particle-animation-off',!animationEnabled);
window.aiOrbAnimationEnabled=()=>animationEnabled;
window.setAIOrbAnimation=value=>{animationEnabled=!!value;document.body.classList.toggle('particle-animation-off',!animationEnabled);try{localStorage.setItem('studio-particle-animation',value?'on':'off');}catch{}for(const root of liveOrbs) animationEnabled&&!document.hidden?root._orb.play():root._orb.pause();};
// Reuse the actual SVG particles. Blend rendered coordinates, radii and opacity
// from their last visible frame into the new state's continuously moving frame.
function particleRender(root) {
  const old = root._particles || [];
  const from = old.map(p => p.value.slice());
  const started = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {mount({make, pts}) {
    const svg = root.querySelector('svg');
    root._particles = pts.map((_, i) => {
      const p = old[i] || {node: make('circle'), value:[50,50,0,0]};
      if (p.node.parentNode !== svg) svg.append(p.node);
      return p;
    });
    return {dot(i,x,y,r,a) {
      const u = reduced || !from.length ? 1 : Math.min(1,(performance.now()-started)/600);
      const blend = u*u*u*(u*(u*6-15)+10);
      const target = [x,y,r,a], p = root._particles[i], start = from[i] || [x,y,0,0];
      p.value = target.map((v,k) => start[k]+(v-start[k])*blend);
      ['cx','cy','r','opacity'].forEach((key,k) => p.node.setAttribute(key,p.value[k]));
    }};
  }};
}
const looks = {
  waiting: ['waiting', 'default', '等待处理'],
  '01_text_to_image': ['working', 'default', '正在生成图片'],
  '02_character_consistency': ['working', 'gyro', '正在参考图片生成'],
  '03_image_edit': ['compacting', 'default', '正在编辑图片'],
  optimizing: ['reasoning', 'default', '正在优化提示词'],
  describing: ['reasoning', 'default', '正在分析图片'],
  '04_upscale': ['working', 'default', '正在放大图片']
};
function dispose(root) {
  root._orb?.destroy(); root._orb = null; liveOrbs.delete(root);
}
window.createAIOrbLoader = job => {
  const root = document.createElement('div'); root.className = 'ai-orb-loader';
  root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('ai-orb-svg'); svg.setAttribute('aria-hidden', 'true');
  const text = document.createElement('div'); text.className = 'ai-orb-status';
  root.append(svg, text); window.updateAIOrbLoader(root, job); return root;
};
window.updateAIOrbLoader = (root, job) => {
  const type = job.status === 'queued' ? 'waiting' : job.preset || 'optimizing';
  const [state, variant, label] = looks[type] || looks['01_text_to_image'];
  if (root.dataset.orbType !== type) {
    dispose(root); root.dataset.orbType = type;
    root.classList.toggle('queued', type === 'waiting');
    root._orb = mountOrb(root.querySelector('svg'), {state, variant, size:100, render:particleRender(root)});
    liveOrbs.add(root); if (document.hidden || !animationEnabled) root._orb.pause();
  }
  const p = job.progress;
  const next = label + (job.status === 'running' && p?.max ? ` · ${p.value} / ${p.max}` : '');
  const text = root.querySelector('.ai-orb-status');
  if (text.textContent !== next) text.textContent = next;
};
window.startAIOrbStatus = (target, preset='optimizing') => {
  const root = window.createAIOrbLoader({status:'running', preset});
  target.replaceChildren(root); return () => {dispose(root); if (root.parentNode === target) root.remove();};
};
// Release frames and observers when a result replaces its loader or a dialog closes.
new MutationObserver(() => {
  for (const root of liveOrbs) if (!root.isConnected || root.closest('dialog:not([open])')) dispose(root);
}).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['open']});
document.addEventListener('visibilitychange', () => {
  for (const root of liveOrbs) document.hidden || !animationEnabled ? root._orb.pause() : root._orb.play();
});
