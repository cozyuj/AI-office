// 캐릭터 고르기 모달: 대상 선택 → 12명 중 하나(Claude 계열은 '자동: 세션마다 다르게'도) 또는 올린 그림 → 걷는 미리보기 → 저장(localStorage)
// 커스텀 캐릭터(FE-56): '＋ PNG 올리기' 타일에 파일을 고르거나 끌어다 놓으면 투명 여백을 잘라 저장하고 그 그림을 고른다.
import { CHARACTERS, drawCharacter, isCustomCharacter, preloadCharacters } from './scene/characters.js';
import { MESSAGES, prepareImage } from './customCharacters.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createCustomizer(store, avatars) {
  const modal = document.getElementById('customize');
  const targetsEl = modal.querySelector('.cz-targets');
  const optsEl = modal.querySelector('.cz-options');
  const preview = modal.querySelector('canvas');
  const pctx = preview.getContext('2d');
  let target = 'me';
  let draft = null; // 캐릭터 이름, 'custom:<id>' 또는 'auto'
  let raf = 0;
  let note = null;  // 올리기 결과 안내 { kind: 'ok' | 'warn' | 'error' | 'busy', text }
  let armed = null; // 지우기 확인 중인 커스텀 값 (× 를 한 번 더 누르면 지운다)

  function targets() {
    const list = [['me', `${store.me} (나)`], ['claude', 'Claude 기본'], ['sub', '서브에이전트 기본']];
    const f = store.selectedFloor();
    if (f) list.push([`floor:${f.id}`, `${f.no}F ${f.name} 의 Claude`]);
    return list;
  }
  const allowAuto = () => target !== 'me';

  function open(initial) {
    target = initial || target;
    draft = avatars.get(target);
    preloadCharacters();
    note = null; armed = null;
    modal.classList.remove('hidden');
    render();
    loop();
  }
  function close() { modal.classList.add('hidden'); cancelAnimationFrame(raf); raf = 0; }

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

  function render() {
    targetsEl.innerHTML = targets().map(([k, label]) => `<button class="cz-target ${k === target ? 'on' : ''}" data-target="${esc(k)}">${esc(label)}${avatars.has(k) ? '' : '<span class="muted"> · 기본</span>'}</button>`).join('');
    const auto = allowAuto() ? `<button class="cz-preset cz-auto ${draft === 'auto' ? 'on' : ''}" data-char="auto" title="세션마다 다른 캐릭터 (어느 브라우저에서도 같은 세션은 같은 캐릭터)"><span class="cz-auto-icon">🎲</span><span>자동</span></button>` : '';
    const customs = avatars.customs.list().map((c) => `<div class="cz-preset cz-custom ${c.value === draft ? 'on' : ''}" data-char="${esc(c.value)}" role="button" tabindex="0" title="${esc(c.name || '커스텀 캐릭터')}"><canvas class="cz-thumb" data-char="${esc(c.value)}"></canvas>`
      + `<button class="cz-del ${armed === c.value ? 'armed' : ''}" data-action="custom-del" data-value="${esc(c.value)}" title="${armed === c.value ? '한 번 더 누르면 지웁니다 — 이 그림을 쓰던 대상은 기본값으로' : '이 커스텀 캐릭터 지우기'}">${armed === c.value ? '지우기' : '×'}</button></div>`).join('');
    const upload = `<label class="cz-preset cz-upload" title="배경이 투명한 PNG 를 고르거나 여기에 끌어다 놓기"><input type="file" class="cz-file" accept="image/png,image/webp,image/gif,image/*" multiple hidden><span class="cz-auto-icon">＋</span><span>PNG 올리기</span></label>`;
    optsEl.innerHTML = `
      ${nameRow()}
      <div class="cz-group"><div class="cz-label">캐릭터${allowAuto() ? ' <span class="muted">— 자동이면 세션마다 다르게</span>' : ''}</div>
        <div class="cz-presets">${auto}${CHARACTERS.map((c) => `<button class="cz-preset ${c === draft ? 'on' : ''}" data-char="${c}" title="${c}"><canvas class="cz-thumb" data-char="${c}"></canvas></button>`).join('')}</div></div>
      <div class="cz-group"><div class="cz-label">내 캐릭터 <span class="muted">— 배경 없는 PNG 를 올리거나 끌어다 놓기 · 자동에는 섞이지 않음</span></div>
        <div class="cz-presets">${customs}${upload}</div>
        ${note ? `<div class="cz-note ${note.kind}">${esc(note.text)}</div>` : ''}</div>
      <div class="cz-credit muted">캐릭터: <a href="https://kenney.nl/assets/mini-characters" target="_blank" rel="noopener">Kenney Mini Characters</a> (CC0)</div>`;
    sizeThumbs();
  }

  /** 파일 여러 장을 차례로 다듬어 저장. 마지막으로 성공한 그림을 고른다 */
  async function upload(files) {
    const list = [...(files || [])];
    if (!list.length) return;
    armed = null; note = { kind: 'busy', text: '그림을 다듬는 중…' }; render();
    let last = null, warn = null, error = null;
    for (const f of list) {
      const img = await prepareImage(f);
      if (img.error) { error = img.error; continue; }
      const r = avatars.customs.add(img);
      if (r.error) { error = r.error; break; }
      last = r.value;
      if (img.opaque) warn = 'opaque';
    }
    if (last) draft = last;
    note = error ? { kind: 'error', text: MESSAGES[error] } : warn ? { kind: 'warn', text: MESSAGES[warn] } : { kind: 'ok', text: MESSAGES.added };
    render();
  }

  const TW = 56, TH = 64;
  function sizeThumbs() {
    const dpr = window.devicePixelRatio || 1;
    for (const c of optsEl.querySelectorAll('canvas.cz-thumb')) { c.width = TW * dpr; c.height = TH * dpr; c.style.width = `${TW}px`; c.style.height = `${TH}px`; }
  }
  /** 썸네일: 서 있는 첫 칸. 시트가 늦게 오므로 매 프레임 그린다 (12장, 작다). 올린 그림은 뒤집지 않고 올린 그대로 */
  function drawThumbs() {
    const dpr = window.devicePixelRatio || 1;
    for (const c of optsEl.querySelectorAll('canvas.cz-thumb')) {
      const cx = c.getContext('2d');
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, TW, TH);
      drawCharacter(cx, TW / 2, TH - 4, c.dataset.char, { scale: 0.95, faceRight: !isCustomCharacter(c.dataset.char) });
    }
  }

  /** 미리보기에 그릴 캐릭터: 자동이면 1.5초마다 돌아가며 */
  function previewChar() {
    if (draft !== 'auto') return draft;
    return CHARACTERS[Math.floor(performance.now() / 1500) % CHARACTERS.length];
  }

  function loop() {
    const dpr = window.devicePixelRatio || 1;
    const w = 180, h = 210;
    if (preview.width !== w * dpr) { preview.width = w * dpr; preview.height = h * dpr; preview.style.width = `${w}px`; preview.style.height = `${h}px`; }
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, w, h);
    pctx.fillStyle = 'rgba(0,0,0,0.08)'; pctx.beginPath(); pctx.ellipse(w / 2, h - 22, 40, 11, 0, 0, Math.PI * 2); pctx.fill();
    const t = performance.now() / 1000;
    drawCharacter(pctx, w / 2, h - 22, previewChar(), { walking: true, walkT: t, now: performance.now(), faceRight: Math.sin(t / 1.5) > 0, scale: 2.5, hardHat: target === 'sub' });
    // 이름표 (사무실의 발 아래 이름표와 같은 모양)
    const name = previewName();
    pctx.font = '700 11px system-ui, -apple-system, sans-serif'; pctx.textAlign = 'center'; pctx.textBaseline = 'middle';
    const nw = pctx.measureText(name).width + 20, ny = h - 9;
    pctx.fillStyle = 'rgba(255,255,255,0.95)'; pctx.strokeStyle = 'rgba(0,0,0,0.12)'; pctx.lineWidth = 1;
    pctx.beginPath(); pctx.roundRect(w / 2 - nw / 2, ny - 9, nw, 18, 9); pctx.fill(); pctx.stroke();
    pctx.fillStyle = target === 'me' ? '#6b7fd6' : '#e8683a'; pctx.beginPath(); pctx.arc(w / 2 - nw / 2 + 9, ny, 3, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = '#2b2f3a'; pctx.fillText(name, w / 2 + 4, ny + 0.5);
    drawThumbs();
    raf = requestAnimationFrame(loop);
  }

  modal.addEventListener('click', (e) => {
    const del = e.target.closest('[data-action="custom-del"]');
    if (del) {
      const v = del.dataset.value;
      if (armed !== v) { armed = v; render(); return; }
      avatars.customs.remove(v);
      armed = null; note = null;
      if (draft === v) draft = avatars.get(target);
      render(); return;
    }
    const t = e.target.closest('[data-target]');
    if (t) { target = t.dataset.target; draft = avatars.get(target); note = null; armed = null; render(); return; }
    const c = e.target.closest('.cz-preset[data-char]');
    if (c) { draft = c.dataset.char; armed = null; render(); return; }
    const act = e.target.closest('[data-action]');
    if (!act) { if (e.target === modal) close(); return; }
    switch (act.dataset.action) {
      case 'random': { const rest = CHARACTERS.filter((x) => x !== draft); draft = rest[Math.floor(Math.random() * rest.length)]; render(); break; }
      case 'reset': draft = avatars.baseFor(target); render(); break;
      case 'save': avatars.set(target, draft); render(); close(); break;
      case 'close': close(); break;
      case 'delete': avatars.reset(target); draft = avatars.get(target); render(); break;
      case 'name-roll': { const s = store.selectedSession(); if (s) store.rerollName(s.id); render(); break; }
    }
  });
  // 이름 입력: Enter/포커스 아웃에 바로 저장, Esc 는 입력만 닫음 (모달은 유지), 글자 단축키가 새지 않게
  modal.addEventListener('change', (e) => {
    if (e.target.closest('input.cz-file')) { upload(e.target.files); return; }
    const i = e.target.closest('input.cz-name-input');
    if (!i) return;
    const s = store.selectedSession();
    if (s) store.setName(s.id, i.value);
    render();
  });
  // 끌어다 놓기: 창 어디에 놓아도 올린다 (끄는 동안 올리기 타일이 강조된다). 빗나가 페이지가 그림으로 바뀌는 일도 막는다
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  modal.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; optsEl.classList.add('cz-dropping'); });
  modal.addEventListener('dragleave', (e) => { if (!modal.contains(e.relatedTarget)) optsEl.classList.remove('cz-dropping'); });
  modal.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); optsEl.classList.remove('cz-dropping');
    upload(e.dataTransfer.files);
  });
  modal.addEventListener('keydown', (e) => {
    const tile = e.target.closest('.cz-custom');
    if (tile && e.target === tile && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); draft = tile.dataset.char; render(); return; }
    if (!e.target.closest('input.cz-name-input')) return;
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); }
    e.stopPropagation();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });

  return { open, close };
}
