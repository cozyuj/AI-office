// 답 기다리는 세션 큐 (FE-73): 헤더 배지 "🙋 답 기다림 N" + 펼치면 오래 기다린 순 목록. 항목을 누르면 그 세션으로 가서 따라간다.
import { store, elapsed } from './store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WAIT_FOR = { permission: '🔐 허락', question: '❓ 질문' };

/** 목록 한 줄에 필요한 값 (테스트에서도 쓴다) */
export function queueRows(now = Date.now()) {
  return store.waitingQueue().map((s) => {
    const f = store.floors.get(s.floorId);
    const since = s.waitingSince || s.lastActivity;
    return { id: s.id, floor: f ? `${f.no}F ${f.name}` : '', title: s.title || `제목 없는 세션 · ${s.id.slice(0, 8)}`, waitFor: WAIT_FOR[s.waitingFor] || WAIT_FOR.question, since, elapsed: elapsed(since, now) };
  });
}

/** onPick(sessionId): 항목 클릭·단축키로 세션을 고를 때 (선택 + 따라가기는 main.js 가 한다) */
export function createWaitQueue({ onPick }) {
  const wrap = document.getElementById('wait-wrap');
  const btn = document.getElementById('wait-btn');
  const count = document.getElementById('wait-count');
  const menu = document.getElementById('wait-menu');
  const list = document.getElementById('wait-list');
  const isOpen = () => !menu.classList.contains('hidden');
  let lastKey = '';

  function setOpen(open) {
    menu.classList.toggle('hidden', !open);
    btn.classList.toggle('on', open);
    if (open) { lastKey = ''; render(); }
  }

  function render(now = Date.now()) {
    const rows = queueRows(now);
    wrap.classList.toggle('hidden', !rows.length);
    if (!rows.length && isOpen()) setOpen(false);
    count.textContent = rows.length;
    btn.title = rows.length ? `답을 기다리는 세션 ${rows.length}개 — 가장 오래: ${rows[0].elapsed} (N 으로 차례로 고르기)` : '';
    if (!isOpen()) return;
    // 목록 구성이 그대로면 경과 시간 글자만 바꾼다 (호버·클릭 중에 행이 다시 만들어지지 않게)
    const key = rows.map((r) => `${r.id}|${r.floor}|${r.title}|${r.waitFor}|${r.id === store.selectedSessionId}`).join('\n');
    if (key === lastKey) {
      for (const el of list.querySelectorAll('.wait-ago[data-since]')) el.textContent = elapsed(Number(el.dataset.since), now);
      return;
    }
    lastKey = key;
    list.innerHTML = rows.map((r, i) => `
      <button class="wait-item ${r.id === store.selectedSessionId ? 'selected' : ''}" data-session="${esc(r.id)}">
        <span class="wait-rank">${i + 1}</span>
        <span class="wait-body">
          <span class="wait-title ellipsis">${esc(r.title)}</span>
          <span class="wait-meta ellipsis"><span class="wait-floor">${esc(r.floor)}</span> · <span class="wait-for">${r.waitFor}</span></span>
        </span>
        <span class="wait-ago" data-since="${r.since}">${r.elapsed}</span>
      </button>`).join('');
  }

  btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!isOpen()); });
  list.addEventListener('click', (e) => {
    const item = e.target.closest('[data-session]');
    if (!item) return;
    setOpen(false);
    onPick(item.dataset.session);
  });
  document.addEventListener('pointerdown', (e) => { if (isOpen() && !wrap.contains(e.target)) setOpen(false); });
  store.subscribe((kind) => { if (kind === 'snapshot' || kind === 'update' || kind === 'remove' || kind === 'select' || kind === 'waiting-count') render(); });
  setInterval(() => render(), 1000);
  render();

  return {
    isOpen, close: () => setOpen(false), render,
    /** 단축키 N: 다음으로 오래 기다린 세션 */
    next() { const s = store.nextWaiting(); if (s) onPick(s.id); return s; },
  };
}
