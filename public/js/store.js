// 서버 상태 미러 + 선택 상태 + 구독. 서버가 단일 진실이고, 여기선 보기 좋게 정리만 한다.
import { createNameBook } from './names.js';

export const ROOM_LABEL = {
  library: '자료실', dev: '개발실', research: '정보검색실', server: '서버실',
  meeting: '회의실', lounge: '휴게실', mydesk: '내 자리', lobby: '로비', elevator: '엘리베이터', cafe: '카페', terrace: '테라스',
  gym: '헬스장', garden: '옥상정원', canteen: '구내식당', nap: '수면실', game: '게임룸', booklounge: '북 라운지', studio: '스튜디오', seminar: '세미나실',
};

export const LEGEND = [
  ['📖 자료실', '파일 읽기 · 검색'], ['✏️ 개발실', '코드 작성 · 수정'], ['🖥️ 서버실', '명령 실행 · git'],
  ['🌐 정보검색실', '웹 · 외부 도구'], ['🤝 회의실', '계획 · 일 나누기'], ['☕ 휴게실', '휴식 · 대기'],
  ['🙋 내 자리', '질문 · 허락 요청'], ['🛗 엘리베이터', '서브에이전트 출퇴근'],
];

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};
const isDemoFloor = (floorId) => typeof floorId === 'string' && floorId.startsWith('/demo/');

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
    this.autoFollow = ls.get('aiOffice.autoFollow') !== 'off'; // 직접 층/세션을 고르면 꺼지고, 그 상태도 기억한다
    this.booted = false;           // 첫 스냅샷에서만 마지막 선택을 복원
    this.followCamera = false;   // 선택 세션 캐릭터를 카메라가 따라감
    this.bubbleMode = 'all';     // 'all' | 'selected'
    this.floorFold = (() => { const v = ls.get('aiOffice.floorFold'); return v === 'all' || v === 'none' ? v : 'auto'; })(); // 층별 안내: auto(선택한 층만) · all · none
    this.sound = (() => { try { return localStorage.getItem('aiOffice.sound') === 'on'; } catch { return false; } })(); // 대기 알림 소리
    this.soundScope = ls.get('aiOffice.soundScope') === 'all' ? 'all' : 'waiting'; // 'waiting' 답 기다림만 | 'all' 실패·종료도
    this.ambient = (() => { try { return localStorage.getItem('aiOffice.ambient') !== 'off'; } catch { return true; } })(); // 쉬는 캐릭터 자율 행동
    this.connected = false;
    this.listeners = new Set();
    this.colorCache = new Map();
    this.prevWaiting = new Set(); // 대기 전이 감지용
    this.orderCache = new Map();  // floorId → { t, ids }  목록 순서를 5초마다만 바꾼다
    this.logFilter = { q: '', mine: false };
    this.names = createNameBook(); // 세션별 캐릭터 이름 (브라우저 저장)
    this.daylight = (() => { try { return localStorage.getItem('aiOffice.daylight') || 'auto'; } catch { return 'auto'; } })(); // 시간대 조명: auto|off|morning|day|evening|night
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  /** 방 라벨. 층의 레이아웃(FE-35)에 따라 휴식 방 cafe/terrace 가 다른 편의시설일 수 있어 main.js 가 resolver 를 끼운다 */
  roomLabel(room, floorId) {
    const v = this.roomLabelResolver ? this.roomLabelResolver(room, floorId) : null;
    return v || ROOM_LABEL[room] || room;
  }
  emit(kind, detail) { for (const fn of this.listeners) fn(kind, detail); }

  // ---------- 서버 이벤트 ----------
  applySnapshot(snap) {
    this.me = snap.me || this.me;
    this.serverPort = snap.serverPort || null;
    this.version = snap.version || '';
    this.demo = !!snap.demo;
    this.hookPort = snap.hookPort === undefined ? null : snap.hookPort;
    this.floors = new Map(snap.floors.map((f) => [f.id, f]));
    this.sessions = new Map(snap.sessions.map((s) => [s.id, s]));
    this.log = snap.log || [];
    if (!this.booted) { this.booted = true; this.restoreSelection(); }
    this.reconcileSelection();
    this.prevWaiting = new Set(this.waitingSessions().map((s) => s.id)); // 첫 로드는 알리지 않는다
    this.emit('snapshot');
  }

  applyUpdate({ session, floor, log }) {
    const prev = this.sessions.get(session.id);
    this.floors.set(floor.id, floor);
    this.sessions.set(session.id, session);
    if (log) { this.log.push(log); if (this.log.length > 500) this.log.splice(0, this.log.length - 500); }
    if (this.autoFollow && log) {
      this.selectedFloorId = floor.id;
      this.selectedSessionId = session.id;
    }
    // 선택한 세션이 작업 저장소 층으로 옮겨 가면 선택도 따라간다 (BE-22)
    if (prev && prev.floorId !== session.floorId && this.selectedSessionId === session.id) this.selectedFloorId = session.floorId;
    this.reconcileSelection();
    this.emit('update', { session, floor, log });
    // 도구 실패 / 세션 종료 전이 — 알림 소리 범위 'all' 에서 쓴다 (첫 등장부터 ended 인 세션은 전이가 아니므로 제외)
    if (log && log.icon === '❌') this.emit('failure', { session, floor, log });
    if (prev && prev.status !== 'ended' && session.status === 'ended') this.emit('ended', { session, floor, log });
    this.detectWaiting();
  }

  applyFloor(floor) { if (this.floors.has(floor.id)) { this.floors.set(floor.id, floor); this.emit('update', { floor }); } }

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
  setDemo(v) {
    this.demo = !!v;
    if (!this.demo) { // 데모 꺼짐: 늦게 도착한 이벤트로 남은 데모 층·세션·로그를 정리한다
      for (const [id, f] of this.floors) if (id.startsWith('/demo/')) this.floors.delete(id);
      for (const [id, s] of this.sessions) if (String(s.floorId || '').startsWith('/demo/')) this.sessions.delete(id);
      this.log = this.log.filter((e) => !String(e.floorId || '').startsWith('/demo/'));
      this.reconcileSelection();
      this.emit('remove', { sessionId: null, floorId: null });
    }
    this.emit('option');
  }
  setSound(v) { this.sound = !!v; try { localStorage.setItem('aiOffice.sound', v ? 'on' : 'off'); } catch {} this.emit('option'); }
  setSoundScope(v) { this.soundScope = v === 'all' ? 'all' : 'waiting'; ls.set('aiOffice.soundScope', this.soundScope); this.emit('option'); }
  setAmbient(v) { this.ambient = !!v; try { localStorage.setItem('aiOffice.ambient', v ? 'on' : 'off'); } catch {} this.emit('option'); }
  setDaylight(v) { this.daylight = String(v || 'auto'); try { localStorage.setItem('aiOffice.daylight', this.daylight); } catch {} this.emit('option'); }

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

  /** 층 목록에서 이 층의 세션 목록을 펼칠지 (FE-47) */
  isFloorOpen(floorId) { return this.floorFold === 'all' || (this.floorFold === 'auto' && floorId === this.selectedFloorId); }
  allFloorsOpen() { const fs = [...this.floors.keys()]; return fs.length > 0 && fs.every((id) => this.isFloorOpen(id)); }
  setFloorFold(v) { this.floorFold = v === 'all' || v === 'none' ? v : 'auto'; ls.set('aiOffice.floorFold', this.floorFold === 'auto' ? null : this.floorFold); this.emit('option'); }
  /** 모두 펼치기 ↔ 모두 접기 */
  toggleAllFloors() { this.setFloorFold(this.allFloorsOpen() ? 'none' : 'all'); }

  selectFloor(id) {
    if (this.floorFold === 'none') this.setFloorFold('auto'); // 모두 접힌 상태에서 층을 고르면 지금처럼 그 층이 열린다
    this.setAutoFollowFlag(false);
    this.selectedFloorId = id;
    this.selectedSessionId = null;
    this.reconcileSelection();
    this.rememberSelection();
    this.emit('select');
  }

  selectSession(id) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.setAutoFollowFlag(false);
    this.selectedFloorId = s.floorId;
    this.selectedSessionId = id;
    this.rememberSelection();
    this.emit('select');
  }

  setAutoFollow(v) {
    this.setAutoFollowFlag(v);
    if (v) {
      const latest = this.sessionsSorted()[0];
      if (latest) { this.selectedFloorId = latest.floorId; this.selectedSessionId = latest.id; }
    }
    this.emit('select');
  }

  /** autoFollow 값과 저장. 켜면 마지막 선택 기억은 지운다 (다음에 열 때 자동 따라가기가 우선) */
  setAutoFollowFlag(v) {
    this.autoFollow = !!v;
    ls.set('aiOffice.autoFollow', v ? null : 'off');
    if (v) { ls.set('aiOffice.selectedFloor', null); ls.set('aiOffice.selectedSession', null); }
  }

  /** 마지막에 보던 층·세션을 브라우저에 기억 (데모 층은 제외) */
  rememberSelection() {
    if (isDemoFloor(this.selectedFloorId)) return;
    ls.set('aiOffice.selectedFloor', this.selectedFloorId);
    ls.set('aiOffice.selectedSession', this.selectedSessionId);
  }

  /** 첫 스냅샷: 기억한 층/세션이 아직 있으면 거기부터. 자동 따라가기가 켜져 있으면 그쪽이 우선 */
  restoreSelection() {
    if (this.autoFollow) return;
    const floorId = ls.get('aiOffice.selectedFloor');
    const sessionId = ls.get('aiOffice.selectedSession');
    const s = sessionId ? this.sessions.get(sessionId) : null;
    if (s && !isDemoFloor(s.floorId)) { this.selectedFloorId = s.floorId; this.selectedSessionId = s.id; return; }
    if (floorId && this.floors.has(floorId) && !isDemoFloor(floorId)) { this.selectedFloorId = floorId; this.selectedSessionId = null; }
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
      if (q && !(`${e.text} ${this.logWho(e)}`.toLowerCase().includes(q))) continue;
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

  /** 화면에 보일 캐릭터 이름: 세션의 main 은 세션별 이름(직접 지은 이름 > 자동 별명), 서브에이전트는 서버 이름 */
  nameOf(session, agent) {
    if (!session) return agent ? agent.name : 'Claude';
    if (!agent || agent.kind === 'main' || agent.id === 'main') return this.names.nameOf(session.id);
    return agent.name;
  }
  /** 로그 항목의 표시 이름 (main 은 세션별 이름으로 치환) */
  logWho(e) {
    const s = this.sessions.get(e.sessionId);
    return s && e.agentId === 'main' ? this.names.nameOf(s.id) : e.agentName;
  }
  setName(sessionId, name) { this.names.set(sessionId, name); this.emit('option'); }
  rerollName(sessionId) { this.names.reroll(sessionId); this.emit('option'); }

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
