'use strict';
// 사무실 상태 머신. 훅 payload → 층(프로젝트)/세션/캐릭터(Agent) 의 방·활동·말풍선.
// 전이 규칙: docs/ARCHITECTURE.md 3절. 도구→방 매핑: lib/normalize.js describeTool.

const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');
const { normalize, describeTool, ACTIVITY_ICON, ROOMS: ROOM_LABEL, cut } = require('./normalize');
const FS = require('./floorStyle');
const { resolveProject } = require('./project');

const LOG_LIMIT = 500;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2시간 무활동이면 퇴근 처리
const SUBAGENT_LEAVE_MS = 4000;             // 서브에이전트가 엘리베이터까지 걸어가는 시간
const SESSION_LEAVE_MS = 10000;             // SessionEnd 후 세션 제거까지
const AWAY_MS = 30 * 60 * 1000;             // 30분 무활동 → 자리 비움
const GONE_CHECK_MS = 10 * 60 * 1000;       // 10분 무활동부터 transcript 확인 시작
const GONE_MS = 60 * 60 * 1000;             // transcript 갱신 없이 60분 → 퇴근 처리
const STAT_INTERVAL_MS = 60 * 1000;         // 세션당 stat 호출 간격

const THINK = { activity: 'think', bubble: '고민 중…' };

