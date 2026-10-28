// 층 행의 🎨 버튼 → 인테리어 프리셋 팝오버 (FE-34). 선택은 localStorage(aiOffice.floorStyle.<floorId>) 에 남는다.
import { PRESETS, THEMES, presetById } from './scene/floorStyle.js';
import { LAYOUTS } from './scene/layouts.js';

export function createFloorStylePicker(store, book, { onChange } = {}) {
  const pop = document.createElement('div');
  pop.id = 'floor-style-pop';
  pop.className = 'style-pop hidden';
  document.body.appendChild(pop);
  let floorId = null;

  const chips = (p) => ['dev', 'lounge', 'library'].map((r) => `<i style="background:${p.rooms[r]}"></i>`).join('') + `<i style="background:${p.accent.sofa}"></i>`;
  function render() {
    const floor = store.floors.get(floorId);
    if (!floor) { close(); return; }
    const chosen = book.get(floorId, floor);
    const auto = book.auto(floor, store.floorsByNo());
    const autoP = presetById(auto);
    pop.innerHTML = `
      <div class="style-pop-head">🎨 ${esc(floor.no)}F 인테리어</div>
      <button class="style-opt ${chosen ? '' : 'on'}" data-preset=""><span class="style-chips">${chips(autoP)}</span><span class="style-name">자동 <span class="muted">(${esc(autoP.label)})</span></span></button>
      ${PRESETS.map((p) => `<button class="style-opt ${chosen === p.id ? 'on' : ''}" data-preset="${p.id}"><span class="style-chips">${chips(p)}</span><span class="style-name">${p.emoji} ${esc(p.label)}<span class="style-layout">${esc(LAYOUTS[p.layout] ? LAYOUTS[p.layout].label : '')}</span></span></button>`).join('')}
      <div class="style-pop-sub">테마 <span class="muted">— 구조는 그대로, 색과 소품만</span></div>
      ${THEMES.map((t) => `<button class="style-opt ${chosen === t.id ? 'on' : ''}" data-preset="${t.id}"><span class="style-chips">${chips(t)}</span><span class="style-name">${t.emoji} ${esc(t.label)}</span></button>`).join('')}`;
  }
  function open(id, anchor) {
    floorId = id;
    render();
    pop.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let x = r.right + 8, y = r.top - 6;
    if (x + w > window.innerWidth - 8) x = Math.max(8, r.left - w - 8);
    if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
  }
  function close() { pop.classList.add('hidden'); floorId = null; }
  const isOpen = () => !pop.classList.contains('hidden');

  pop.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-preset]');
    if (!opt || !floorId) return;
    const id = floorId, preset = opt.dataset.preset || null;
    book.set(id, preset);
    // 서버가 층 프리셋을 관리하면(FE-36) 먼저 낙관적으로 반영하고 API 로 저장 → 서버가 'floor' 이벤트로 모든 브라우저에 전파
    const f = store.floors.get(id);
    if (f && 'style' in f) { f.styleOverride = preset; f.style = preset || book.auto(f, store.floorsByNo()); }
    if (onChange) onChange(id);
    render();
    fetch('/api/floors/style', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, style: preset }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.floor && store.floors.has(j.floor.id)) store.applyFloor(j.floor); })
      .catch(() => {});
  });
  document.addEventListener('pointerdown', (e) => { if (isOpen() && !pop.contains(e.target) && !e.target.closest('.floor-style')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { close(); e.stopPropagation(); } }, true);
  window.addEventListener('resize', close);
  store.subscribe((kind) => { if (isOpen() && (kind === 'select' || kind === 'remove' || kind === 'snapshot')) close(); });

  /** 층 목록(#floors) 안의 🎨 클릭을 가로챈다. 층 선택 핸들러보다 먼저(capture) 돈다 */
  document.getElementById('floors').addEventListener('click', (e) => {
    const btn = e.target.closest('.floor-style');
    if (!btn) return;
    e.stopPropagation(); e.preventDefault();
    const row = btn.closest('[data-floor]');
    if (!row) return;
    if (isOpen() && floorId === row.dataset.floor) close(); else open(row.dataset.floor, btn);
  }, true);

  return { open, close, get isOpen() { return isOpen(); } };
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
