// 외형 커스터마이즈 모달: 대상 선택 → 파츠 선택 → 미리보기 → 저장(localStorage)
import { OPTIONS, DEFAULTS, randomAvatar, drawAvatar } from './scene/avatar.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createCustomizer(store, avatars) {
  const modal = document.getElementById('customize');
  const targetsEl = modal.querySelector('.cz-targets');
  const optsEl = modal.querySelector('.cz-options');
  const preview = modal.querySelector('canvas');
  const pctx = preview.getContext('2d');
  let target = 'me';
  let draft = null;   // 편집 중 spec
  let raf = 0;

  function targets() {
    const list = [['me', `${store.me} (나)`], ['claude', 'Claude 기본'], ['sub', '서브에이전트 기본']];
    const f = store.selectedFloor();
    if (f) list.push([`floor:${f.id}`, `${f.no}F ${f.name} 의 Claude`]);
    return list;
  }

  function open(initial) {
    target = initial || target;
    draft = structuredClone(avatars.get(target));
    modal.classList.remove('hidden');
    render();
    loop();
  }
  function close() { modal.classList.add('hidden'); cancelAnimationFrame(raf); raf = 0; }

  function render() {
    targetsEl.innerHTML = targets().map(([k, label]) => `<button class="cz-target ${k === target ? 'on' : ''}" data-target="${esc(k)}">${esc(label)}${avatars.has(k) ? '' : '<span class="muted"> · 기본</span>'}</button>`).join('');
    const swatch = (group, key, colors, current) => `<div class="cz-swatches">${colors.map((c) => `<button class="cz-swatch ${c === current ? 'on' : ''}" data-group="${group}" data-key="${key}" data-value="${c}" title="${c === 'auto' ? '세션 색 자동' : c}" style="${c === 'auto' ? 'background:conic-gradient(#e8683a,#3b6fd6,#2fa36b,#e0a526,#e8683a)' : 'background:' + c}"></button>`).join('')}</div>`;
    const chips = (group, key, items, current) => `<div class="cz-chips">${items.map(([v, label]) => `<button class="cz-chip ${v === current ? 'on' : ''}" data-group="${group}" data-key="${key}" data-value="${v}">${esc(label)}</button>`).join('')}</div>`;
    optsEl.innerHTML = `
      <div class="cz-group"><div class="cz-label">성별 (실루엣)</div>${chips('', 'gender', OPTIONS.gender, draft.gender)}</div>
      <div class="cz-group"><div class="cz-label">피부색</div>${swatch('', 'skin', OPTIONS.skin, draft.skin)}</div>
      <div class="cz-group"><div class="cz-label">머리</div>${chips('hair', 'style', OPTIONS.hair.styles, draft.hair.style)}${swatch('hair', 'color', OPTIONS.hair.colors, draft.hair.color)}</div>
      <div class="cz-group"><div class="cz-label">상의</div>${chips('top', 'style', OPTIONS.top.styles, draft.top.style)}${swatch('top', 'color', OPTIONS.top.colors, draft.top.color)}</div>
      <div class="cz-group"><div class="cz-label">하의</div>${chips('bottom', 'style', OPTIONS.bottom.styles, draft.bottom.style)}${swatch('bottom', 'color', OPTIONS.bottom.colors, draft.bottom.color)}</div>
      <div class="cz-group"><div class="cz-label">신발</div>${swatch('shoes', 'color', OPTIONS.shoes.colors, draft.shoes.color)}</div>`;
  }

  function loop() {
    const dpr = window.devicePixelRatio || 1;
    const w = 160, h = 200;
    if (preview.width !== w * dpr) { preview.width = w * dpr; preview.height = h * dpr; preview.style.width = `${w}px`; preview.style.height = `${h}px`; }
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, w, h);
    pctx.fillStyle = '#f4f5f7'; pctx.beginPath(); pctx.ellipse(w / 2, h - 18, 40, 12, 0, 0, Math.PI * 2); pctx.fill();
    const t = performance.now() / 1000;
    drawAvatar(pctx, w / 2, h - 20, draft, { sessionColor: '#e8683a', walking: true, walkT: t, faceRight: Math.sin(t / 1.5) > 0, scale: 3, activity: 'work' });
    raf = requestAnimationFrame(loop);
  }

  modal.addEventListener('click', (e) => {
    const t = e.target.closest('[data-target]');
    if (t) { target = t.dataset.target; draft = structuredClone(avatars.get(target)); render(); return; }
    const b = e.target.closest('[data-key]');
    if (b) {
      const { group, key, value } = b.dataset;
      if (group) draft[group][key] = value; else draft[key] = value;
      render();
      return;
    }
    const act = e.target.closest('[data-action]');
    if (!act) { if (e.target === modal) close(); return; }
    switch (act.dataset.action) {
      case 'random': draft = randomAvatar(); if (target !== 'me' && target !== 'sub') draft.top.color = 'auto'; render(); break;
      case 'reset': draft = structuredClone(target === 'me' ? DEFAULTS.me : target === 'sub' ? DEFAULTS.sub : DEFAULTS.claude); render(); break;
      case 'save': avatars.set(target, draft); render(); close(); break;
      case 'close': close(); break;
      case 'delete': avatars.reset(target); draft = structuredClone(avatars.get(target)); render(); break;
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });

  return { open, close };
}
