// 서버 상태 미러 + 선택 상태 + 구독. 서버가 단일 진실이고, 여기선 보기 좋게 정리만 한다.

export const ROOM_LABEL = {
  library: '자료실', dev: '개발실', research: '정보검색실', server: '서버실',
  meeting: '회의실', lounge: '휴게실', mydesk: '내 자리', lobby: '로비', elevator: '엘리베이터',
};

export const LEGEND = [
  ['📖 자료실', '파일 읽기 · 검색'], ['✏️ 개발실', '코드 작성 · 수정'], ['🖥️ 서버실', '명령 실행 · git'],
  ['🌐 정보검색실', '웹 · 외부 도구'], ['🤝 회의실', '계획 · 일 나누기'], ['☕ 휴게실', '휴식 · 대기'],
  ['🙋 내 자리', '질문 · 허락 요청'], ['🛗 엘리베이터', '서브에이전트 출퇴근'],
];

const PALETTE = ['#e8683a', '#3b6fd6', '#2fa36b', '#9b59b6', '#e0a526', '#1fa2b5', '#d9507a', '#6b7fd6'];

function hashColor(key) {
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

class Store {
  constructor() {
    this.me = 'me';
    this.floors = new Map();   // id → { id, name, no, lastActivity, sessionIds }
    this.sessions = new Map(); // id → Session (서버 형태 그대로)
    this.log = [];
    this.selectedFloorId = null;
    this.selectedSessionId = null;
    this.autoFollow = true;
    this.followCamera = false;   // 선택 세션 캐릭터를 카메라가 따라감
    this.bubbleMode = 'all';     // 'all' | 'selected'
    this.connected = false;
    this.listeners = new Set();
    this.colorCache = new Map();
    this.prevWaiting = new Set(); // 대기 전이 감지용
    this.orderCache = new Map();  // floorId → { t, ids }  목록 순서를 5초마다만 바꾼다
    this.logFilter = { q: '', mine: false };
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind, detail) { for (const fn of this.listeners) fn(kind, detail); }

  // ---------- 서버 이벤트 ----------
  applySnapshot(snap) {
    this.me = snap.me || this.me;
    this.floors = new Map(snap.floors.map((f) => [f.id, f]));
    this.sessions = new Map(snap.sessions.map((s) => [s.id, s]));
    this.log = snap.log || [];
    this.reconcileSelection();
    this.prevWaiting = new Set(this.waitingSessions().map((s) => s.id)); // 첫 로드는 알리지 않는다
    this.emit('snapshot');
  }

  applyUpdate({ session, floor, log }) {
    this.floors.set(floor.id, floor);
    this.sessions.set(session.id, session);
    if (log) { this.log.push(log); if (this.log.length > 500) this.log.splice(0, this.log.length - 500); }
    if (this.autoFollow && log) {
      this.selectedFloorId = floor.id;
      this.selectedSessionId = session.id;
    }
    this.reconcileSelection();
    this.emit('update', { session, floor, log });
    this.detectWaiting();
  }

  applyRemove({ sessionId, floorId, floorRemoved }) {
    this.sessions.delete(sessionId);
    if (floorRemoved) this.floors.delete(floorId);
    else {
      const f = this.floors.get(floorId);
      if (f) f.sessionIds = f.sessionIds.filter((id) => id !== sessionId);
    }
    this.reconcileSelection();
    this.emit('remove', { sessionId, floorId });
    this.detectWaiting();
  }

  setFollowCamera(v) { this.followCamera = v; this.emit('option'); }
  setBubbleMode(v) { this.bubbleMode = v; this.emit('option'); }

  setConnected(v) { if (this.connected !== v) { this.connected = v; this.emit('conn'); } }

  // ---------- 선택 ----------
  reconcileSelection() {
    if (this.selectedFloorId && !this.floors.has(this.selectedFloorId)) this.selectedFloorId = null;
    if (this.selectedSessionId && !this.sessions.has(this.selectedSessionId)) this.selectedSessionId = null;
    if (!this.selectedFloorId) {
      const latest = this.floorsSorted()[0];
      this.selectedFloorId = latest ? latest.id : null;
    }
    const sel = this.sessions.get(this.selectedSessionId);
    if (!sel || sel.floorId !== this.selectedFloorId) {
      const s = this.sessionsOfFloor(this.selectedFloorId)[0];
      this.selectedSessionId = s ? s.id : null;
    }
  }

  selectFloor(id) {
    this.autoFollow = false;
    this.selectedFloorId = id;
    this.selectedSessionId = null;
    this.reconcileSelection();
    this.emit('select');
  }

  selectSession(id) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.autoFollow = false;
    this.selectedFloorId = s.floorId;
    this.selectedSessionId = id;
    this.emit('select');
  }

  setAutoFollow(v) {
    this.autoFollow = v;
    if (v) {
      const latest = this.sessionsSorted()[0];
      if (latest) { this.selectedFloorId = latest.floorId; this.selectedSessionId = latest.id; }
    }
    this.emit('select');
  }

  /** 비대기 → 대기 로 바뀐 세션을 'waiting' 이벤트로 알린다 */
  detectWaiting() {
    const now = new Set();
    for (const s of this.waitingSessions()) {
      now.add(s.id);
      if (!this.prevWaiting.has(s.id)) this.emit('waiting', { session: s, floor: this.floors.get(s.floorId) });
    }
    if (now.size !== this.prevWaiting.size) this.emit('waiting-count', now.size);
    this.prevWaiting = now;
  }

  // ---------- 파생 ----------
  waitingSessions() { return this.sessionsSorted().filter((s) => s.status === 'waiting'); }
  waitingOfFloor(floorId) { return this.waitingSessions().filter((s) => s.floorId === floorId); }
  floorsSorted() { return [...this.floors.values()].sort((a, b) => b.lastActivity - a.lastActivity); }
  floorsByNo() { return [...this.floors.values()].sort((a, b) => b.no - a.no); }
  sessionsSorted() { return [...this.sessions.values()].sort((a, b) => b.lastActivity - a.lastActivity); }
  sessionsOfFloor(floorId) { return this.sessionsSorted().filter((s) => s.floorId === floorId); }
  /** 목록 표시용: 순서는 5초에 한 번만 갱신 (클릭 중에 행이 튀지 않게). 새 세션은 바로 위에 추가, 사라진 세션은 바로 제거 */
  sessionsOfFloorStable(floorId, now = Date.now()) {
    const live = this.sessionsOfFloor(floorId);
    const c = this.orderCache.get(floorId);
    if (!c || now - c.t > 5000) { this.orderCache.set(floorId, { t: now, ids: live.map((s) => s.id) }); return live; }
    const byId = new Map(live.map((s) => [s.id, s]));
    const kept = c.ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
    const fresh = live.filter((s) => !c.ids.includes(s.id));
    if (fresh.length) c.ids = [...fresh.map((s) => s.id), ...c.ids];
    return [...fresh, ...kept];
  }
  selectedFloor() { return this.floors.get(this.selectedFloorId) || null; }
  selectedSession() { return this.sessions.get(this.selectedSessionId) || null; }

  /** 현재 층의 캐릭터 목록 (세션 최신순, 세션 안에서는 main 먼저) */
  agentsOfFloor(floorId) {
    const out = [];
    for (const s of this.sessionsOfFloor(floorId)) {
      const agents = Object.values(s.agents || {}).sort((a, b) => (a.kind === 'main' ? -1 : 1) - (b.kind === 'main' ? -1 : 1));
      for (const a of agents) out.push({ agent: a, session: s });
    }
    return out;
  }

  logOfFloor(floorId, limit = 80, filter = this.logFilter) {
    const q = (filter?.q || '').trim().toLowerCase();
    const mine = !!filter?.mine;
    const out = [];
    let total = 0;
    for (let i = this.log.length - 1; i >= 0; i--) {
      const e = this.log[i];
      if (e.floorId !== floorId) continue;
      total++;
      if (mine && e.sessionId !== this.selectedSessionId) continue;
      if (q && !(`${e.text} ${e.agentName}`.toLowerCase().includes(q))) continue;
      if (out.length < limit) out.push(e);
    }
    out.total = total;
    return out;
  }
  setLogFilter(patch) { this.logFilter = { ...this.logFilter, ...patch }; this.emit('option'); }

  floorStatus(floorId) {
    const sessions = this.sessionsOfFloor(floorId);
    if (sessions.some((s) => s.status === 'waiting')) return 'waiting';
    if (sessions.some((s) => s.status === 'working')) return 'working';
    if (sessions.some((s) => s.status === 'thinking')) return 'thinking';
    return 'idle';
  }

  colorOf(session, agent) {
    const key = agent && agent.kind === 'sub' ? `${session.id}:${agent.id}` : session.id;
    if (!this.colorCache.has(key)) this.colorCache.set(key, agent && agent.kind === 'sub' ? '#3b6fd6' : hashColor(key));
    return this.colorCache.get(key);
  }
}

export const store = new Store();

export function timeAgo(t, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return '방금';
  if (s < 60) return `${s}초 전`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

export function elapsed(t, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${s % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

export function clock(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function shortPath(p) {
  const home = /^\/Users\/[^/]+|^\/home\/[^/]+/.exec(p || '');
  return home ? '~' + p.slice(home[0].length) : p || '';
}
