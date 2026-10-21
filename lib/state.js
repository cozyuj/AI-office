'use strict';
// 사무실 상태 머신. 훅 payload → 층(프로젝트)/세션/캐릭터(Agent) 의 방·활동·말풍선.
// 전이 규칙: docs/ARCHITECTURE.md 3절. 도구→방 매핑: lib/normalize.js describeTool.

const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const { normalize, describeTool, ACTIVITY_ICON, cut } = require('./normalize');

const LOG_LIMIT = 500;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2시간 무활동이면 퇴근 처리
const SUBAGENT_LEAVE_MS = 4000;             // 서브에이전트가 엘리베이터까지 걸어가는 시간
const SESSION_LEAVE_MS = 10000;             // SessionEnd 후 세션 제거까지
const AWAY_MS = 30 * 60 * 1000;             // 30분 무활동 → 자리 비움
const GONE_CHECK_MS = 10 * 60 * 1000;       // 10분 무활동부터 transcript 확인 시작
const GONE_MS = 60 * 60 * 1000;             // transcript 갱신 없이 60분 → 퇴근 처리
const STAT_INTERVAL_MS = 60 * 1000;         // 세션당 stat 호출 간격

const THINK = { activity: 'think', bubble: '고민 중…' };

function defaultStat(file) {
  try { return { mtimeMs: fs.statSync(file).mtimeMs }; } catch { return null; }
}

