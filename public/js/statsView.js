// 오늘의 근무 기록 모달 (FE-72): GET /api/stats?date= 로 하루 요약을 받아 합계·프로젝트별·세션별·도구 종류별로 보여준다.
// 문구는 한국어로 쓰고 영어는 i18n 사전이 DOM 에서 바꾼다.
import { shortPath } from './store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n, 12).getTime()); };
const KEEP_DAYS = 30;
const REFRESH_MS = 10 * 1000;

/** 하루 단위 시간: 0 이면 –, 아니면 store.elapsed 와 같은 꼴 (i18n 규칙이 그대로 번역) */
export function dur(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (!s) return '–';
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${s % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
const num = (n) => (n ? String(n) : '–');
const toolChips = (byName, limit = 99) => Object.entries(byName || {}).sort((a, b) => b[1] - a[1]).slice(0, limit)
  .map(([k, v]) => `<span class="stats-chip">${esc(k.replace(/^mcp__/, ''))} <b>${v}</b></span>`).join('');

function bar(row, max) {
  const w = (ms) => (max ? (100 * ms) / max : 0).toFixed(1);
  return `<div class="stats-bar" title="일한 시간 ${dur(row.workMs)} · 기다린 시간 ${dur(row.waitMs)}"><i class="work" style="width:${w(row.workMs)}%"></i><i class="wait" style="width:${w(row.waitMs)}%"></i></div>`;
}

function render(sum) {
  if (!sum.totals.sessions) return '<div class="stats-empty muted">이 날은 기록이 없습니다</div>';
  const t = sum.totals;
  const tiles = [
    ['🛠️', '일한 시간', dur(t.workMs)], ['🙋', '답 기다린 시간', dur(t.waitMs)], ['💬', '요청 수', num(t.prompts)],
    ['🔧', '도구 사용', num(t.tools)], ['✏️', '고친 파일', num(t.files)], ['🤝', '서브에이전트 수', num(t.subagents)],
  ].map(([i, k, v]) => `<div class="stats-tile"><span class="stats-tile-k">${i} ${k}</span><span class="stats-tile-v">${v}</span></div>`).join('');
  const max = Math.max(1, ...sum.projects.map((p) => p.workMs + p.waitMs), ...sum.sessions.map((s) => s.workMs + s.waitMs));
  const head = (first) => `<tr><th>${first}</th><th class="stats-bar-col"></th><th>일한 시간</th><th>기다린 시간</th><th>요청 수</th><th>도구</th><th>고친 파일</th><th>서브에이전트 수</th></tr>`;
  const cells = (r) => `<td class="stats-bar-col">${bar(r, max)}</td><td>${dur(r.workMs)}</td><td>${dur(r.waitMs)}</td><td>${num(r.prompts)}</td><td title="${esc(Object.entries(r.toolsByName).map(([k, v]) => `${k} ${v}`).join(' · '))}">${num(r.tools)}</td><td>${num(r.files)}</td><td>${num(r.subagents)}</td>`;
  const projName = new Map(sum.projects.map((p) => [p.id, p.name]));
  const projects = sum.projects.map((p) => `<tr><td class="stats-name" title="${esc(shortPath(p.id))}">${esc(p.name)} <span class="muted">${p.sessions}</span></td>${cells(p)}</tr>`).join('');
  const sessions = sum.sessions.map((s) => `<tr><td class="stats-name" title="${esc(s.title)}"><span class="ellipsis">${esc(s.title) || '제목 없는 세션'}</span><span class="muted stats-sub">${esc(projName.get(s.project || '(unknown)') || '')}${s.branch ? ` · ${esc(s.branch)}` : ''}</span></td>${cells(s)}</tr>`).join('');
  return `<div class="stats-tiles">${tiles}</div>
    <div class="stats-legend muted"><i class="work"></i>일한 시간 (생각·작업) <i class="wait"></i>답 기다린 시간</div>
    <h4>프로젝트별</h4><table class="stats-table">${head('프로젝트')}${projects}</table>
    <h4>세션별</h4><table class="stats-table">${head('세션')}${sessions}</table>
    <h4>도구 종류별</h4><div class="stats-chips">${toolChips(t.toolsByName)}</div>`;
}

export function createStatsView(root = document.getElementById('stats')) {
  const body = root.querySelector('.stats-body');
  const label = root.querySelector('.stats-date');
  const prev = root.querySelector('[data-action="prev"]');
  const next = root.querySelector('[data-action="next"]');
  let date = dayKey(Date.now());
  let timer = null;
  let seq = 0;
  const isOpen = () => !root.classList.contains('hidden');

  async function load() {
    const today = dayKey(Date.now());
    if (date > today) date = today;
    label.innerHTML = `${date} <span class="stats-when">${date === today ? '오늘' : date === addDays(today, -1) ? '어제' : ''}</span>`;
    next.disabled = date >= today;
    prev.disabled = date <= addDays(today, -(KEEP_DAYS - 1));
    const my = ++seq;
    try {
      const r = await fetch(`/api/stats?date=${date}`);
      const sum = await r.json();
      if (my !== seq) return;
      body.innerHTML = r.ok ? render(sum) : '<div class="stats-empty muted">기록을 불러오지 못했습니다</div>';
    } catch {
      if (my === seq) body.innerHTML = '<div class="stats-empty muted">기록을 불러오지 못했습니다</div>';
    }
  }
  function open() {
    date = dayKey(Date.now());
    root.classList.remove('hidden');
    load();
    clearInterval(timer);
    timer = setInterval(() => { if (date === dayKey(Date.now())) load(); }, REFRESH_MS); // 오늘은 계속 쌓이니 열려 있는 동안 새로
  }
  function close() { root.classList.add('hidden'); clearInterval(timer); timer = null; }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (e.target === root || a?.dataset.action === 'close') return close();
    if (!a) return;
    if (a.dataset.action === 'prev') { date = addDays(date, -1); load(); }
    else if (a.dataset.action === 'next') { date = addDays(date, 1); load(); }
    else if (a.dataset.action === 'today') { date = dayKey(Date.now()); load(); }
  });
  // 열려 있는 동안은 사무실 단축키를 쉬게 한다: Esc 는 닫기, ←/→ 는 날짜 이동
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && !prev.disabled) { date = addDays(date, -1); load(); }
    else if (e.key === 'ArrowRight' && !next.disabled) { date = addDays(date, 1); load(); }
  }, true);

  return { open, close, isOpen };
}
