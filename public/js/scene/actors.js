// 캐릭터: 서버 상태(Agent.room/activity/bubble) → 자리 배정 → A* 로 걸어가기 → 그리기 + 말풍선.
import { SLOTS, SPAWN, USER_SEAT, project } from './map.js';
import { findPath, nearestWalkable } from './pathfind.js';
import { shadow, shade } from './sprites.js';
import { roundRect } from './render.js';
import { elapsed } from '../store.js';

const SPEED = 3.6;          // 타일/초
const LEAVE_TIMEOUT = 8000; // 퇴근 중 최대 대기

// ---------- 자리 배정 ----------
class Slots {
  constructor() { this.byActor = new Map(); this.taken = new Map(); }
  release(actorKey) {
    const s = this.byActor.get(actorKey);
    if (s) { this.taken.delete(s); this.byActor.delete(actorKey); }
  }
  acquire(actorKey, room) {
    this.release(actorKey);
    const list = SLOTS[room] || SLOTS.lobby;
    let pick = list.find(([x, y]) => !this.taken.has(`${x},${y}`));
    if (!pick) { let h = 0; for (const c of actorKey) h = (h * 31 + c.charCodeAt(0)) >>> 0; pick = list[h % list.length]; }
    const key = `${pick[0]},${pick[1]}`;
    this.taken.set(key, actorKey);
    this.byActor.set(actorKey, key);
    return pick;
  }
}

// ---------- 캐릭터 ----------
class Actor {
  constructor(key, info, startTile) {
    this.key = key;
    Object.assign(this, info); // name, color, kind, sessionId, agentId
    this.x = startTile[0]; this.y = startTile[1];
    this.path = [];
    this.room = null;
    this.activity = 'wait'; this.bubble = ''; this.icon = ''; this.since = Date.now();
    this.faceRight = true;
    this.walkT = 0;
    this.dead = false; this.deadAt = 0;
    this.selected = false; this.dim = false;
  }
  get tile() { return [Math.round(this.x), Math.round(this.y)]; }
  goTo(tile) {
    const [sx, sy] = nearestWalkable(...this.tile);
    const p = findPath(sx, sy, tile[0], tile[1]);
    if (p) { if (sx !== this.tile[0] || sy !== this.tile[1]) p.unshift([sx, sy]); this.path = p; }
    else { this.path = []; this.x = tile[0]; this.y = tile[1]; } // 길이 없으면 순간이동
  }
  update(dt) {
    if (!this.path.length) { this.walkT = 0; return; }
    const [tx, ty] = this.path[0];
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const step = SPEED * dt;
    if (dist <= step) { this.x = tx; this.y = ty; this.path.shift(); }
    else { this.x += dx / dist * step; this.y += dy / dist * step; }
    const sdx = dx - dy; // 화면 x 방향
    if (Math.abs(sdx) > 0.01) this.faceRight = sdx > 0;
    this.walkT += dt;
  }
  get walking() { return this.path.length > 0; }
}