function createState({ me = 'me', statFile = defaultStat } = {}) {
  const emitter = new EventEmitter();
  const floors = new Map();   // cwd → Floor
  const sessions = new Map(); // session_id → Session
  const log = [];
  const timers = [];          // { at, fn }  sweep(now) 가 실행
  let floorSeq = 0;

  // ---------- 조회/생성 ----------
  /** 같은 basename 끼리는 상위 폴더를 붙여 구분되도록 모든 층 이름을 다시 계산한다. 바뀐 층 목록 반환 */
  function renameFloors() {
    const segs = (id) => id.split(/[\\/]+/).filter(Boolean);
    const nameOf = (id, depth) => { const p = segs(id); return p.slice(Math.max(0, p.length - depth)).join('/') || id; };
    const list = [...floors.values()];
    const changed = [];
    for (const f of list) {
      let depth = 1, name = nameOf(f.id, depth);
      const clash = (n, d) => list.some((o) => o !== f && nameOf(o.id, d) === n);
      while (clash(name, depth) && depth < segs(f.id).length) { depth++; name = nameOf(f.id, depth); }
      if (f.name !== name) { f.name = name; changed.push(f); }
    }
    return changed;
  }

  function floorFor(cwd, now) {
    const id = cwd || '(unknown)';
    let f = floors.get(id);
    if (!f) {
      f = { id, name: path.basename(id) || id, no: ++floorSeq, sessions: new Set(), lastActivity: now };
      floors.set(id, f);
      for (const other of renameFloors()) if (other !== f) emitter.emit('floor', publicFloor(other));
    }
    f.lastActivity = now;
    return f;
  }

  function sessionFor(ev, now) {
    const floor = floorFor(ev.cwd, now);
    let s = sessions.get(ev.sessionId);
    if (!s) {
      s = {
        id: ev.sessionId, floorId: floor.id, title: ev.sessionTitle, status: 'idle',
        startedAt: now, lastActivity: now, agents: {}, pendingSubagents: [], ended: false, firstPrompt: '', lastPrompt: '',
        transcriptPath: ev.transcriptPath, lastStatAt: 0,
      };
      sessions.set(s.id, s);
      floor.sessions.add(s.id);
    }
    if (ev.sessionTitle && !s.title) s.title = ev.sessionTitle;
    if (ev.transcriptPath) s.transcriptPath = ev.transcriptPath;
    s.lastActivity = now;
    return { session: s, floor };
  }

  function mainAgent(s, now) {
    let a = s.agents.main;
    if (!a) {
      a = s.agents.main = {
        id: 'main', sessionId: s.id, kind: 'main', name: 'Claude', type: 'main',
        room: 'mydesk', activity: 'arrive', icon: ACTIVITY_ICON.arrive, bubble: '출근했습니다',
        tool: null, since: now, arrivedAt: now, leaving: false,
      };
    }
    return a;
  }

  function subAgent(s, ev, now) {
    let a = s.agents[ev.agentId];
    if (!a) {
      const name = s.pendingSubagents.shift() || ev.agentType || '서브에이전트';
      a = s.agents[ev.agentId] = {
        id: ev.agentId, sessionId: s.id, kind: 'sub', name, type: ev.agentType || '',
        room: 'meeting', activity: 'arrive', icon: ACTIVITY_ICON.arrive, bubble: '출근했습니다',
        tool: null, since: now, arrivedAt: now, leaving: false,
      };
    }
    return a;
  }

  function agentFor(s, ev, now) {
    return ev.agentId ? subAgent(s, ev, now) : mainAgent(s, now);
  }

  function set(a, { room, activity, bubble, tool = null }, now) {
    if (room) a.room = room;
    a.activity = activity;
    a.icon = ACTIVITY_ICON[activity] || '•';
    a.bubble = bubble;
    a.tool = tool;
    a.since = now;
  }

  function pushLog(now, floor, s, a, icon, text) {
    const entry = { t: now, floorId: floor.id, sessionId: s.id, agentId: a ? a.id : 'main', agentName: a ? a.name : 'Claude', icon, text };
    log.push(entry);
    if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
    return entry;
  }

  function publicFloor(f) {
    return { id: f.id, name: f.name, no: f.no, lastActivity: f.lastActivity, sessionIds: [...f.sessions] };
  }

  function emitUpdate(s, floor, entry) {
    emitter.emit('update', { session: s, floor: publicFloor(floor), log: entry || null });
  }

  function schedule(at, fn) { timers.push({ at, fn }); }

  // ---------- 전이 ----------
  function apply(payload, now = Date.now()) {
    if (!payload || typeof payload !== 'object') return;
    const ev = normalize(payload);
    const { session: s, floor } = sessionFor(ev, now);
    let entry = null;

    switch (ev.event) {
      case 'SessionStart': {
        const a = mainAgent(s, now);
        if (ev.source === 'startup' || ev.source === '' ) {
          set(a, { room: 'mydesk', activity: 'wait', bubble: '출근했습니다' }, now);
          s.status = 'idle';
          entry = pushLog(now, floor, s, a, ACTIVITY_ICON.arrive, '출근했습니다');
        } else {
          entry = pushLog(now, floor, s, a, '🔄', `세션 ${ev.source}`);
        }
        break;
      }
      case 'UserPromptSubmit': {
        const a = mainAgent(s, now);
        // 백그라운드 작업 알림 등 시스템이 넣는 메시지는 사용자 요청이 아니다
        const system = /^<[a-z][\w-]*>/i.test(ev.prompt || '');
        if (system) {
          set(a, { activity: 'think', bubble: '알림 확인 중' }, now);
          s.status = 'thinking';
          entry = pushLog(now, floor, s, a, '🔔', `알림 수신 (${(ev.prompt.match(/^<([\w-]+)>/) || [])[1] || 'system'})`);
          break;
        }
        if (!s.title && ev.prompt) s.title = cut(ev.prompt, 40);
        if (!s.firstPrompt && ev.prompt) s.firstPrompt = ev.prompt;
        s.lastPrompt = ev.prompt;
        set(a, { ...THINK }, now);
        s.status = 'thinking';
        entry = pushLog(now, floor, s, a, '💬', ev.prompt ? `"${cut(ev.prompt, 60)}"` : '요청 받음');
        break;
      }
      case 'PreToolUse': {
        const a = agentFor(s, ev, now);
        const d = describeTool(ev.toolName, ev.toolInput, ev.mcpServer);
        set(a, { room: d.room, activity: d.activity, bubble: d.bubble, tool: { name: ev.toolName, useId: ev.toolUseId, target: d.target, detail: d.detail } }, now);
        if (ev.toolName === 'Agent' || ev.toolName === 'Task') s.pendingSubagents.push(d.target);
        s.status = d.activity === 'ask' ? 'waiting' : 'working';
        entry = pushLog(now, floor, s, a, d.icon, d.bubble);
        break;
      }
      case 'PostToolUse': {
        const a = agentFor(s, ev, now);
        if (a.activity !== 'ask') set(a, { ...THINK }, now); else a.tool = null;
        if (s.status === 'working') s.status = 'thinking';
        break; // 로그는 시작(PreToolUse)에만 남긴다
      }
      case 'PostToolUseFailure': {
        const a = agentFor(s, ev, now);
        set(a, { activity: 'think', bubble: '실패했네, 다시 생각 중' }, now);
        a.icon = '❌';
        s.status = 'thinking';
        entry = pushLog(now, floor, s, a, '❌', `${ev.toolName} 실패: ${cut(ev.error, 60) || '알 수 없는 오류'}`);
        break;
      }
      case 'SubagentStart': {
        if (!ev.agentId) break;
        const a = subAgent(s, ev, now);
        set(a, { room: 'meeting', activity: 'arrive', bubble: '출근했습니다' }, now);
        entry = pushLog(now, floor, s, a, ACTIVITY_ICON.arrive, `${a.name} 출근`);
        break;
      }
      case 'SubagentStop': {
        if (!ev.agentId) break;
        const a = subAgent(s, ev, now);
        set(a, { room: 'elevator', activity: 'leave', bubble: '퇴근합니다' }, now);
        a.leaving = true;
        entry = pushLog(now, floor, s, a, ACTIVITY_ICON.leave, `${a.name} 퇴근${ev.lastMessage ? ': ' + cut(ev.lastMessage, 50) : ''}`);
        schedule(now + SUBAGENT_LEAVE_MS, () => {
          if (s.agents[ev.agentId] && s.agents[ev.agentId].leaving) {
            delete s.agents[ev.agentId];
            emitUpdate(s, floor, null);
          }
        });
        break;
      }
      case 'Notification': {
        const a = mainAgent(s, now);
        const t = ev.notificationType;
        if (t === 'permission_prompt') {
          set(a, { room: 'mydesk', activity: 'ask', bubble: '허락이 필요해요' }, now);
          s.status = 'waiting';
          entry = pushLog(now, floor, s, a, ACTIVITY_ICON.ask, `허락 요청: ${cut(ev.message, 60)}`);
        } else if (t === 'idle_prompt') {
          set(a, { room: 'lounge', activity: 'rest', bubble: '할 일 기다리는 중' }, now);
          s.status = 'idle';
        } else if (t === 'agent_needs_input' || t.startsWith('elicitation')) {
          set(a, { room: 'mydesk', activity: 'ask', bubble: cut(ev.message, 40) || '입력이 필요해요' }, now);
          s.status = 'waiting';
          entry = pushLog(now, floor, s, a, ACTIVITY_ICON.ask, cut(ev.message, 60) || '입력 요청');
        } else {
          entry = pushLog(now, floor, s, a, '🔔', cut(ev.message, 60) || t);
        }
        break;
      }
      case 'Stop': {
        const a = mainAgent(s, now);
        set(a, { room: 'lounge', activity: 'rest', bubble: '휴식 중' }, now);
        s.status = 'idle';
        entry = pushLog(now, floor, s, a, '✅', ev.lastMessage ? cut(ev.lastMessage, 60) : '작업 완료');
        break;
      }
      case 'PreCompact': {
        const a = mainAgent(s, now);
        set(a, { activity: 'compact', bubble: '기억 정리 중' }, now);
        entry = pushLog(now, floor, s, a, ACTIVITY_ICON.compact, `기억 정리 (${ev.trigger || 'auto'})`);
        break;
      }
      case 'TaskCompleted': {
        entry = pushLog(now, floor, s, s.agents.main, '✅', `완료: ${ev.taskSubject || '작업'}`);
        break;
      }
      case 'SessionEnd': {
        for (const a of Object.values(s.agents)) {
          set(a, { room: 'elevator', activity: 'leave', bubble: '퇴근합니다' }, now);
          a.leaving = true;
        }
        s.status = 'ended';
        s.ended = true;
        entry = pushLog(now, floor, s, s.agents.main, ACTIVITY_ICON.leave, `세션 종료 (${ev.reason || 'other'})`);
        schedule(now + SESSION_LEAVE_MS, () => { if (s.ended) remove(s.id); });
        break;
      }
      default:
        entry = pushLog(now, floor, s, s.agents.main, '•', ev.event || 'event');
    }
    emitUpdate(s, floor, entry);
  }

  // ---------- 정리 ----------
  function remove(sessionId) {
    const s = sessions.get(sessionId);
    if (!s) return;
    sessions.delete(sessionId);
    const f = floors.get(s.floorId);
    if (f) {
      f.sessions.delete(sessionId);
      if (f.sessions.size === 0) floors.delete(f.id);
    }
    emitter.emit('remove', { sessionId, floorId: s.floorId, floorRemoved: !floors.has(s.floorId) });
    for (const other of renameFloors()) emitter.emit('floor', publicFloor(other));
  }

  /** 훅 없이 끊긴 세션 퇴근 처리 */
  function endSilently(s, now, why) {
    const floor = floors.get(s.floorId);
    for (const a of Object.values(s.agents)) {
      set(a, { room: 'elevator', activity: 'leave', bubble: '퇴근합니다' }, now);
      a.leaving = true;
    }
    s.status = 'ended';
    s.ended = true;
    const entry = pushLog(now, floor, s, s.agents.main, ACTIVITY_ICON.leave, `세션 종료 (${why})`);
    emitUpdate(s, floor, entry);
    schedule(now + SESSION_LEAVE_MS, () => { if (s.ended) remove(s.id); });
  }

  /** 예약된 작업 실행 + 조용한 세션 정리(자리 비움 / 퇴근). 서버가 주기적으로 호출한다. */
  function sweep(now = Date.now()) {
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= now) { const { fn } = timers.splice(i, 1)[0]; fn(); }
    }
    for (const s of [...sessions.values()]) {
      if (s.ended) continue;
      const idle = now - s.lastActivity;
      if (idle >= SESSION_TTL_MS) { endSilently(s, now, '2시간 무활동'); continue; }
      // transcript 가 더 이상 갱신되지 않으면 터미널이 닫힌 것으로 본다
      if (idle >= GONE_CHECK_MS && s.transcriptPath && now - s.lastStatAt >= STAT_INTERVAL_MS) {
        s.lastStatAt = now;
        const st = statFile(s.transcriptPath);
        if (!st) { endSilently(s, now, 'transcript 없음'); continue; }
        if (st.mtimeMs <= s.lastActivity && idle >= GONE_MS) { endSilently(s, now, '터미널 종료 추정'); continue; }
      }
      if (idle >= AWAY_MS && s.status !== 'away') {
        s.status = 'away';
        const a = mainAgent(s, now);
        set(a, { room: 'lounge', activity: 'rest', bubble: '자리 비움' }, now);
        const floor = floors.get(s.floorId);
        emitUpdate(s, floor, pushLog(now, floor, s, a, '💤', '자리 비움 (30분 무활동)'));
      }
    }
  }

  function snapshot() {
    return {
      me,
      floors: [...floors.values()].map(publicFloor),
      sessions: [...sessions.values()],
      log: log.slice(-200),
    };
  }

  return { apply, remove, sweep, snapshot, on: emitter.on.bind(emitter), get: (id) => sessions.get(id) };
}

module.exports = { createState, LOG_LIMIT, SESSION_TTL_MS, SUBAGENT_LEAVE_MS, SESSION_LEAVE_MS, AWAY_MS, GONE_CHECK_MS, GONE_MS, STAT_INTERVAL_MS };
