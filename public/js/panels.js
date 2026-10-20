// 좌·우 패널과 상단 헤더 DOM 렌더링. store 가 바뀌거나 1초마다 다시 그린다.
import { store, ROOM_LABEL, LEGEND, timeAgo, elapsed, clock, shortPath } from './store.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATUS_LABEL = { working: '작업 중', thinking: '고민 중', waiting: '답 기다리는 중', idle: '대기', ended: '퇴근' };

function initials(name) { return (name || '?').trim().slice(0, 1).toUpperCase(); }

export function renderHeader() {
  const f = store.selectedFloor();
  const s = store.selectedSession();
  $('head-badge').textContent = f ? `${f.no}F` : '–';
  $('head-title').textContent = f ? f.name : '사무실';
  $('head-sub').innerHTML = s
    ? `<span class="dot ${s.status}"></span> ${esc(s.title || '제목 없는 세션')} · ${STATUS_LABEL[s.status] || s.status}`
    : (store.sessions.size ? '세션을 선택하세요' : '훅 이벤트를 기다리는 중');
  const live = $('live');
  live.classList.toggle('off', !store.connected);
  live.querySelector('b').textContent = store.connected ? 'LIVE' : 'OFFLINE';
  $('info-project').textContent = f ? shortPath(f.id) : '–';
  $('info-project').title = f ? f.id : '';
  $('info-session').textContent = s ? s.id.slice(0, 8) : '–';
  $('info-session').title = s ? s.id : '';
  $('stage-empty').classList.toggle('hidden', store.sessions.size > 0);
}

export function renderFloors() {
  const now = Date.now();
  const floors = store.floorsByNo();
  const el = $('floors');
  if (!floors.length) {
    el.innerHTML = '<div class="muted" style="padding:14px;text-align:center">아직 열린 층이 없습니다</div>';
    $('left-foot').textContent = '';
    return;
  }
  el.innerHTML = floors.map((f) => {
    const selected = f.id === store.selectedFloorId;
    const sessions = store.sessionsOfFloorStable(f.id, now);
    const status = store.floorStatus(f.id);
    const head = `
      <div class="floor-row" data-floor="${esc(f.id)}">
        <span class="floor-badge">${f.no}F</span>
        <div class="floor-text">
          <div class="floor-name">${esc(f.name)}</div>
          <div class="floor-meta">세션 ${sessions.length}개 · ${status === 'idle' ? timeAgo(f.lastActivity, now) : STATUS_LABEL[status]}</div>
        </div>
        ${store.waitingOfFloor(f.id).length ? `<span class="badge-wait">${store.waitingOfFloor(f.id).length}</span>` : ''}
        <span class="dot ${status}"></span>
      </div>`;
    if (!selected) return `<div class="floor">${head}</div>`;
    const list = sessions.map((s) => `
      <div class="session ${s.id === store.selectedSessionId ? 'selected' : ''} ${s.title ? '' : 'untitled'}" data-session="${esc(s.id)}" title="${esc(s.title || s.id)}">
        <span class="dot ${s.status}"></span>
        <span class="session-title">${esc(s.title || `제목 없는 세션 · ${s.id.slice(0, 8)}`)}</span>
        ${s.status === 'waiting' ? '<span class="badge-wait">답 기다림</span>' : ''}
        ${s.id === store.selectedSessionId ? '<span class="session-tag">지금 보는 중</span>' : `<span class="session-time">${timeAgo(s.lastActivity, now)}</span>`}
      </div>`).join('');
    return `<div class="floor selected">${head}
      <div class="floor-sessions">
        <label class="follow"><input type="checkbox" id="auto-follow" ${store.autoFollow ? 'checked' : ''}> 최근 세션 자동으로 따라가기</label>
        ${list}
      </div></div>`;
  }).join('');
  $('left-foot').textContent = `프로젝트 ${floors.length}개 · 세션 ${store.sessions.size}개`;
}

export function renderPeople() {
  const now = Date.now();
  const sessions = store.sessionsOfFloorStable(store.selectedFloorId, now);
  let count = 0;
  const html = sessions.map((s) => {
    const agents = Object.values(s.agents || {}).sort((a, b) => (a.kind === 'main' ? -1 : 1) - (b.kind === 'main' ? -1 : 1));
    count += agents.length;
    const selected = s.id === store.selectedSessionId;
    return `<div class="people-group ${selected ? 'selected' : ''}" data-session="${esc(s.id)}">
      <div class="people-head"><span class="dot ${s.status}"></span><span class="people-title">${esc(s.title || `제목 없는 세션 · ${s.id.slice(0, 8)}`)}</span><span class="muted">${STATUS_LABEL[s.status] || ''}</span></div>
      ${agents.map((a) => `
      <div class="person ${selected ? 'selected' : 'dim'}" data-session="${esc(s.id)}" data-agent="${esc(a.id)}">
        <span class="avatar" style="background:${store.colorOf(s, a)}">${a.kind === 'sub' ? '부' : initials(a.name)}</span>
        <div class="person-body">
          <div class="person-name">${esc(a.name)}${a.kind === 'sub' ? '<span class="sub">서브</span>' : ''}<span class="room">${ROOM_LABEL[a.room] || a.room}</span></div>
          <div class="person-act">${a.icon || ''} ${esc(a.bubble)} <span class="ago">· ${elapsed(a.since, now)}</span></div>
        </div>
      </div>`).join('')}
    </div>`;
  }).join('');
  $('people-count').textContent = count ? `${count}명 근무 중` : '';
  $('people').innerHTML = html || '<div class="muted" style="padding:6px 8px">이 층에는 아무도 없습니다</div>';
}

export function renderLog() {
  const items = store.logOfFloor(store.selectedFloorId);
  $('log-count').textContent = items.length ? `${items.length}건` : '';
  let prevKey = null;
  $('log').innerHTML = items.length ? items.map((e) => {
    const s = store.sessions.get(e.sessionId);
    const color = s ? store.colorOf(s, null) : '#b3b9c2';
    const key = `${e.sessionId}/${e.agentId}`;
    const same = key === prevKey;
    prevKey = key;
    const d = new Date(e.t);
    return `
    <div class="log-item ${e.sessionId === store.selectedSessionId ? '' : 'dim'} ${same ? 'cont' : ''}" data-session="${esc(e.sessionId)}" style="border-left-color:${color}">
      <span class="log-time" title="${d.toLocaleString()}">${same ? '' : clock(e.t)}</span>
      <span>${same ? '' : `<span class="log-who">${esc(e.agentName)}</span>`}${e.icon || ''} <span class="log-text">${esc(e.text)}</span></span>
    </div>`;
  }).join('') : '<div class="muted" style="padding:6px 4px">아직 활동이 없습니다</div>';
}

export function renderLegend() {
  $('legend').innerHTML = LEGEND.map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join('');
}

export function renderAll() {
  renderHeader();
  renderFloors();
  renderPeople();
  renderLog();
}

export function bindPanelEvents() {
  $('floors').addEventListener('click', (e) => {
    const follow = e.target.closest('#auto-follow');
    if (follow) { store.setAutoFollow(follow.checked); return; }
    if (e.target.closest('.follow')) return;
    const sess = e.target.closest('[data-session]');
    if (sess) { store.selectSession(sess.dataset.session); return; }
    const floor = e.target.closest('[data-floor]');
    if (floor) store.selectFloor(floor.dataset.floor);
  });
  const pick = (e) => { const el = e.target.closest('[data-session]'); if (el) store.selectSession(el.dataset.session); };
  $('people').addEventListener('click', pick);
  $('log').addEventListener('click', pick);
  renderLegend();
}