// ---------- 그리기 ----------
function drawPerson(ctx, a, now) {
  const cx = a.x + 0.5, cy = a.y + 0.5;
  const base = project(cx, cy);
  const alpha = a.dim ? 0.45 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  shadow(ctx, cx, cy, 0.26, 0.13, 0.2);
  const bob = a.walking ? Math.abs(Math.sin(a.walkT * 9)) * 2.2 : (a.activity === 'think' ? Math.sin(now / 420) * 0.8 : 0);
  const sit = a.activity === 'rest' || a.user ? 5 : 0;
  const fx = base.x, fy = base.y - bob + sit;
  const color = a.color;
  const dark = shade(color, 0.72);
  // 다리
  const legSwing = a.walking ? Math.sin(a.walkT * 9) * 3 : 0;
  ctx.fillStyle = '#3a3f4b';
  ctx.fillRect(fx - 6, fy - 11 + Math.max(0, legSwing), 5, 11 - Math.max(0, legSwing));
  ctx.fillRect(fx + 1, fy - 11 + Math.max(0, -legSwing), 5, 11 - Math.max(0, -legSwing));
  // 몸통
  ctx.fillStyle = color;
  roundRect(ctx, fx - 9, fy - 30, 18, 21, 6); ctx.fill();
  ctx.fillStyle = dark;
  roundRect(ctx, fx - 9, fy - 16, 18, 7, 3); ctx.fill(); // 벨트/하의
  // 팔
  ctx.fillStyle = color;
  const arm = a.activity === 'think' ? -4 : 0;
  roundRect(ctx, fx - 13, fy - 27, 4, 14 + arm, 2); ctx.fill();
  roundRect(ctx, fx + 9, fy - 27, 4, 14, 2); ctx.fill();
  // 머리
  ctx.fillStyle = '#f3d2b5';
  ctx.beginPath(); ctx.arc(fx, fy - 38, 9, 0, Math.PI * 2); ctx.fill();
  // 머리카락
  ctx.fillStyle = a.user ? '#4a3b32' : dark;
  ctx.beginPath(); ctx.arc(fx, fy - 40, 9, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillRect(fx - 9, fy - 40, 18, 3);
  // 눈
  ctx.fillStyle = '#2b2f3a';
  const ex = a.faceRight ? 3 : -3;
  ctx.fillRect(fx + ex - 1, fy - 38, 2, 2);
  ctx.fillRect(fx + ex + (a.faceRight ? -5 : 5) - 1, fy - 38, 2, 2);
  // 서브에이전트 표식: 작은 안전모
  if (a.kind === 'sub') {
    ctx.fillStyle = '#3b6fd6';
    ctx.beginPath(); ctx.arc(fx, fy - 41, 9.5, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(fx - 11, fy - 42, 22, 2.5);
  }
  // 책 / 노트북 소품
  if (a.activity === 'read' || a.activity === 'search') {
    ctx.fillStyle = '#fff'; ctx.fillRect(fx - 7, fy - 20, 14, 8);
    ctx.fillStyle = '#c0504d'; ctx.fillRect(fx - 7, fy - 20, 2, 8);
  } else if (a.activity === 'edit' || a.activity === 'work' || a.activity === 'run') {
    ctx.fillStyle = '#2f3542'; ctx.fillRect(fx - 7, fy - 21, 14, 8);
    ctx.fillStyle = '#5aa7e6'; ctx.fillRect(fx - 6, fy - 20, 12, 5);
  } else if (a.activity === 'rest') {
    ctx.fillStyle = '#fff'; ctx.fillRect(fx + 6, fy - 20, 5, 6);
    ctx.fillStyle = '#e8683a'; ctx.fillRect(fx + 6, fy - 20, 5, 2);
  }
  // 선택 표시
  if (a.selected) {
    ctx.strokeStyle = '#e8683a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(base.x, base.y + 1, 15, 7, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawOverlay(ctx, camera, a, now) {
  const base = project(a.x + 0.5, a.y + 0.5);
  const s = camera.worldToScreen(base.x, base.y);
  const z = camera.cam.zoom;
  const alpha = a.dim ? 0.5 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 이름표 (발 아래)
  ctx.font = '600 10px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
  const name = a.user ? `${a.name} (나)` : a.name;
  const nw = ctx.measureText(name).width + 18;
  const ny = s.y + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = a.selected ? '#e8683a' : 'rgba(0,0,0,0.12)';
  ctx.lineWidth = a.selected ? 1.5 : 1;
  roundRect(ctx, s.x - nw / 2, ny - 8, nw, 16, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = a.color;
  ctx.beginPath(); ctx.arc(s.x - nw / 2 + 8, ny, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2f3a';
  ctx.fillText(name, s.x + 4, ny + 0.5);
  // 말풍선 (머리 위)
  if (a.bubble && !a.user) {
    ctx.font = '11px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
    let text = `${a.icon ? a.icon + ' ' : ''}${a.bubble}`;
    if (text.length > 28) text = text.slice(0, 27) + '…';
    const ago = elapsed(a.since, now);
    const full = `${text} · ${ago}`;
    const bw = Math.min(260, ctx.measureText(full).width + 18);
    const by = s.y - 48 * z - 16;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = a.selected ? '#e8683a' : 'rgba(0,0,0,0.14)';
    ctx.lineWidth = a.selected ? 1.5 : 1;
    roundRect(ctx, s.x - bw / 2, by - 11, bw, 22, 11); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x - 4, by + 11); ctx.lineTo(s.x + 4, by + 11); ctx.lineTo(s.x, by + 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2b2f3a';
    ctx.fillText(text, s.x - ctx.measureText(` · ${ago}`).width / 2, by + 0.5);
    ctx.fillStyle = '#8a919b';
    ctx.font = '10px -apple-system, system-ui, sans-serif';
    ctx.fillText(`· ${ago}`, s.x + ctx.measureText(text).width / 2 + 2, by + 1);
  }
  ctx.restore();
}

// ---------- 관리자 ----------
export function createActors(store, scene) {
  const slots = new Slots();
  let actors = new Map();   // key → Actor
  let floorId = null;
  let last = 0;
  const user = new Actor('user', { name: store.me, color: '#6b7fd6', kind: 'user', user: true, sessionId: null }, [USER_SEAT.x, USER_SEAT.y]);

  function keyOf(s, a) { return `${s.id}/${a.id}`; }

  function sync(initial = false) {
    const fid = store.selectedFloorId;
    if (fid !== floorId) { actors = new Map(); slots.byActor.clear(); slots.taken.clear(); floorId = fid; initial = true; }
    user.name = store.me;
    const seen = new Set();
    for (const { agent, session } of store.agentsOfFloor(fid)) {
      const key = keyOf(session, agent);
      seen.add(key);
      let a = actors.get(key);
      if (!a) {
        const info = { name: agent.name, color: store.colorOf(session, agent), kind: agent.kind, sessionId: session.id, agentId: agent.id };
        a = new Actor(key, info, [SPAWN.x, SPAWN.y]);
        actors.set(key, a);
        if (initial) { const t = slots.acquire(key, agent.room); a.x = t[0]; a.y = t[1]; a.room = agent.room; }
      }
      a.name = agent.name;
      a.dead = false;
      if (a.room !== agent.room) {
        a.room = agent.room;
        const t = agent.room === 'elevator' && agent.leaving ? [SPAWN.x, SPAWN.y] : slots.acquire(key, agent.room);
        a.goTo(t);
      }
      a.activity = agent.activity; a.bubble = agent.bubble; a.icon = agent.icon; a.since = agent.since;
      a.selected = session.id === store.selectedSessionId;
      a.dim = !a.selected;
    }
    for (const [key, a] of actors) {
      if (seen.has(key) || a.dead) continue;
      a.dead = true; a.deadAt = Date.now();
      a.bubble = '퇴근합니다'; a.icon = '👋'; a.activity = 'leave';
      slots.release(key);
      a.goTo([SPAWN.x, SPAWN.y]);
    }
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    const out = [];
    for (const [key, a] of actors) {
      a.update(dt);
      if (a.dead && (!a.walking || now - a.deadAt > LEAVE_TIMEOUT)) { actors.delete(key); continue; }
      out.push({ key: a.x + 1 + a.y + 1, draw: (ctx, t) => drawPerson(ctx, a, t), overlay: (ctx, cam, t) => drawOverlay(ctx, cam, a, t) });
    }
    out.push({ key: user.x + 1 + user.y + 1, draw: (ctx, t) => drawPerson(ctx, user, t), overlay: (ctx, cam, t) => drawOverlay(ctx, cam, user, t) });
    return out;
  }

  function pick({ tx, ty }) {
    let best = null, bd = 0.9;
    for (const a of actors.values()) {
      const d = Math.hypot(a.x + 0.5 - tx, a.y + 0.5 - ty - 0.4); // 몸통이 위로 솟아 있어 살짝 위쪽도 허용
      if (d < bd) { bd = d; best = a; }
    }
    if (best && best.sessionId) store.selectSession(best.sessionId);
  }

  store.subscribe((kind) => { if (kind === 'snapshot') sync(true); else sync(false); });
  scene.setActorProvider(tick);
  scene.onClick(pick);
  return { sync, tick, pick, get actors() { return actors; }, user };
}
