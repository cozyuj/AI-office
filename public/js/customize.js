// 외형 커스터마이즈 모달: 대상 선택 → 파츠 선택 → 미리보기 → 저장(localStorage)
// LPC 스프라이트가 있으면 manifest 의 파츠/팔레트로, 없으면 코드로 그리는 파츠로 UI 를 만든다.
import { OPTIONS as DRAWN, randomAvatar, drawAvatar } from './scene/avatar.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createCustomizer(store, avatars) {
  const lpc = avatars.lpc;
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

  const swatch = (group, key, colors, current) => `<div class="cz-swatches">${colors.map(([v, hex]) => `<button class="cz-swatch ${v === current ? 'on' : ''}" data-group="${group}" data-key="${key}" data-value="${esc(v)}" title="${v === 'auto' ? '세션 색 자동' : esc(v)}" style="${v === 'auto' ? 'background:conic-gradient(#e8683a,#3b6fd6,#2fa36b,#e0a526,#e8683a)' : 'background:' + hex}"></button>`).join('')}</div>`;
  const chips = (group, key, items, current) => `<div class="cz-chips">${items.map(([v, label]) => `<button class="cz-chip ${v === current ? 'on' : ''}" data-group="${group}" data-key="${key}" data-value="${esc(v)}">${esc(label)}</button>`).join('')}</div>`;

  function render() {
    targetsEl.innerHTML = targets().map(([k, label]) => `<button class="cz-target ${k === target ? 'on' : ''}" data-target="${esc(k)}">${esc(label)}${avatars.has(k) ? '' : '<span class="muted"> · 기본</span>'}</button>`).join('');
    if (lpc) {
      const o = lpc.options;
      optsEl.innerHTML = `
        <div class="cz-group"><div class="cz-label">체형</div>${chips('', 'body', o.body, draft.body)}</div>
        <div class="cz-group"><div class="cz-label">피부색</div>${swatch('', 'skin', o.skin, draft.skin)}</div>
        <div class="cz-group"><div class="cz-label">머리</div>${chips('hair', 'id', o.hair, draft.hair.id)}${swatch('hair', 'color', o.hairColors, draft.hair.color)}</div>
        <div class="cz-group"><div class="cz-label">상의</div>${chips('top', 'id', o.top, draft.top.id)}${swatch('top', 'color', o.clothColors, draft.top.color)}</div>
        <div class="cz-group"><div class="cz-label">하의</div>${chips('bottom', 'id', o.bottom, draft.bottom.id)}${swatch('bottom', 'color', o.clothColors.filter(([k]) => k !== 'auto'), draft.bottom.color)}</div>
        <div class="cz-group"><div class="cz-label">신발</div>${chips('shoes', 'id', o.shoes, draft.shoes.id)}${swatch('shoes', 'color', o.clothColors.filter(([k]) => k !== 'auto'), draft.shoes.color)}</div>
        <div class="cz-credit muted">스프라이트: <a href="https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator" target="_blank" rel="noopener">Universal LPC Spritesheet Character Generator</a> · 저작자·라이선스 <a href="/assets/lpc/CREDITS.csv" target="_blank">CREDITS.csv</a></div>`;
    } else {
      const sw = (list) => list.map((c) => [c, c]);
      optsEl.innerHTML = `
        <div class="cz-group"><div class="cz-label">성별 (실루엣)</div>${chips('', 'gender', DRAWN.gender, draft.gender)}</div>
        <div class="cz-group"><div class="cz-label">피부색</div>${swatch('', 'skin', sw(DRAWN.skin), draft.skin)}</div>
        <div class="cz-group"><div class="cz-label">머리</div>${chips('hair', 'style', DRAWN.hair.styles, draft.hair.style)}${swatch('hair', 'color', sw(DRAWN.hair.colors), draft.hair.color)}</div>
        <div class="cz-group"><div class="cz-label">상의</div>${chips('top', 'style', DRAWN.top.styles, draft.top.style)}${swatch('top', 'color', sw(DRAWN.top.colors), draft.top.color)}</div>
        <div class="cz-group"><div class="cz-label">하의</div>${chips('bottom', 'style', DRAWN.bottom.styles, draft.bottom.style)}${swatch('bottom', 'color', sw(DRAWN.bottom.colors), draft.bottom.color)}</div>
        <div class="cz-group"><div class="cz-label">신발</div>${swatch('shoes', 'color', sw(DRAWN.shoes.colors), draft.shoes.color)}</div>`;
    }
  }

  function loop() {
    const dpr = window.devicePixelRatio || 1;
    const w = 160, h = 200;
    if (preview.width !== w * dpr) { preview.width = w * dpr; preview.height = h * dpr; preview.style.width = `${w}px`; preview.style.height = `${h}px`; }
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, w, h);
    pctx.fillStyle = '#f4f5f7'; pctx.beginPath(); pctx.ellipse(w / 2, h - 18, 40, 12, 0, 0, Math.PI * 2); pctx.fill();
    const t = performance.now() / 1000;
    if (lpc) {
      const dir = ['down', 'right', 'up', 'left'][Math.floor(t / 2) % 4];
      lpc.draw(pctx, w / 2, h - 24, draft, { dir, walking: true, walkT: t, now: performance.now(), sessionColor: '#e8683a', scale: 2.4 });
    } else {
      drawAvatar(pctx, w / 2, h - 20, draft, { sessionColor: '#e8683a', walking: true, walkT: t, faceRight: Math.sin(t / 1.5) > 0, scale: 3, activity: 'work' });
    }
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
      case 'random': draft = lpc ? lpc.randomSpec() : randomAvatar(); if (target !== 'me' && target !== 'sub') draft.top.color = 'auto'; render(); break;
      case 'reset': draft = structuredClone(avatars.baseFor(target)); render(); break;
      case 'save': avatars.set(target, draft); render(); close(); break;
      case 'close': close(); break;
      case 'delete': avatars.reset(target); draft = structuredClone(avatars.get(target)); render(); break;
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });

  return { open, close };
}