// 휴식 장소: 세션 id 해시로 하나를 고른다 → 모든 클라이언트가 같은 방을 보고, 같은 세션은 늘 같은 방.
const REST_ROOMS = ['lounge', 'cafe', 'terrace'];
const REST_BUBBLE = { lounge: '휴식 중', cafe: '커피 마시는 중', terrace: '바람 쐬는 중' };
const REST_ICON = { lounge: '🛋️', cafe: '☕', terrace: '🌤️' };
function restRoomFor(sessionId) {
  let h = 0;
  for (const c of String(sessionId || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return REST_ROOMS[h % REST_ROOMS.length];
}
/** 휴식 전이: 방·말풍선·아이콘을 세션의 휴식 장소 + 층의 편의시설(프리셋)에 맞춘다 (FE-36) */
function rest(bubble, sessionId, floor) {
  const room = restRoomFor(sessionId);
  const info = FS.restInfo(FS.baseOf(floor), room);
  return { room, activity: 'rest', bubble: bubble || info.bubble, icon: info.icon };
}

// 작업 위치로 층 옮기기 (BE-22): 도구가 다루는 경로 → { p, edit }. 경로가 없는 도구는 null
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
function workPath(ev) {
  const ti = ev.toolInput || {};
  const fp = ti.file_path || ti.notebook_path;
  if (fp) return { p: path.dirname(fp), edit: EDIT_TOOLS.has(ev.toolName) };
  if (ti.path && (ev.toolName === 'Grep' || ev.toolName === 'Glob' || ev.toolName === 'LS')) return { p: ti.path, edit: false };
  if (ev.toolName === 'Bash' && ti.command) {
    const m = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/.exec(ti.command);
    if (m) return { p: m[1] || m[2] || m[3], edit: false };
  }
  return null;
}

function defaultStat(file) {
  try { return { mtimeMs: fs.statSync(file).mtimeMs }; } catch { return null; }
}

const FIRST_PROMPT_HEAD_BYTES = 1024 * 1024;
/** transcript 앞부분에서 첫 사용자 메시지(실제 요청)를 읽는다. 이미지가 붙은 첫 줄은 수백 KB 라 잘려도 텍스트만 뽑는다. 없으면 null */
function defaultFirstPrompt(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(FIRST_PROMPT_HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    for (const line of buf.subarray(0, n).toString('utf8').split('\n')) {
      if (!line.includes('"type":"user"') || line.includes('"isMeta":true')) continue;
      let text = null;
      try {
        const c = JSON.parse(line).message?.content;
        text = typeof c === 'string' ? c : Array.isArray(c) ? (c.find((x) => x && x.type === 'text') || {}).text : null;
      } catch { // 잘린 줄: 첫 "text" 값만 꺼낸다
        const m = /"content":"((?:[^"\\]|\\.)*)"|"type":"text","text":"((?:[^"\\]|\\.)*)"/.exec(line);
        if (m) try { text = JSON.parse(`"${m[1] ?? m[2]}"`); } catch {}
      }
      if (text && text.trim() && !/^\s*</.test(text)) return text.trim();
    }
    return null;
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

const TITLE_TAIL_BYTES = 64 * 1024;
/** transcript 끝부분에서 마지막 세션 제목(custom-title 기록)을 읽는다. 없거나 못 읽으면 null */
function defaultTitle(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, TITLE_TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"custom-title"')) continue;
      try { const j = JSON.parse(lines[i]); if (j.type === 'custom-title' && typeof j.customTitle === 'string' && j.customTitle.trim()) return j.customTitle.trim(); } catch {}
    }
    return null;
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

function createState({ me = 'me', statFile = defaultStat, titleOf = defaultTitle, firstPromptOf = defaultFirstPrompt, styleFile = null } = {}) {
  const emitter = new EventEmitter();
  const floors = new Map();   // cwd → Floor
  const sessions = new Map(); // session_id → Session
  const log = [];
  const timers = [];          // { at, fn }  sweep(now) 가 실행
  let floorSeq = 0;
  // git 저장소가 아닌 폴더(여러 저장소를 담은 묶음 폴더)에서 연 세션만 (BE-22): sessionId → Map(저장소 root → { edits, reads, branch, worktree })
  const roaming = new Map();

  // ---------- 층 인테리어 프리셋 (FE-36): 직접 선택(styleFile 에 저장) > 층 id 해시 자동 배정 ----------
  const styleOverrides = new Map(); // floorId → presetId
  if (styleFile) {
    try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(styleFile, 'utf8')))) if (FS.isChoice(v)) styleOverrides.set(k, v); } catch {}
  }
  function saveStyles() {
    if (!styleFile) return;
    try { fs.mkdirSync(path.dirname(styleFile), { recursive: true }); fs.writeFileSync(styleFile, JSON.stringify(Object.fromEntries(styleOverrides), null, 2) + '\n'); } catch {}
  }
  /** 모든 층의 style/styleAuto/styleOverride 를 다시 계산한다 (이웃 층 규칙 때문에 층이 생기거나 사라지면 바뀔 수 있다). 바뀐 층 목록 반환 */
  function refreshStyles() {
    const auto = FS.assignPresets([...floors.values()]);
    const changed = [];
    for (const f of floors.values()) {
      const a = auto.get(f.id), o = styleOverrides.get(f.id) || null, s = o || a;
      if (f.style !== s || f.styleAuto !== a || f.styleOverride !== o) { f.style = s; f.styleAuto = a; f.styleOverride = o; changed.push(f); }
    }
    return changed;
  }
  /** 층 프리셋 직접 선택 (null 이면 자동으로). 저장하고 바뀐 층을 'floor' 로 알린다 */
  function setFloorStyle(id, preset) {
    const p = FS.isChoice(preset) ? preset : null;
    if (p) styleOverrides.set(id, p); else styleOverrides.delete(id);
    saveStyles();
    for (const f of refreshStyles()) emitter.emit('floor', publicFloor(f));
    const f = floors.get(id);
    return f ? publicFloor(f) : { id, style: p, styleAuto: null, styleOverride: p };
  }

  // ---------- 조회/생성 ----------
  /** 같은 basename 끼리는 상위 폴더를 붙여 구분되도록 모든 층 이름을 다시 계산한다. 바뀐 층 목록 반환 */
  function renameFloors() {
    const segs = (id) => id.split(/[\\/]+/).filter(Boolean);
    const nameOf = (id, depth) => { const p = segs(id); return (p.slice(Math.max(0, p.length - depth)).join('/') || id) + (id.startsWith('/demo/') ? ' (데모)' : ''); };
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
    const proj = cwd && !cwd.startsWith('/demo/') ? resolveProject(cwd) : null;
    const id = (proj && proj.root) || cwd || '(unknown)';
    let f = floors.get(id);
    if (!f) {
      f = { id, name: path.basename(id) || id, no: ++floorSeq, sessions: new Set(), lastActivity: now };
      floors.set(id, f);
      for (const other of new Set([...renameFloors(), ...refreshStyles()])) if (other !== f) emitter.emit('floor', publicFloor(other));
    }
    f.lastActivity = now;
    return f;
  }

  function sessionFor(ev, now) {
    let s = sessions.get(ev.sessionId);
    // 기존 세션은 처음 정해진 층을 유지한다 (cwd 가 하위 폴더로 바뀌어도 새 층을 만들지 않는다)
    const floor = s ? floors.get(s.floorId) || floorFor(ev.cwd, now) : floorFor(ev.cwd, now);
    if (!s) {
      const proj = ev.cwd && !ev.cwd.startsWith('/demo/') ? resolveProject(ev.cwd) : null;
      s = {
        id: ev.sessionId, floorId: floor.id, title: ev.sessionTitle, status: 'idle',
        startedAt: now, lastActivity: now, agents: {}, pendingSubagents: [], ended: false, firstPrompt: '', lastPrompt: '',
        transcriptPath: ev.transcriptPath, lastStatAt: 0, titleMtime: 0, firstPromptChecked: false, hookTitle: '', fileTitle: '',
        cwd: ev.cwd || '', branch: proj ? proj.branch : '', worktree: proj && proj.worktree ? path.basename(proj.worktreeDir) : '',
      };
      sessions.set(s.id, s);
      floor.sessions.add(s.id);
      if (!proj && ev.cwd && !ev.cwd.startsWith('/demo/')) roaming.set(s.id, new Map());
    }
    // 제목: 훅의 session_title 이 바뀔 때마다 따른다 (분리된 세션은 부모 제목으로 시작했다가 이름이 바뀐다)
    if (ev.sessionTitle && ev.sessionTitle !== s.hookTitle) { s.hookTitle = ev.sessionTitle; retitle(s, floor, ev.sessionTitle, now); }
    if (ev.transcriptPath) s.transcriptPath = ev.transcriptPath;
    s.lastActivity = now;
    floor.lastActivity = now;
    return { session: s, floor };
  }

  /**
   * 묶음 폴더에서 연 세션을 실제로 작업하는 저장소 층으로 옮긴다 (BE-22).
   * 층 = 고친 파일이 가장 많은 저장소, 아직 고친 게 없으면 가장 많이 본 저장소. 지금 층보다 많아질 때만 옮긴다(동점은 그대로).
   * 저장소 세션은 옮기지 않는다. s.cwd(이어가기 위치)는 그대로. 옮긴 뒤의 층을 반환한다
   */
  function follow(s, floor, ev, now) {
    const counts = roaming.get(s.id);
    const w = counts && workPath(ev);
    if (!w) return floor;
    let p = w.p.replace(/^~(?=$|[\\/])/, os.homedir());
    if (!path.isAbsolute(p)) { if (!s.cwd) return floor; p = path.resolve(s.cwd, p); }
    const proj = resolveProject(p);
    if (!proj) return floor;
    const c = counts.get(proj.root) || { edits: 0, reads: 0 };
    if (w.edit) c.edits++; else c.reads++;
    c.branch = proj.branch; c.worktree = proj.worktree ? path.basename(proj.worktreeDir) : '';
    counts.set(proj.root, c);
    if (proj.root === s.floorId) return floor;
    const cur = counts.get(s.floorId);
    // 한 번에 한 저장소만 늘어나므로 지금 층(최다)과 그 저장소만 비교하면 된다
    if (cur && (c.edits < cur.edits || (c.edits === cur.edits && c.reads <= cur.reads))) return floor;
    const to = floorFor(proj.root, now);
    floor.sessions.delete(s.id);
    to.sessions.add(s.id);
    s.floorId = to.id; s.branch = c.branch; s.worktree = c.worktree;
    // 새 층 update 를 먼저 보낸다 → 화면이 선택을 새 층으로 옮긴 뒤 빈 층이 사라진다
    emitUpdate(s, to, pushLog(now, to, s, s.agents.main || null, '🛗', `${to.name} 층으로 이동`));
    if (floor.sessions.size === 0) {
      floors.delete(floor.id);
      emitter.emit('remove', { sessionId: null, floorId: floor.id, floorRemoved: true });
    }
    for (const f of new Set([...renameFloors(), ...refreshStyles(), ...(floors.has(floor.id) ? [floor] : [])])) if (f !== to) emitter.emit('floor', publicFloor(f));
    return to;
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

  function set(a, { room, activity, bubble, icon = null, tool = null }, now) {
    if (room) a.room = room;
    a.activity = activity;
    a.icon = icon || ACTIVITY_ICON[activity] || '•';
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
    return { id: f.id, name: f.name, no: f.no, lastActivity: f.lastActivity, sessionIds: [...f.sessions], style: f.style, styleAuto: f.styleAuto, styleOverride: f.styleOverride || null };
  }

  function emitUpdate(s, floor, entry) {
    emitter.emit('update', { session: s, floor: publicFloor(floor), log: entry || null });
  }

  function schedule(at, fn) { timers.push({ at, fn }); }

  /** 세션 제목 변경. 이전 제목이 있었으면 로그 한 줄 + update 를 보낸다. 바뀌었으면 true */
  function retitle(s, floor, title, now) {
    if (!title || title === s.title) return false;
    const had = !!s.title;
    s.title = title;
    if (had && floor) emitUpdate(s, floor, pushLog(now, floor, s, s.agents.main || null, '🏷️', `제목: ${cut(title, 60)}`));
    return true;
  }

  // ---------- 전이 ----------
  function apply(payload, now = Date.now()) {
    if (!payload || typeof payload !== 'object') return;
    const ev = normalize(payload);
    if (ev.event === 'SessionEnd' && !sessions.has(ev.sessionId)) return; // 모르는 세션의 종료(치운 세션 재생 등)로 빈 층을 만들지 않는다
    const { session: s, floor: home } = sessionFor(ev, now);
    const floor = ev.event === 'PreToolUse' ? follow(s, home, ev, now) : home;
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
        // 도구가 끝났다 = 허락·질문에 답을 받았다. waiting 으로 남겨 두면 빨간 점이 다음 이벤트까지 켜져 있다 (FE-64)
        set(a, { ...THINK }, now);
        if (s.status === 'working' || s.status === 'waiting') s.status = 'thinking';
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
            emitUpdate(s, floors.get(s.floorId) || floor, null);
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
          set(a, rest('할 일 기다리는 중', s.id, floor), now);
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
        set(a, rest(null, s.id, floor), now);
        s.status = 'idle';
        entry = pushLog(now, floor, s, a, '✅', `${ev.lastMessage ? cut(ev.lastMessage, 60) : '작업 완료'} → ${a.icon} ${FS.restInfo(FS.baseOf(floor), a.room).label}`);
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
    roaming.delete(sessionId);
    const f = floors.get(s.floorId);
    if (f) {
      f.sessions.delete(sessionId);
      if (f.sessions.size === 0) floors.delete(f.id);
    }
    emitter.emit('remove', { sessionId, floorId: s.floorId, floorRemoved: !floors.has(s.floorId) });
    for (const other of new Set([...renameFloors(), ...refreshStyles()])) emitter.emit('floor', publicFloor(other));
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
      // transcript 확인은 세션당 1분에 한 번 (stat 한 번을 제목 · 퇴근 감지가 같이 쓴다)
      if (s.transcriptPath && (!s.lastStatAt || now - s.lastStatAt >= STAT_INTERVAL_MS)) {
        s.lastStatAt = now;
        const st = statFile(s.transcriptPath);
        // 첫 요청: 저널은 최근 2시간만 재생하므로 오래된 세션은 첫 요청 자리에 최근 프롬프트가 들어간다 → transcript 에서 한 번 복원
        if (st && !s.firstPromptChecked) {
          s.firstPromptChecked = true;
          const fp = firstPromptOf(s.transcriptPath);
          if (fp) s.firstPrompt = cut(fp, 120);
        }
        // 제목: 훅 없이 이름만 바뀐 경우 transcript 의 마지막 custom-title 로 따라간다 (파일이 바뀌었을 때만 읽음)
        if (st && st.mtimeMs !== s.titleMtime) {
          s.titleMtime = st.mtimeMs;
          const t = titleOf(s.transcriptPath);
          if (t && t !== s.fileTitle) { s.fileTitle = t; retitle(s, floors.get(s.floorId), t, now); }
        }
        // transcript 가 더 이상 갱신되지 않으면 터미널이 닫힌 것으로 본다
        if (idle >= GONE_CHECK_MS) {
          if (!st) { endSilently(s, now, 'transcript 없음'); continue; }
          if (st.mtimeMs <= s.lastActivity && idle >= GONE_MS) { endSilently(s, now, '터미널 종료 추정'); continue; }
        }
      }
      if (idle >= AWAY_MS && s.status !== 'away') {
        s.status = 'away';
        const a = mainAgent(s, now);
        set(a, rest('자리 비움', s.id), now);
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

  /** 데모 세션 전부 제거 */
  function removeDemo() {
    let n = 0;
    for (const s of [...sessions.values()]) if (s.floorId.startsWith('/demo/')) { remove(s.id); n++; }
    return n;
  }

  return { apply, remove, removeDemo, sweep, snapshot, setFloorStyle, on: emitter.on.bind(emitter), get: (id) => sessions.get(id) };
}

module.exports = { defaultTitle, defaultFirstPrompt, createState, restRoomFor, REST_ROOMS, REST_BUBBLE, REST_ICON, LOG_LIMIT, SESSION_TTL_MS, SUBAGENT_LEAVE_MS, SESSION_LEAVE_MS, AWAY_MS, GONE_CHECK_MS, GONE_MS, STAT_INTERVAL_MS };
