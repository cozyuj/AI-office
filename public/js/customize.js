// 외형 커스터마이즈 모달: 대상 선택 → 프리셋 / 몸 종류 / 파츠·색(프리셋 + 직접 선택) / 악세사리 → 걷는 미리보기 → 저장(localStorage)
import { OPTIONS, PRESETS, randomAvatar, drawAvatar } from './scene/avatar.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SKIN_LABEL = { human: '피부색', robot: '금속색', cat: '털색', bear: '털색' };

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

  /** 미리보기 아래 이름표에 쓸 이름: 나 → 내 이름, 서브 → 서브에이전트, Claude 계열 → 지금 보는 세션의 캐릭터 이름 */
  function previewName() {
    if (target === 'me') return `${store.me} (나)`;
    if (target === 'sub') return '서브에이전트';
    const s = store.selectedSession();
    return s ? store.nameOf(s, null) : 'Claude';
  }
  /** 지금 보는 세션의 캐릭터 이름 행 (바로 저장). 세션이 없으면 비움 */
  function nameRow() {
    const s = store.selectedSession();
    if (!s) return '';
    const custom = store.names.isCustom(s.id);
    const title = s.title || `제목 없는 세션 · ${s.id.slice(0, 8)}`;
    return `<div class="cz-group"><div class="cz-label">캐릭터 이름 <span class="muted">— 지금 보는 세션 "${esc(title.length > 28 ? title.slice(0, 27) + '…' : title)}" · 바로 저장</span></div>
      <div class="cz-namerow"><input class="name-input cz-name-input ${custom ? '' : 'auto'}" maxlength="20" autocomplete="off" spellcheck="false" value="${esc(store.nameOf(s, null))}" placeholder="이름" title="비우면 자동 별명으로 돌아갑니다"><button class="tool" data-action="name-roll" title="다른 별명 뽑기">🎲 다른 별명</button></div></div>`;
  }

  /** 프리셋 썸네일: 정지 자세로 한 번 그린다 */
  function drawThumbs() {
    const dpr = window.devicePixelRatio || 1, w = 44, h = 64;
    for (const c of optsEl.querySelectorAll('canvas.cz-thumb')) {
      const p = PRESETS.find((x) => x.id === c.dataset.preset);
      if (!p) continue;
      c.width = w * dpr; c.height = h * dpr; c.style.width = `${w}px`; c.style.height = `${h}px`;
      const cx = c.getContext('2d');
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawAvatar(cx, w / 2, h - 3, p.spec, { sessionColor: '#e8683a', scale: 0.8, faceRight: true });
    }
  }

  function render() {
    targetsEl.innerHTML = targets().map(([k, label]) => `<button class="cz-target ${k === target ? 'on' : ''}" data-target="${esc(k)}">${esc(label)}${avatars.has(k) ? '' : '<span class="muted"> · 기본</span>'}</button>`).join('');
    const body = draft.body || 'human';
    const robot = body === 'robot';
    optsEl.innerHTML = `
      ${nameRow()}
      <div class="cz-group"><div class="cz-label">프리셋 <span class="muted">— 고른 뒤 파츠를 더 바꿀 수 있어요</span></div><div class="cz-presets">${PRESETS.map((p) => `<button class="cz-preset" data-preset="${esc(p.id)}" title="${esc(p.label)} 프리셋 적용"><canvas class="cz-thumb" data-preset="${esc(p.id)}"></canvas><span>${esc(p.label)}</span></button>`).join('')}</div></div>
      <div class="cz-group"><div class="cz-label">몸</div>${chips('', 'body', OPTIONS.body, body)}</div>
      <div class="cz-group"><div class="cz-label">${SKIN_LABEL[body] || '피부색'}</div>${swatch('', 'skin', OPTIONS.bodySkins[body] || OPTIONS.skin, draft.skin)}</div>
      ${robot ? '' : `<div class="cz-group"><div class="cz-label">머리</div>${chips('hair', 'style', OPTIONS.hair.styles, draft.hair.style)}${swatch('hair', 'color', OPTIONS.hair.colors, draft.hair.color)}</div>`}
      <div class="cz-group"><div class="cz-label">상의</div>${chips('top', 'style', OPTIONS.top.styles, draft.top.style)}${swatch('top', 'color', OPTIONS.top.colors, draft.top.color, true)}</div>
      <div class="cz-group"><div class="cz-label">하의</div>${chips('bottom', 'style', OPTIONS.bottom.styles, draft.bottom.style)}${swatch('bottom', 'color', OPTIONS.bottom.colors, draft.bottom.color)}</div>
      <div class="cz-group"><div class="cz-label">신발</div>${swatch('', 'shoes', OPTIONS.shoes.colors, draft.shoes)}</div>
      <div class="cz-group"><div class="cz-label">안경</div>${chips('', 'glasses', OPTIONS.glasses, draft.glasses)}</div>
      <div class="cz-group"><div class="cz-label">모자</div>${chips('', 'hat', OPTIONS.hat, draft.hat)}${draft.hat !== 'none' && draft.hat !== 'crown' ? swatch('', 'hatColor', OPTIONS.top.colors, draft.hatColor) : ''}</div>
      <div class="cz-group"><div class="cz-label">소품</div>${chips('', 'extra', OPTIONS.extra, draft.extra)}</div>`;
    drawThumbs();
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
    // 이름표 (사무실의 발 아래 이름표와 같은 모양)
    const name = previewName();
    pctx.font = '700 11px system-ui, -apple-system, sans-serif'; pctx.textAlign = 'center'; pctx.textBaseline = 'middle';
    const nw = pctx.measureText(name).width + 20, ny = h - 7;
    pctx.fillStyle = 'rgba(255,255,255,0.95)'; pctx.strokeStyle = 'rgba(0,0,0,0.12)'; pctx.lineWidth = 1;
    pctx.beginPath(); pctx.roundRect(w / 2 - nw / 2, ny - 9, nw, 18, 9); pctx.fill(); pctx.stroke();
    pctx.fillStyle = target === 'me' ? '#6b7fd6' : '#e8683a'; pctx.beginPath(); pctx.arc(w / 2 - nw / 2 + 9, ny, 3, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = '#2b2f3a'; pctx.fillText(name, w / 2 + 4, ny + 0.5);
    raf = requestAnimationFrame(loop);
  }

  function assign(group, key, value) {
    if (group) draft[group][key] = value; else draft[key] = value;
    // 몸 종류를 바꿨는데 피부색이 새 팔레트에 없으면 첫 색으로
    if (!group && key === 'body') { const pal = OPTIONS.bodySkins[value] || OPTIONS.skin; if (!pal.includes(draft.skin)) draft.skin = pal[0]; }
  }
  /** Claude 계열 대상은 상의를 세션 색으로 */
  const autoTop = () => { if (target !== 'me' && target !== 'sub') draft.top.color = 'auto'; };

  modal.addEventListener('click', (e) => {
    if (e.target.closest('label.custom')) return;
    const t = e.target.closest('[data-target]');
    if (t) { target = t.dataset.target; draft = structuredClone(avatars.get(target)); render(); return; }
    const p = e.target.closest('button[data-preset]');
    if (p) { const pre = PRESETS.find((x) => x.id === p.dataset.preset); if (pre) { draft = structuredClone(pre.spec); autoTop(); render(); } return; }
    const b = e.target.closest('button[data-key]');
    if (b) { assign(b.dataset.group, b.dataset.key, b.dataset.value); render(); return; }
    const act = e.target.closest('[data-action]');
    if (!act) { if (e.target === modal) close(); return; }
    switch (act.dataset.action) {
      case 'random': draft = randomAvatar(); autoTop(); render(); break;
      case 'reset': draft = structuredClone(avatars.baseFor(target)); render(); break;
      case 'save': avatars.set(target, draft); render(); close(); break;
      case 'close': close(); break;
      case 'delete': avatars.reset(target); draft = structuredClone(avatars.get(target)); render(); break;
      case 'name-roll': { const s = store.selectedSession(); if (s) store.rerollName(s.id); render(); break; }
    }
  });
  // 이름 입력: Enter/포커스 아웃에 바로 저장, Esc 는 입력만 닫음 (모달은 유지), 글자 단축키가 새지 않게
  modal.addEventListener('change', (e) => {
    const i = e.target.closest('input.cz-name-input');
    if (!i) return;
    const s = store.selectedSession();
    if (s) store.setName(s.id, i.value);
    render();
  });
  modal.addEventListener('keydown', (e) => {
    if (!e.target.closest('input.cz-name-input')) return;
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); }
    e.stopPropagation();
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
