// 캐릭터/사람 목록 툴팁. 대상(agent, session)과 앵커 함수를 받아 매 프레임 위치를 갱신한다.
import { store, ROOM_LABEL, elapsed, timeAgo } from './store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createTooltip() {
  const el = document.getElementById('tooltip');
  let target = null;   // { agent, session }
  let anchor = null;   // () => ({ x, y }) 화면(뷰포트) 좌표
  let lastText = 0;

  function content(now) {
    const { agent: a, session: s } = target;
    const f = store.floors.get(s.floorId);
    const tool = a.tool;
    const rows = [];
    rows.push(['지금', `${a.icon || ''} ${esc(a.bubble)} <span class="muted">· ${elapsed(a.since, now)}</span>`]);
    if (tool && tool.detail) rows.push(['대상', `<span class="tt-v mono">${esc(tool.detail)}</span>`]);
    const prompt = s.lastPrompt || s.firstPrompt || s.title;
    if (prompt) rows.push(['요청', `<span class="tt-prompt tt-prompt-wrap">"${esc(prompt.length > 160 ? prompt.slice(0, 159) + '…' : prompt)}"</span>`]);
    if (a.kind === 'sub' && a.type) rows.push(['종류', esc(a.type)]);
    if (s.branch) rows.push(['브랜치', `⎇ ${esc(s.branch)}${s.worktree ? ` <span class="muted">(worktree ${esc(s.worktree)})</span>` : ''}`]);
    if (s.cwd) rows.push(['경로', `<span class="tt-v mono">${esc(s.cwd)}</span>`]);
    return `
      <div class="tt-name"><span class="avatar" style="background:${store.colorOf(s, a)}">${a.kind === 'sub' ? '부' : esc((a.name || '?')[0])}</span>${esc(a.name)}${a.kind === 'sub' ? '<span class="sub">서브에이전트</span>' : ''}</div>
      <div class="tt-where">${f ? `${f.no}F ${esc(f.name)}` : ''} · ${ROOM_LABEL[a.room] || a.room} · ${esc(s.title || s.id.slice(0, 8))}</div>
      ${rows.map(([k, v]) => `<div class="tt-row"><span class="tt-k">${k}</span><span class="tt-v">${v}</span></div>`).join('')}
      <div class="tt-foot">세션 시작 ${timeAgo(s.startedAt, now)} · 마지막 활동 ${timeAgo(s.lastActivity, now)} · ${s.id.slice(0, 8)}</div>`;
  }

  function place() {
    if (!anchor) return;
    const p = anchor();
    if (!p) { hide(); return; }
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = p.x + 14, y = p.y - h / 2;
    if (x + w > window.innerWidth - 8) x = p.x - w - 14;
    y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function show(t, anchorFn) {
    target = t; anchor = anchorFn;
    el.innerHTML = content(Date.now());
    lastText = Date.now();
    el.classList.remove('hidden');
    place();
  }
  function hide() { target = null; anchor = null; el.classList.add('hidden'); }

  /** 매 프레임: 위치 갱신, 0.5초마다 내용 갱신 (최신 상태 반영) */
  function frame(now) {
    if (!target) return;
    const s = store.sessions.get(target.session.id);
    const a = s && s.agents && s.agents[target.agent.id];
    if (!s || !a) { hide(); return; }
    target = { agent: a, session: s };
    if (Date.now() - lastText > 500) { el.innerHTML = content(Date.now()); lastText = Date.now(); }
    place();
  }

  return { show, hide, frame, get target() { return target; } };
}
