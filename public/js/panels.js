// 좌·우 패널과 상단 헤더 DOM 렌더링. store 가 바뀌거나 1초마다 다시 그린다.
import { store, ROOM_LABEL, LEGEND, timeAgo, elapsed, clock, shortPath } from './store.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATUS_LABEL = { working: '작업 중', thinking: '고민 중', waiting: '답 기다리는 중', idle: '대기', away: '자리 비움', ended: '퇴근' };
/** 진행 중(working/thinking/waiting)이 아닌 세션만 목록에서 치울 수 있다 */
export const canDismiss = (s) => !!s && (s.status === 'ended' || s.status === 'away' || s.status === 'idle');
const dismissing = new Set();
/** 서버에서 세션을 제거 → SSE 'remove' 가 모든 브라우저의 store 를 갱신한다 */
export async function dismissSession(id) {
  if (!id || dismissing.has(id)) return false;
  dismissing.add(id);
  try { const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }); return r.ok; }
  catch { return false; }
  finally { dismissing.delete(id); }
}

function initials(name) { return (name || '?').trim().slice(0, 1).toUpperCase(); }

export function renderBanner() {
  const el = $('banner');
  const sp = store.serverPort, hp = store.hookPort;
  const show = (html) => { el.innerHTML = html; el.classList.remove('hidden'); document.body.classList.add('has-banner'); };
  const hide = () => { el.classList.add('hidden'); document.body.classList.remove('has-banner'); };
  if (!sp || !store.connected) { hide(); return; }
  if (hp === null) { show('Claude Code 훅이 아직 등록되지 않았습니다. 터미널에서 <code>npx github:cozyuj/AI-office install-hooks</code> 를 실행하세요.'); return; }
  if (hp !== sp) { show(`훅은 포트 <b>${hp}</b> 로 보내는데 이 서버는 <b>${sp}</b> 에 떠 있어 이벤트가 안 들어옵니다. <code>ai-office install-hooks --port ${sp}</code> 로 맞추거나 서버를 <code>--port ${hp}</code> 로 띄우세요.`); return; }
  hide();
}

export function renderHeader() {
  renderBanner();
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
  live.title = store.version ? `AI Office v${store.version}` : '';
  $('info-project').textContent = f ? shortPath(f.id) : '–';
  $('info-project').title = f ? f.id : '';
  $('info-session').textContent = s ? s.id.slice(0, 8) : '–';
  $('info-session').title = s ? s.id : '';
  const cmd = s ? `claude --resume ${s.id}` : '';
  $('resume-cmd').textContent = cmd || '–';
  $('resume-cmd').title = cmd ? `${cmd}  (프로젝트 폴더: ${s.cwd || store.selectedFloor()?.id || ''})` : '';
  $('resume-copy').disabled = !s;
  $('resume-copy').dataset.cmd = cmd;
  const dismissBtn = $('session-dismiss');
  dismissBtn.classList.toggle('hidden', !canDismiss(s));
  dismissBtn.dataset.dismiss = s ? s.id : '';
  dismissBtn.title = s ? `${STATUS_LABEL[s.status] || s.status} 세션을 목록에서 치우기 (TTL 을 기다리지 않음)` : '';
  const nameEl = $('info-name');
  if (document.activeElement !== nameEl) { nameEl.value = s ? store.nameOf(s, null) : ''; nameEl.classList.toggle('auto', !!s && !store.names.isCustom(s.id)); }
  nameEl.disabled = !s; $('name-roll').disabled = !s;
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
      <div class="session ${s.id === store.selectedSessionId ? 'selected' : ''} ${s.title ? '' : 'untitled'} ${s.status === 'away' || s.status === 'ended' ? 'away' : ''}" data-session="${esc(s.id)}" data-tip="${esc(s.title || s.id)}">
        <span class="dot ${s.status}"></span>
        <span class="session-body">
          <span class="session-line">
            <span class="session-title ellipsis">${esc(s.title || `제목 없는 세션 · ${s.id.slice(0, 8)}`)}</span>
            ${s.id === store.selectedSessionId ? '<span class="session-tag">지금 보는 중</span>' : `<span class="session-time">${timeAgo(s.lastActivity, now)}</span>`}
            ${canDismiss(s) ? `<button class="session-dismiss" data-dismiss="${esc(s.id)}" title="${STATUS_LABEL[s.status]} 세션을 목록에서 치우기">✕</button>` : ''}
          </span>
          ${s.branch || s.status === 'waiting' ? `<span class="session-line">
            ${s.branch ? `<span class="branch" title="${esc(s.worktree ? `worktree ${s.worktree}` : s.branch)}">⎇ ${esc(s.branch)}</span>` : ''}
            ${s.status === 'waiting' ? '<span class="badge-wait">답 기다림</span>' : ''}
          </span>` : ''}
        </span>
      </div>`).join('');
    return `<div class="floor selected">${head}
      <div class="floor-sessions">
        <label class="follow"><input type="checkbox" id="auto-follow" ${store.autoFollow ? 'checked' : ''}> 최근 세션 자동으로 따라가기</label>
        ${list}
      </div></div>`;
  }).join('');
  $('left-foot').textContent = `프로젝트 ${floors.length}개 · 세션 ${store.sessions.size}개${store.version ? ` · v${store.version}` : ''}`;
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
      <div class="people-head"><span class="dot ${s.status}"></span><span class="people-title ellipsis" data-tip="${esc(s.title || s.id)}">${esc(s.title || `제목 없는 세션 · ${s.id.slice(0, 8)}`)}</span><span class="muted">${STATUS_LABEL[s.status] || ''}</span></div>
      ${agents.map((a) => { const name = store.nameOf(s, a); return `
      <div class="person ${selected ? 'selected' : 'dim'}" data-session="${esc(s.id)}" data-agent="${esc(a.id)}">
        <span class="avatar" style="background:${store.colorOf(s, a)}">${a.kind === 'sub' ? '부' : initials(name)}</span>
        <div class="person-body">
          <div class="person-name">${esc(name)}${a.kind === 'sub' ? '<span class="sub">서브</span>' : ''}<span class="room">${ROOM_LABEL[a.room] || a.room}</span></div>
          <div class="person-act ellipsis" data-tip="${esc(a.bubble)}">${a.icon || ''} ${esc(a.bubble)} <span class="ago">· ${elapsed(a.since, now)}</span></div>
        </div>
      </div>`; }).join('')}
    </div>`;
  }).join('');
  $('people-count').textContent = count ? `${count}명 근무 중` : '';
  $('people').innerHTML = html || '<div class="muted" style="padding:6px 8px">이 층에는 아무도 없습니다</div>';
}

