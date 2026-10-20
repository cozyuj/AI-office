'use strict';
// 사무실 상태 저장소. BE-1 단계: 층(프로젝트)/세션 등록과 원시 이벤트 로그만 담당한다.
// 이벤트 → 방/활동/말풍선 해석(상태 머신)은 BE-2 에서 이 파일에 추가한다.

const path = require('path');
const EventEmitter = require('events');

const LOG_LIMIT = 500;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2시간 무활동이면 퇴근 처리

function createState({ me = 'me' } = {}) {
  const emitter = new EventEmitter();
  const floors = new Map();   // cwd → Floor
  const sessions = new Map(); // session_id → Session
  const log = [];
  let floorSeq = 0;

  function floorFor(cwd, now) {
    const id = cwd || '(unknown)';
    let f = floors.get(id);
    if (!f) {
      f = { id, name: path.basename(id) || id, no: ++floorSeq, sessions: new Set(), lastActivity: now };
      floors.set(id, f);
    }
    f.lastActivity = now;
    return f;
  }

  function sessionFor(payload, now) {
    const id = payload.session_id || 'unknown';
    const floor = floorFor(payload.cwd, now);
    let s = sessions.get(id);
    if (!s) {
      s = {
        id, floorId: floor.id, title: payload.session_title || '', status: 'idle',
        startedAt: now, lastActivity: now, agents: {}, pendingSubagents: [],
      };
      sessions.set(id, s);
      floor.sessions.add(id);
    }
    if (payload.session_title && !s.title) s.title = payload.session_title;
    s.lastActivity = now;
    return { session: s, floor };
  }

  function pushLog(entry) {
    log.push(entry);
    if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
    return entry;
  }

  function publicFloor(f) {
    return { id: f.id, name: f.name, no: f.no, lastActivity: f.lastActivity, sessionIds: [...f.sessions] };
  }

  function apply(payload, now = Date.now()) {
    if (!payload || typeof payload !== 'object') return;
    const { session, floor } = sessionFor(payload, now);
    const entry = pushLog({
      t: now, floorId: floor.id, sessionId: session.id, agentId: payload.agent_id || 'main',
      agentName: payload.agent_type || 'Claude',
      icon: '•', text: [payload.hook_event_name, payload.tool_name].filter(Boolean).join(' '),
      raw: { event: payload.hook_event_name, tool: payload.tool_name },
    });
    emitter.emit('update', { session, floor: publicFloor(floor), log: entry });
  }

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
  }

  function sweep(now = Date.now()) {
    for (const s of sessions.values()) {
      if (now - s.lastActivity > SESSION_TTL_MS) remove(s.id);
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

  return { apply, remove, sweep, snapshot, on: emitter.on.bind(emitter), _floors: floors, _sessions: sessions };
}

module.exports = { createState, LOG_LIMIT, SESSION_TTL_MS };
