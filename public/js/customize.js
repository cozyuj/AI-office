// 외형 커스터마이즈 모달: 대상 선택 → 파츠/색(프리셋 + 직접 선택)/악세사리 → 걷는 미리보기 → 저장(localStorage)
import { OPTIONS, randomAvatar, drawAvatar } from './scene/avatar.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createCustomizer(store, avatars) {
  const modal = document.getElementById('customize');
  const targetsEl = modal.querySelector('.cz-targets');
  const optsEl = modal.querySelector('.cz-options');
  const preview = modal.querySelector('canvas');
  const pctx = preview.getContext('2d');
  let target = 'me';
  let draft = null;
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

  const swatch = (group, key, colors, current, allowAuto = false) => {
    const list = allowAuto ? colors : colors.filter((c) => c !== 'auto');
    const custom = current !== 'auto' && !list.includes(current);
    return `<div class="cz-swatches">${list.map((c) => `<button class="cz-swatch ${c === current ? 'on' : ''}" data-group="${group}" data-key="${key}" data-value="${c}" title="${c === 'auto' ? '세션 색 자동' : c}" style="${c === 'auto' ? 'background:conic-gradient(#e8683a,#3b6fd6,#2fa36b,#e0a526,#e8683a)' : 'background:' + c}"></button>`).join('')}<label class="cz-swatch custom ${custom ? 'on' : ''}" title="직접 고르기" style="background:${custom ? current : '#fff'}"><input type="color" data-group="${group}" data-key="${key}" value="${custom ? current : '#888888'}"><span>+</span></label></div>`;
  };
  const chips = (group, key, items, current) => `<div class="cz-chips">${items.map(([v, label]) => `<button class="cz-chip ${v === current ? 'on' : ''}" data-group="${group}" data-key="${key}" data-value="${esc(v)}">${esc(label)}</button>`).join('')}</div>`;

  function render() {
    targetsEl.innerHTML = targets().map(([k, label]) => `<button class="cz-target ${k === target ? 'on' : ''}" data-target="${esc(k)}">${esc(label)}${avatars.has(k) ? '' : '<span class="muted"> · 기본</span>'}</button>`).join('');
    optsEl.innerHTML = `
      <div class="cz-group"><div class="cz-label">피부색</div>${swatch('', 'skin', OPTIONS.skin, draft.skin)}</div>
      <div class="cz-group"><div class="cz-label">머리</div>${chips('hair', 'style', OPTIONS.hair.styles, draft.hair.style)}${swatch('hair', 'color', OPTIONS.hair.colors, draft.hair.color)}</div>
      <div class="cz-group"><div class="cz-label">상의</div>${chips('top', 'style', OPTIONS.top.styles, draft.top.style)}${swatch('top', 'color', OPTIONS.top.colors, draft.top.color, true)}</div>
      <div class="cz-group"><div class="cz-label">하의</div>${chips('bottom', 'style', OPTIONS.bottom.styles, draft.bottom.style)}${swatch('bottom', 'color', OPTIONS.bottom.colors, draft.bottom.color)}</div>
      <div class="cz-group"><div class="cz-label">신발</div>${swatch('', 'shoes', OPTIONS.shoes.colors, draft.shoes)}</div>
      <div class="cz-group"><div class="cz-label">안경</div>${chips('', 'glasses', OPTIONS.glasses, draft.glasses)}</div>
      <div class="cz-group"><div class="cz-label">모자</div>${chips('', 'hat', OPTIONS.hat, draft.hat)}${draft.hat !== 'none' ? swatch('', 'hatColor', OPTIONS.top.colors, draft.hatColor) : ''}</div>
      <div class="cz-group"><div class="cz-label">소품</div>${chips('', 'extra', OPTIONS.extra, draft.extra)}</div>`;
  }

  function loop() {
    const dpr = window.devicePixelRatio || 1;
    const w = 180, h = 210;
    if (preview.width !== w * dpr) { preview.width = w * dpr; preview.height = h * dpr; preview.style.width = `${w}px`; preview.style.height = `${h}px`; }
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, w, h);
    pctx.fillStyle = '#f1f2f5'; pctx.beginPath(); pctx.ellipse(w / 2, h - 16, 44, 12, 0, 0, Math.PI * 2); pctx.fill();
    const t = performance.now() / 1000;
    drawAvatar(pctx, w / 2, h - 18, draft, { sessionColor: '#e8683a', walking: true, walkT: t, now: performance.now(), faceRight: Math.sin(t / 1.5) > 0, scale: 2.8, hardHat: target === 'sub' });
    raf = requestAnimationFrame(loop);
  }

  function assign(group, key, value) { if (group) draft[group][key] = value; else draft[key] = value; }

  modal.addEventListener('click', (e) => {
    if (e.target.closest('label.custom')) return;
    const t = e.target.closest('[data-target]');
    if (t) { target = t.dataset.target; draft = structuredClone(avatars.get(target)); render(); return; }
    const b = e.target.closest('button[data-key]');
    if (b) { assign(b.dataset.group, b.dataset.key, b.dataset.value); render(); return; }
    const act = e.target.closest('[data-action]');
    if (!act) { if (e.target === modal) close(); return; }
    switch (act.dataset.action) {
      case 'random': draft = randomAvatar(); if (target !== 'me' && target !== 'sub') draft.top.color = 'auto'; render(); break;
      case 'reset': draft = structuredClone(avatars.baseFor(target)); render(); break;
      case 'save': avatars.set(target, draft); render(); close(); break;
      case 'close': close(); break;
      case 'delete': avatars.reset(target); draft = structuredClone(avatars.get(target)); render(); break;
    }
  });
  modal.addEventListener('input', (e) => {
    const i = e.target;
    if (i.type !== 'color') return;
    assign(i.dataset.group, i.dataset.key, i.value);
    const lab = i.closest('label');
    lab.style.background = i.value; lab.classList.add('on');
    lab.parentElement.querySelectorAll('button.cz-swatch.on').forEach((b) => b.classList.remove('on'));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });

  return { open, close };
}
