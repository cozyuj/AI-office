// 장면 렌더: 바닥 → 깊이 정렬된 가구/벽/캐릭터 → (화면 공간) 방 이름표.
//
// 깊이 정렬: 각 엔티티는 3D AABB {x0,y0,x1,y1,z0,z1} 를 가진다. 화면에서 겹치는 두 상자 A, B 에 대해
//   A.x1 <= B.x0  또는  A.y1 <= B.y0  또는  A.z1 <= B.z0  이면 A 가 뒤(먼저 그림).
// 이 관계로 위상 정렬한다. 정적 엔티티끼리의 관계는 한 번만 계산해 두고, 캐릭터와의 관계만 매 프레임 계산한다.
import { GRID, ROOMS, CORRIDOR, FURNITURE, WALLS, DOORS, LABEL, project, roomAt, worldBounds, setTheme as setMapTheme, setFloorStyle as setMapFloorStyle } from './map.js';
import * as MAP from './map.js';
import { tr } from '../i18n.js';
import { tile, drawFurniture, wallPieces, drawWallPiece, drawDoorMat, drawDoorPost } from './sprites.js';
import { resolve as resolveDaylight, setPeriod as setDaylightPeriod, palette as daylight } from './daylight.js';

const EPS = 1e-3;

// ---------- 바닥 ----------
export function drawFloorRaw(ctx) {
  for (let y = GRID.y0; y <= GRID.y1; y++) {
    for (let x = GRID.x0; x <= GRID.x1; x++) {
      const r = roomAt(x, y) || CORRIDOR;
      let fill = r.floor;
      if (r.pattern === 'checker' && (x + y) % 2) fill = r.alt || r.floor;
      tile(ctx, x, y, fill, r.trim);
      if (r.pattern === 'deck') { // 테라스 데크: 가로 널빤지 + 틈
        ctx.strokeStyle = 'rgba(90,60,30,0.22)'; ctx.lineWidth = 1;
        for (const f of [0.25, 0.5, 0.75]) {
          const a = project(x, y + f), b = project(x + 1, y + f);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        const off = (x * 5 + y * 11) % 3 / 3;
        const c = project(x + off, y), d = project(x + off, y + 1);
        ctx.strokeStyle = 'rgba(90,60,30,0.14)';
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
      if (r.pattern === 'wood') {
        ctx.strokeStyle = 'rgba(120,85,40,0.16)'; ctx.lineWidth = 1;
        for (const f of [0.33, 0.66]) {
          const a = project(x + f, y), b = project(x + f, y + 1);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        const off = (x * 7 + y * 3) % 2 ? 0.5 : 0;
        const c = project(x, y + off), d = project(x + 1, y + off);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
      if (r.pattern === 'grass') { // 잔디: 풀 포기 몇 개 (옥상정원)
        ctx.strokeStyle = 'rgba(40,110,50,0.3)'; ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const u = 0.15 + ((x * 13 + y * 7 + k * 5) % 10) / 10 * 0.7, v = 0.15 + ((x * 3 + y * 11 + k * 7) % 10) / 10 * 0.7;
          const a = project(x + u, y + v);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - 2, a.y - 5); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + 2.5, a.y - 4); ctx.stroke();
        }
      }
      if (r.pattern === 'carpet') { // 카펫: 점 무늬
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        for (const [u, v] of [[0.3, 0.3], [0.7, 0.7], [0.3, 0.7], [0.7, 0.3]]) { const p = project(x + u, y + v); ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2); ctx.fill(); }
      }
      if (r.pattern === 'rubber') { // 고무 바닥 (헬스장): 가는 가로줄
        ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1;
        const a = project(x, y + 0.5), b = project(x + 1, y + 0.5);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }
  for (const d of DOORS) drawDoorMat(ctx, d);
  ctx.lineWidth = 1.2;
  for (const r of ROOMS) {
    const a = project(r.x0, r.y0), b = project(r.x1 + 1, r.y0), c = project(r.x1 + 1, r.y1 + 1), d = project(r.x0, r.y1 + 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.stroke();
  }
}

let cacheEnabled = true;
export function setCacheEnabled(v) { cacheEnabled = v; }
const FLOOR_MAX_SCALE = 2;      // 바닥 캐시 해상도 상한 (메모리)
const SPRITE_MAX_SCALE = 3;     // 레티나(dpr 2)에서 zoom 1.5 까지 선명. 4 는 메모리가 너무 큼
let floorCache = null;           // { scale, canvas, x0, y0, w, h }

function makeLayer(wpx, hpx) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(wpx)); c.height = Math.max(1, Math.ceil(hpx));
  return c;
}

/** 바닥: scale(zoom×dpr) 별로 한 번만 그려 두고 이미지로 찍는다 */
export function drawFloor(ctx, scale = 1) {
  if (!cacheEnabled || typeof document === 'undefined') { drawFloorRaw(ctx); return; }
  const sc = Math.min(FLOOR_MAX_SCALE, Math.max(0.25, scale));
  if (!floorCache || Math.abs(floorCache.scale - sc) > sc * 0.02) {
    const b = worldBounds();
    const pad = 8;
    const x0 = b.x0 - pad, y0 = b.y0 - pad, w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
    const canvas = makeLayer(w * sc, h * sc);
    const c = canvas.getContext('2d');
    c.scale(sc, sc); c.translate(-x0, -y0);
    drawFloorRaw(c);
    floorCache = { scale: sc, canvas, x0, y0, w, h };
  }
  ctx.drawImage(floorCache.canvas, floorCache.x0, floorCache.y0, floorCache.w, floorCache.h);
}

/**
 * 정적 엔티티를 스프라이트로 캐시해 찍는다. dynamic(깜빡임) 은 매 프레임 직접 그린다.
 * key 가 있는 엔티티(가구·벽·문설주)는 같은 종류끼리 스프라이트 한 장을 공유한다(FE-39):
 * 그리기는 타일 좌표의 평행이동에 불변이므로 기준점(anchor = project(x, y)) 기준 오프셋으로 찍으면 픽셀이 같다.
 */
const SHARED = new Map(); // key → { scale, canvas, dx, dy, w, h }
export function sharedSpriteCount() { return SHARED.size; }
function drawCached(ctx, e, now, scale) {
  if (!cacheEnabled || e.dynamic || typeof document === 'undefined') { e.draw(ctx, now); return; }
  const sc = Math.min(SPRITE_MAX_SCALE, Math.max(0.25, scale));
  if (e.key) {
    let sp = SHARED.get(e.key);
    if (!sp || Math.abs(sp.scale - sc) > sc * 0.02) {
      const pad = e.pad || 24;
      const x0 = e.sb.x0 - pad, y0 = e.sb.y0 - pad, w = e.sb.x1 - e.sb.x0 + pad * 2, h = e.sb.y1 - e.sb.y0 + pad * 2;
      const canvas = makeLayer(w * sc, h * sc);
      const c = canvas.getContext('2d');
      c.scale(sc, sc); c.translate(-x0, -y0);
      e.draw(c, 0);
      sp = { scale: sc, canvas, dx: x0 - e.anchor.x, dy: y0 - e.anchor.y, w, h };
      SHARED.set(e.key, sp);
    }
    ctx.drawImage(sp.canvas, e.anchor.x + sp.dx, e.anchor.y + sp.dy, sp.w, sp.h);
    return;
  }
  let sp = e._sprite;
  if (!sp || Math.abs(sp.scale - sc) > sc * 0.02) {
    const pad = e.pad || 24;
    const x0 = e.sb.x0 - pad, y0 = e.sb.y0 - pad, w = e.sb.x1 - e.sb.x0 + pad * 2, h = e.sb.y1 - e.sb.y0 + pad * 2;
    const canvas = makeLayer(w * sc, h * sc);
    const c = canvas.getContext('2d');
    c.scale(sc, sc); c.translate(-x0, -y0);
    e.draw(c, 0);
    sp = e._sprite = { scale: sc, canvas, x0, y0, w, h };
  }
  ctx.drawImage(sp.canvas, sp.x0, sp.y0, sp.w, sp.h);
}

/** 바닥 캐시 + 모든 레이아웃의 스프라이트 캐시를 비운다 (팔레트가 바뀌면 다른 레이아웃의 스프라이트도 낡은 색이다) */
function invalidateCaches() { floorCache = null; SHARED.clear(); for (const c of staticCache.values()) for (const e of c.entities) e._sprite = null; }
/** 테마 전환: 맵 팔레트 교체 + 캐시 무효화 */
export function setTheme(theme) { setMapTheme(theme); invalidateCaches(); }
/** 층 인테리어 프리셋 전환 (FE-34/35): 색·레이아웃이 실제로 바뀐 경우에만 정적 엔티티를 바꿔 끼우고 캐시를 비운다 */
export function setFloorStyle(presetId) { if (setMapFloorStyle(presetId)) { ensureStatic(); invalidateCaches(); } }
/** 잠시 다른 프리셋(색+레이아웃)으로 그린다 (전체 보기 미니 사무실 캐시용). 끝나면 원래 프리셋으로 되돌린다 */
export function withFloorStyle(presetId, fn) {
  const prev = MAP.STYLE;
  const changed = setMapFloorStyle(presetId);
  if (changed) { ensureStatic(); invalidateCaches(); }
  try { return fn(); } finally { if (changed) { setMapFloorStyle(prev); ensureStatic(); invalidateCaches(); } }
}

// ---------- 시간대 조명 (FE-33) ----------
// 바닥·스프라이트 캐시는 그대로 두고, 시간대가 바뀔 때만 창문 스프라이트를 다시 그린다. 틴트·조명 점은 매 프레임 가볍게 올린다.
/** mode: 'auto' | 'off' | 'morning' | 'day' | 'evening' | 'night'. 적용된 시간대를 돌려준다 */
export function setDaylight(mode, date = new Date()) {
  const p = resolveDaylight(mode, date);
  if (setDaylightPeriod(p)) { for (const e of STATIC) if (e.win) e._sprite = null; for (const k of [...SHARED.keys()]) if (k.startsWith('w:') && k.includes('|win1')) SHARED.delete(k); }
  return p;
}

/** 바닥 위 야외 방(테라스·옥상정원) 틴트 (월드 공간, drawFloor 뒤·엔티티 앞) */
export function drawDaylightFloor(ctx) {
  const c = daylight().terrace;
  if (!c) return;
  ctx.fillStyle = c;
  for (const r of ROOMS) {
    if (!r.outdoor) continue;
    const P = [project(r.x0, r.y0), project(r.x1 + 1, r.y0), project(r.x1 + 1, r.y1 + 1), project(r.x0, r.y1 + 1)];
    ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(P[i].x, P[i].y);
    ctx.closePath(); ctx.fill();
  }
}

let glowSprite = null; // 글로우는 한 번만 그려 두고 이미지로 찍는다
const GLOW_R = 22;
function glow() {
  if (glowSprite || typeof document === 'undefined') return glowSprite;
  const c = makeLayer(GLOW_R * 4, GLOW_R * 4);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(GLOW_R * 2, GLOW_R * 2, 1, GLOW_R * 2, GLOW_R * 2, GLOW_R * 2);
  grad.addColorStop(0, 'rgba(255,214,120,0.55)');
  grad.addColorStop(0.45, 'rgba(255,200,100,0.16)');
  grad.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  return (glowSprite = c);
}

/** 테라스 조명 점: 노란 원 + 은은한 글로우 (월드 공간, 엔티티 뒤에 올린다) */
export function drawDaylightLamps(ctx) {
  const k = daylight().lamp;
  if (!k) return;
  const sp = glow();
  for (const l of MAP.LAMPS) {
    const p = project(l.x, l.y, l.z);
    if (sp) { ctx.globalAlpha = k; ctx.drawImage(sp, p.x - GLOW_R, p.y - GLOW_R, GLOW_R * 2, GLOW_R * 2); ctx.globalAlpha = 1; }
    ctx.fillStyle = `rgba(255,224,140,${0.5 + 0.5 * k})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,250,220,${k})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 1, 0, Math.PI * 2); ctx.fill();
  }
}

/** 장면 전체 틴트 (화면 공간, 이름표 앞에) */
export function drawDaylightTint(ctx, width, height) {
  const c = daylight().scene;
  if (!c) return;
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, width, height);
}

// ---------- 엔티티 ----------
/** 3D AABB → 월드 화면 bbox (8 꼭짓점 투영) */
export function screenBox(b) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) {
    const p = project(x, y, z);
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

export function makeEntity(box, draw, extra = {}) {
  return { box, sb: screenBox(box), draw, far: box.x1 + box.y1, ...extra };
}

function overlaps(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** A 가 B 뒤에 있으면 -1, 앞이면 1, 관계 없음 0 */
export function compare(A, B) {
  if (!overlaps(A.sb, B.sb)) return 0;
  const a = A.box, b = B.box;
  const aBehind = a.x1 <= b.x0 + EPS || a.y1 <= b.y0 + EPS || a.z1 <= b.z0 + EPS;
  const bBehind = b.x1 <= a.x0 + EPS || b.y1 <= a.y0 + EPS || b.z1 <= a.z0 + EPS;
  if (aBehind && !bBehind) return -1;
  if (bBehind && !aBehind) return 1;
  return A.far < B.far ? -1 : A.far > B.far ? 1 : 0; // 둘 다/둘 다 아님 → far corner 로
}

// 가구 높이 (AABB z1)
const HEIGHT = {
  shelf: 2.05, desk: 1.4, desk2: 1.4, chair: 1.0, table: 0.78, roundtable: 0.78, coffeetable: 0.45, sofa: 0.95, armchair: 0.9,
  counter: 1.55, vending: 1.85, rack: 2.25, ac: 1.95, wallscreen: 2.05, globe: 1.35, whiteboard: 2.05,
  plant: 1.35, cabinet: 1.05, reception: 1.15, sign: 1.45, bench: 0.5, elevator: 2.35,
  cafetable: 0.78, stool: 0.62, coffeemachine: 1.5, planter: 0.95, parasol: 2.2,
  // FE-35 편의시설
  treadmill: 1.6, dumbbells: 1.3, mat: 0.08, cooler: 1.6, flowerbed: 0.7, pond: 0.25, buffet: 1.6, fridge: 2.05, bed: 0.6, partition: 1.55, floorlamp: 1.9,
  pooltable: 0.9, arcade: 1.75, beanbag: 0.6, pingpong: 0.95, lowshelf: 1.05, rug: 0.03, booth: 2.05, camera: 1.5, lightstand: 2.0, mic: 1.5, podium: 1.15, seat: 0.9,
};
const THIN = new Set(['chair', 'plant', 'sign', 'globe', 'seat', 'mic', 'floorlamp', 'camera', 'lightstand']); // footprint 를 안쪽으로 줄이는 얇은 소품
const PAD = { plant: 70, parasol: 70, wallscreen: 36, whiteboard: 36, pooltable: 36, pingpong: 36, booth: 44, floorlamp: 40, lightstand: 40, pond: 40, flowerbed: 36 };

/** 현재 레이아웃의 가구·벽·문설주 엔티티와, 그들끼리의 "뒤" 관계 (한 번만 계산) */
function buildStatic() {
  const S = [];
  for (const f of FURNITURE) {
    const w = f.w || 1, d = f.d || 1;
    // 얇은 소품은 footprint 를 타일 안쪽으로 줄여 이웃 타일과의 불필요한 관계를 피한다
    const inset = THIN.has(f.type) ? 0.2 : 0.05;
    S.push(makeEntity(
      { x0: f.x + inset, y0: f.y + inset, x1: f.x + w - inset, y1: f.y + d - inset, z0: 0, z1: HEIGHT[f.type] || 1 },
      (ctx) => drawFurniture(ctx, f),
      {
        label: f.type, dynamic: f.type === 'rack' || f.type === 'elevator', pad: PAD[f.type] || 28,
        // 위치를 뺀 모든 속성 + 위치로 정해지는 변형((x+y)%3: 야자수 크기, 아케이드 화면 색)
        key: `f:${f.type}|${w}|${d}|${f.face || ''}|${f.seed ?? ''}|${f.solid === false ? 0 : 1}|v${(f.x + f.y) % 3}`,
        anchor: project(f.x, f.y, 0),
      },
    ));
  }
  for (const w of WALLS) {
    for (const p of wallPieces(w)) {
      S.push(makeEntity({ x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.d, z0: 0, z1: p.h }, (ctx) => drawWallPiece(ctx, p), {
        label: 'wall', win: p.win,
        key: `w:${p.dir}|${p.w}|${p.d}|${p.h}|${p.first ? 1 : 0}|${p.last ? 1 : 0}|win${p.win ? 1 : 0}|rail${p.rail ? 1 : 0}`,
        anchor: project(p.x, p.y, 0),
      }));
    }
  }
  // 문설주: 문 구멍의 양 끝
  for (const d of DOORS) {
    const wall = WALLS.find((w) => w.dir === 'h' && w.y === d.y && d.x >= w.x && d.x < w.x + w.len);
    const h = wall ? wall.h : 0.9;
    if (d.first) S.push(makeEntity({ x0: d.x - 0.09, y0: d.y - 0.09, x1: d.x + 0.09, y1: d.y + 0.09, z0: 0, z1: h + 0.15 }, (ctx) => drawDoorPost(ctx, d.x, d.y, h), { label: 'doorpost', key: `p:${h}`, anchor: project(d.x, d.y, 0) }));
    if (d.last) S.push(makeEntity({ x0: d.x + 0.91, y0: d.y - 0.09, x1: d.x + 1.09, y1: d.y + 0.09, z0: 0, z1: h + 0.15 }, (ctx) => drawDoorPost(ctx, d.x + 1, d.y, h), { label: 'doorpost', key: `p:${h}`, anchor: project(d.x + 1, d.y, 0) }));
  }
  const edges = []; // [behindIdx, frontIdx]
  for (let i = 0; i < S.length; i++) {
    for (let j = i + 1; j < S.length; j++) {
      const c = compare(S[i], S[j]);
      if (c < 0) edges.push([i, j]);
      else if (c > 0) edges.push([j, i]);
    }
  }
  return { entities: S, edges };
}

// 레이아웃(FE-35)마다 정적 엔티티를 한 번 만들어 두고, 층이 바뀌면 STATIC 의 내용을 바꿔 끼운다 (스프라이트 캐시는 엔티티에 붙어 있어 같이 돌아온다)
const staticCache = new Map(); // layoutId → { entities, edges }
export const STATIC = [];
let STATIC_EDGES = [];
let builtLayout = null;
function ensureStatic() {
  if (builtLayout === MAP.LAYOUT) return;
  let c = staticCache.get(MAP.LAYOUT);
  if (!c) { c = buildStatic(); staticCache.set(MAP.LAYOUT, c); }
  STATIC.length = 0; STATIC.push(...c.entities);
  STATIC_EDGES = c.edges;
  builtLayout = MAP.LAYOUT;
}
ensureStatic();

let debugDepth = false;
export function setDebugDepth(v) { debugDepth = v; }

/**
 * 가구·벽·캐릭터를 깊이순으로 그린다.
 * actors: makeEntity() 로 만든 엔티티 (매 프레임 새로 만들어도 된다)
 */
export function drawEntities(ctx, now, actors = [], scale = 1) {
  const order = sortEntities(actors);
  for (let k = 0; k < order.length; k++) {
    const e = order[k];
    if (e.isActor) e.draw(ctx, now); else drawCached(ctx, e, now, scale);
    if (debugDepth) {
      const p = project((e.box.x0 + e.box.x1) / 2, (e.box.y0 + e.box.y1) / 2, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(k), p.x, p.y);
    }
  }
}

/** 정적 엔티티 + actors 를 그릴 순서대로 반환 */
export function sortEntities(actors = []) {
  ensureStatic();
  const n = STATIC.length, total = n + actors.length;
  const adj = new Array(total);
  const indeg = new Int32Array(total);
  for (let i = 0; i < total; i++) adj[i] = [];
  for (const [a, b] of STATIC_EDGES) { adj[a].push(b); indeg[b]++; }
  for (let k = 0; k < actors.length; k++) {
    const A = actors[k], ai = n + k;
    for (let i = 0; i < n; i++) {
      const c = compare(A, STATIC[i]);
      if (c < 0) { adj[ai].push(i); indeg[i]++; }
      else if (c > 0) { adj[i].push(ai); indeg[ai]++; }
    }
    for (let m = k + 1; m < actors.length; m++) {
      const c = compare(A, actors[m]);
      if (c < 0) { adj[ai].push(n + m); indeg[n + m]++; }
      else if (c > 0) { adj[n + m].push(ai); indeg[ai]++; }
    }
  }
  // Kahn 위상 정렬. 동률은 far corner 작은 것부터 (안정적인 결과)
  const all = (i) => (i < n ? STATIC[i] : actors[i - n]);
  const ready = [];
  for (let i = 0; i < total; i++) if (indeg[i] === 0) ready.push(i);
  const order = [];
  while (ready.length) {
    let bi = 0;
    for (let i = 1; i < ready.length; i++) if (all(ready[i]).far < all(ready[bi]).far) bi = i;
    const cur = ready.splice(bi, 1)[0];
    order.push(cur);
    for (const nx of adj[cur]) if (--indeg[nx] === 0) ready.push(nx);
  }
  if (order.length < total) { // 순환이 생기면 남은 것을 far corner 순으로 붙인다
    const seen = new Set(order);
    const rest = [];
    for (let i = 0; i < total; i++) if (!seen.has(i)) rest.push(i);
    rest.sort((a, b) => all(a).far - all(b).far);
    order.push(...rest);
  }
  return order.map(all);
}

// ---------- 방 이름표 (화면 공간) ----------
export function drawLabels(ctx, camera) {
  ctx.save();
  ctx.font = "800 10px 'D2Coding','NanumSquare',-apple-system,sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of ROOMS) {
    const p = project(r.x0 + 0.5, r.y0 + 0.5, 0);
    const s = camera.worldToScreen(p.x, p.y);
    const text = tr(r.label);
    const w = ctx.measureText(text).width + 16;
    const x = s.x, y = s.y - 6;
    const dark = MAP.THEME === 'dark';
    ctx.fillStyle = LABEL.bg;
    ctx.strokeStyle = dark ? LABEL.border : (r.trim || LABEL.border);
    ctx.lineWidth = 1;
    roundRect(ctx, x - w / 2, y - 10, w, 20, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = LABEL.text;
    ctx.fillText(text, x, y + 0.5);
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
