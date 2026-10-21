// 캐릭터: 서버 상태(Agent.room/activity/bubble) → 자리 배정 → A* 로 걸어가기 → 그리기 + 말풍선.
import { SLOTS, SPAWN, USER_SEAT, project, isWalkable } from './map.js';
import { findPath, nearestWalkable } from './pathfind.js';
import { shadow, shade, FONT } from './sprites.js';
import { roundRect, makeEntity } from './render.js';
import { elapsed } from '../store.js';
import { drawAvatar } from './avatar.js';

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

// ---------- 자율 행동 목적지 (쉬는 캐릭터용) ----------
const AMBIENT_SPOTS = [
  { tile: [16, 11], bubble: '커피 한 잔', icon: '☕', stay: [6000, 11000] },
  { tile: [17, 11], bubble: '커피 한 잔', icon: '☕', stay: [6000, 11000] },
  { tile: [11, 12], bubble: '소파에서 잠깐', icon: '🛋️', stay: [8000, 14000] },
  { tile: [9, 10], bubble: '화분 구경', icon: '🌿', stay: [4000, 8000] },
  { tile: [10, 16], bubble: '화분 구경', icon: '🌿', stay: [4000, 8000] },
  { tile: [26, 4], bubble: '창밖 구경', icon: '🪟', stay: [5000, 9000] },
  { tile: [26, 2], bubble: '창밖 구경', icon: '🪟', stay: [5000, 9000] },
  { tile: [13, 20], bubble: '로비 산책', icon: '🚶', stay: [3000, 6000] },
  { tile: [21, 19], bubble: '벤치에서 한숨', icon: '🪑', stay: [6000, 10000] },
].filter((s) => isWalkable(s.tile[0], s.tile[1]));

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
    // 생동감: 자율 행동 / 미세 동작
    this.seed = Math.random() * 1000;
    this.ambient = null;            // { phase:'go'|'stay'|'back', until, bubble, icon, from }
    this.nextAmbientAt = Date.now() + 8000 + Math.random() * 30000;
    this.nextTurnAt = Date.now() + 4000 + Math.random() * 8000;
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
function drawPerson(ctx, a, now, spec) {
  const cx = a.x + 0.5, cy = a.y + 0.5;
  const base = project(cx, cy);
  ctx.save();
  ctx.globalAlpha = a.dim ? 0.45 : 1;
  shadow(ctx, cx, cy, 0.28, 0.14, 0.2);
  const breath = Math.sin(now / 700 + a.seed) * 0.7;                       // 숨쉬기
  const bob = a.walking ? Math.abs(Math.sin(a.walkT * 9)) * 2.2 : (a.activity === 'think' ? Math.sin(now / 420) * 0.8 : breath);
  const sit = a.activity === 'rest' && !a.ambient ? 4 : 0;
  const blink = ((now + a.seed * 37) % 4200) < 130;                        // 4.2초마다 130ms 깜빡임
  const typing = !a.walking && (a.activity === 'edit' || a.activity === 'work' || a.activity === 'run');
  const fx = base.x, fy = base.y - bob + sit;
  drawAvatar(ctx, fx, fy, spec, { sessionColor: a.color, walking: a.walking, walkT: a.walkT, now, faceRight: a.faceRight, thinking: a.activity === 'think', hardHat: a.kind === 'sub', blink, typing });
  // 활동 소품 (손 높이)
  if (a.ambient) {
    // 자율 행동 소품: 커피잔 / 없음
    if (a.ambient.spot.icon === '☕' && a.ambient.phase !== 'go') { ctx.fillStyle = '#fff'; ctx.fillRect(fx + 6, fy - 20, 5, 6); ctx.fillStyle = '#6b4e3d'; ctx.fillRect(fx + 6, fy - 20, 5, 2); }
  } else if (a.activity === 'read' || a.activity === 'search') {
    const page = Math.floor(now / 900 + a.seed) % 2;                       // 책장 넘기기
    ctx.fillStyle = '#fff'; ctx.fillRect(fx - 7, fy - 20, 14, 8);
    ctx.fillStyle = '#c0504d'; ctx.fillRect(fx - 7, fy - 20, 2, 8);
    ctx.fillStyle = '#d9dce2'; ctx.fillRect(fx - 4 + page * 6, fy - 19, 4, 6);
  } else if (a.activity === 'edit' || a.activity === 'work' || a.activity === 'run') {
    ctx.fillStyle = '#2f3542'; ctx.fillRect(fx - 7, fy - 21, 14, 8);
    ctx.fillStyle = '#5aa7e6'; ctx.fillRect(fx - 6, fy - 20, 12, 5);
    const k = Math.floor(now / 160 + a.seed) % 3;                           // 타자 치는 커서/손
    ctx.fillStyle = '#eaf6ff'; ctx.fillRect(fx - 5 + k * 3, fy - 19, 2, 1.2);
  } else if (a.activity === 'rest') {
    ctx.fillStyle = '#fff'; ctx.fillRect(fx + 6, fy - 20, 5, 6);
    ctx.fillStyle = '#e8683a'; ctx.fillRect(fx + 6, fy - 20, 5, 2);
  }
  // 답을 기다리는 중: 머리 위 느낌표 펄스
  if (a.activity === 'ask') {
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);
    const ty = fy - 68 - pulse * 3;
    ctx.fillStyle = '#e05252';
    ctx.beginPath(); ctx.arc(fx, ty, 7 + pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', fx, ty + 0.5);
  }
  if (a.selected) {
    ctx.strokeStyle = '#e8683a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(base.x, base.y + 1, 17, 8, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

const placedBubbles = []; // 이번 프레임에 그린 말풍선 사각형 (겹침 방지)
export function resetBubbles() { placedBubbles.length = 0; }

function drawOverlay(ctx, camera, a, now, bubbleMode) {
  const base = project(a.x + 0.5, a.y + 0.5);
  const s = camera.worldToScreen(base.x, base.y);
  const z = camera.cam.zoom;
  ctx.save();
  ctx.globalAlpha = a.dim ? 0.5 : 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 이름표 (발 아래)
  ctx.font = `700 9.5px ${FONT}`;
  const name = a.user ? `${a.name} (나)` : a.name;
  const nw = ctx.measureText(name).width + 18;
  const ny = s.y + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = a.selected ? '#e8683a' : 'rgba(0,0,0,0.1)';
  ctx.lineWidth = a.selected ? 1.5 : 1;
  roundRect(ctx, s.x - nw / 2, ny - 7.5, nw, 15, 7.5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = a.color;
  ctx.beginPath(); ctx.arc(s.x - nw / 2 + 8, ny, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2f3a';
  ctx.fillText(name, s.x + 4, ny + 0.5);
  // 말풍선 (머리 위) — 본체와 꼬리를 한 경로로
  const amb = a.ambient && a.ambient.phase !== 'back' ? a.ambient.spot : null;
  if ((amb || a.bubble) && !a.user && (bubbleMode !== 'selected' || a.selected)) {
    ctx.font = `8px ${FONT}`;
    let text = amb ? `${amb.icon} ${amb.bubble}` : `${a.icon ? a.icon + ' ' : ''}${a.bubble}`;
    if (text.length > 30) text = text.slice(0, 29) + '…';
    const ago = elapsed(a.since, now);
    const full = `${text} · ${ago}`;
    const bw = Math.min(240, ctx.measureText(full).width + 16), bh = 17, r = 8.5;
    const headTop = s.y - 62 * z;
    let by = headTop - 14;
    for (let guard = 0; guard < 8; guard++) {
      const hit = placedBubbles.find((q) => s.x - bw / 2 < q.x1 && s.x + bw / 2 > q.x0 && by - bh / 2 < q.y1 && by + bh / 2 > q.y0);
      if (!hit) break;
      by = hit.y0 - bh / 2 - 3;
    }
    placedBubbles.push({ x0: s.x - bw / 2, x1: s.x + bw / 2, y0: by - bh / 2, y1: by + bh / 2 });
    const bx = s.x - bw / 2, y0 = by - bh / 2;
    ctx.beginPath();
    ctx.moveTo(bx + r, y0); ctx.arcTo(bx + bw, y0, bx + bw, y0 + bh, r); ctx.arcTo(bx + bw, y0 + bh, bx, y0 + bh, r);
    ctx.lineTo(s.x + 4, y0 + bh); ctx.lineTo(s.x, y0 + bh + 5); ctx.lineTo(s.x - 4, y0 + bh);
    ctx.arcTo(bx, y0 + bh, bx, y0, r); ctx.arcTo(bx, y0, bx + bw, y0, r); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.strokeStyle = a.selected ? '#e8683a' : 'rgba(0,0,0,0.13)';
    ctx.lineWidth = a.selected ? 1.5 : 1;
    ctx.fill(); ctx.stroke();
    if (y0 + bh + 5 < headTop - 6) { ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s.x, y0 + bh + 5); ctx.lineTo(s.x, headTop - 6); ctx.stroke(); }
    ctx.fillStyle = '#2b2f3a';
    const agoW = ctx.measureText(` · ${ago}`).width;
    ctx.fillText(text, s.x - agoW / 2, by + 0.5);
    ctx.fillStyle = '#8a919b';
    ctx.fillText(` · ${ago}`, s.x + ctx.measureText(text).width / 2, by + 0.5);
  }
  ctx.restore();
}

// ---------- 관리자 ----------
export function createActors(store, scene, avatars) {
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
      if (a.ambient && a.since !== agent.since) { // 새 이벤트 → 자율 행동 즉시 중단
        a.ambient = null;
        a.goTo(slots.byActor.has(key) ? slots.byActor.get(key).split(',').map(Number) : slots.acquire(key, agent.room));
      }
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

  // 캐릭터 AABB: 발 위치 타일 안쪽 0.25~0.75, 높이 1.7
  function entityOf(a) {
    return makeEntity(
      { x0: a.x + 0.25, y0: a.y + 0.25, x1: a.x + 0.75, y1: a.y + 0.75, z0: 0, z1: 2.2 },
      (ctx, t) => drawPerson(ctx, a, t, avatars.forActor(a, floorId)),
      { overlay: (ctx, cam, t) => drawOverlay(ctx, cam, a, t, store.bubbleMode), label: 'actor', isActor: true },
    );
  }

  /** 쉬는 캐릭터의 자율 행동과 고개 돌리기 */
  function ambientStep(a, now, key) {
    if (a.user || a.dead) return;
    const t = Date.now();
    // 서 있을 때 가끔 고개 돌리기 (걷는 중엔 이동 방향이 우선)
    if (!a.walking && t > a.nextTurnAt && a.activity !== 'ask') { a.faceRight = !a.faceRight; a.nextTurnAt = t + 4000 + Math.random() * 10000; }
    if (!store.ambient) { if (a.ambient) { a.ambient = null; const sl = slots.byActor.get(key); if (sl) a.goTo(sl.split(',').map(Number)); } return; }
    const resting = a.activity === 'rest' || a.activity === 'wait';
    if (!a.ambient) {
      if (resting && t > a.nextAmbientAt && AMBIENT_SPOTS.length) {
        const spot = AMBIENT_SPOTS[Math.floor(Math.random() * AMBIENT_SPOTS.length)];
        const [sx, sy] = a.tile;
        a.ambient = { phase: 'go', spot, until: 0, from: [sx, sy] };
        a.goTo(spot.tile);
      }
      return;
    }
    const am = a.ambient;
    if (am.phase === 'go' && !a.walking) { am.phase = 'stay'; am.until = t + am.spot.stay[0] + Math.random() * (am.spot.stay[1] - am.spot.stay[0]); }
    else if (am.phase === 'stay' && t > am.until) { am.phase = 'back'; a.goTo(am.from); }
    else if (am.phase === 'back' && !a.walking) { a.ambient = null; a.nextAmbientAt = t + 20000 + Math.random() * 50000; }
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    resetBubbles();
    const out = [];
    const ordered = [...actors.entries()].sort(([, a], [, b]) => (b.selected ? 1 : 0) - (a.selected ? 1 : 0));
    for (const [key, a] of ordered) {
      a.update(dt);
      ambientStep(a, now, key);
      if (a.dead && (!a.walking || now - a.deadAt > LEAVE_TIMEOUT)) { actors.delete(key); continue; }
      out.push(entityOf(a));
    }
    out.push(entityOf(user));
    return out;
  }

  function nearest(tx, ty, radius = 0.9) {
    let best = null, bd = radius;
    for (const a of actors.values()) {
      const d = Math.hypot(a.x + 0.5 - tx, a.y + 0.5 - ty - 0.4); // 몸통이 위로 솟아 있어 살짝 위쪽도 허용
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  function pick({ tx, ty }) {
    const best = nearest(tx, ty);
    if (best && best.sessionId) store.selectSession(best.sessionId);
  }

  /** 마우스 아래 캐릭터 (없으면 null) */
  function hoverAt(p) { return p ? nearest(p.tx, p.ty) : null; }

  /** 캐릭터의 머리 위 화면 좌표 */
  function screenPosOf(a, camera) {
    const base = project(a.x + 0.5, a.y + 0.5, 0);
    const s = camera.worldToScreen(base.x, base.y);
    return { x: s.x, y: s.y - 50 * camera.cam.zoom };
  }

  store.subscribe((kind) => { if (kind === 'snapshot') sync(true); else sync(false); });
  scene.setActorProvider(tick);
  scene.onClick(pick);
  /** 선택 세션의 main 캐릭터 (카메라 따라가기용) */
  function selectedActor() {
    const sid = store.selectedSessionId;
    if (!sid) return null;
    return actors.get(`${sid}/main`) || [...actors.values()].find((a) => a.sessionId === sid) || null;
  }

  return { sync, tick, pick, hoverAt, screenPosOf, selectedActor, get actors() { return actors; }, user };
}