export function renderLog() {
  const items = store.logOfFloor(store.selectedFloorId);
  const filtered = store.logFilter.q || store.logFilter.mine;
  $('log-count').textContent = items.total ? (filtered ? `${items.length} / ${items.total}건` : `${items.total}건`) : '';
  $('log-mine').classList.toggle('on', store.logFilter.mine);
  let prevKey = null;
  $('log').innerHTML = items.length ? items.map((e) => {
    const s = store.sessions.get(e.sessionId);
    const color = s ? store.colorOf(s, null) : '#b3b9c2';
    const key = `${e.sessionId}/${e.agentId}`;
    const who = store.logWho(e);
    const same = key === prevKey;
    prevKey = key;
    const d = new Date(e.t);
    return `
    <div class="log-item ${e.sessionId === store.selectedSessionId ? '' : 'dim'} ${same ? 'cont' : ''}" data-session="${esc(e.sessionId)}" style="border-left-color:${color}">
      <span class="log-time" title="${d.toLocaleString()}">${same ? '' : clock(e.t)}</span>
      <span class="ellipsis" data-tip="${esc(who)} · ${esc(e.text)}">${same ? '' : `<span class="log-who">${esc(who)}</span>`}${e.icon || ''} <span class="log-text">${esc(e.text)}</span></span>
    </div>`;
  }).join('') : `<div class="muted" style="padding:6px 4px">${filtered ? '조건에 맞는 로그가 없습니다' : '아직 활동이 없습니다'}</div>`;
}

export function renderLegend() {
  $('legend').innerHTML = LEGEND.map(([k, v]) => `<span class="ellipsis" data-tip="${k} ${v}"><b>${k}</b> ${v}</span>`).join('');
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
    const dismiss = e.target.closest('[data-dismiss]');
    if (dismiss) { e.stopPropagation(); dismissSession(dismiss.dataset.dismiss); return; }
    const sess = e.target.closest('[data-session]');
    if (sess) { store.selectSession(sess.dataset.session); return; }
    const floor = e.target.closest('[data-floor]');
    if (floor) store.selectFloor(floor.dataset.floor);
  });
  $('log-search').addEventListener('input', (e) => store.setLogFilter({ q: e.target.value }));
  $('log-mine').addEventListener('click', () => store.setLogFilter({ mine: !store.logFilter.mine }));
  // 세션 캐릭터 이름: 입력(빈 값이면 자동 별명으로) · 🎲 다른 별명
  const nameEl = $('info-name');
  nameEl.addEventListener('change', () => { const s = store.selectedSession(); if (s) store.setName(s.id, nameEl.value); nameEl.blur(); });
  nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); nameEl.blur(); } e.stopPropagation(); });
  $('name-roll').addEventListener('click', () => { const s = store.selectedSession(); if (s) store.rerollName(s.id); });
  $('session-dismiss').addEventListener('click', (e) => { const s = store.selectedSession(); if (canDismiss(s)) dismissSession(s.id); });
  const pick = (e) => { const el = e.target.closest('[data-session]'); if (el) store.selectSession(el.dataset.session); };
  $('people').addEventListener('click', pick);
  $('log').addEventListener('click', pick);
  // 범례 접기/펼치기 (작은 창에서는 기본 접힘, 클릭으로 토글, 기억)
  const legendCard = $('legend-card');
  let legendState = null; try { legendState = localStorage.getItem('aiOffice.legend'); } catch {}
  const applyLegend = () => { legendCard.classList.toggle('collapsed', legendState === 'collapsed'); legendCard.classList.toggle('expanded', legendState === 'expanded'); };
  applyLegend();
  legendCard.querySelector('.card-head').addEventListener('click', () => {
    const small = window.innerHeight <= 640;
    const visibleNow = legendState === 'expanded' || (legendState !== 'collapsed' && !small);
    legendState = visibleNow ? 'collapsed' : 'expanded';
    try { localStorage.setItem('aiOffice.legend', legendState); } catch {}
    applyLegend();
  });
  renderLegend();
}
