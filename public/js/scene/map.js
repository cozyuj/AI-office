// 사무실 맵: 타일 격자, 방, 가구, 벽, 서 있는 자리(slot), 통행 규칙, 투영.
// 유효 타일은 x 1..35, y 1..21. x 가 커지면 화면 오른쪽 아래, y 가 커지면 왼쪽 아래.
//
// 방·가구·벽·슬롯은 층 레이아웃(layouts.js, FE-35)에서 온다. 아래 export 들은 live 컨테이너라 setLayout() 이 내용을 통째로
// 바꿔 끼운다 (참조는 그대로). 색은 층 인테리어 프리셋(floorStyle.js, FE-34) + 테마가 정하고 applyPalette() 가 덮어쓴다.
import { palette, presetById, DEFAULT_PRESET } from './floorStyle.js';
import { buildLayout, DEFAULT_LAYOUT, LAYOUTS, resolveRoom as resolveIn, roomLabelIn, GRID as LAYOUT_GRID } from './layouts.js';

export const TW = 64;  // 타일 가로 (월드 px)
export const TH = 32;  // 타일 세로
export const ZH = 26;  // 높이 1 단위

export const GRID = { ...LAYOUT_GRID }; // inclusive

// ---------- live 맵 데이터 (setLayout 이 채운다) ----------
export const ROOMS = [];          // { id, label, x0, y0, x1, y1, floor, trim, alt?, pattern, outdoor }
export const CORRIDOR = { floor: '#f5f6f8', trim: '#e6e8ec', pattern: 'grid' };
export const FURNITURE = [];      // { type, x, y, w, d, solid(기본 true), face?, seed? } 타일 단위. 캐릭터는 solid 타일을 지나지 못한다
export const WALLS = [];          // h: 타일 (x..x+len-1, y) 의 윗변. v: 타일 (x, y..y+len-1) 의 왼변. doors: 막지 않는 offset
export const DOORS = [];          // 가로 벽의 구멍 { x, y, first, last }: (x, y-1) ↔ (x, y) 사이가 열려 있다
export const SLOTS = {};          // roomId → [[x, y], …] 서 있는 자리 (서버 휴식 방 별칭 cafe/terrace 키 포함)
export const USER_SEAT = { x: 5, y: 20 };
export const SPAWN = { x: 24, y: 19 };
export const AMBIENT_SPOTS = [];  // 쉬는 캐릭터의 자율 행동 목적지 { tile, icon, bubble, stay }
export const REST_SPOTS = {};     // 서버 휴식 방 id(lounge/cafe/terrace) → 방 안 명소 목록
export const LAMPS = [];          // 야외 조명 점 { x, y, z } (시간대 조명)
export let LAYOUT = null;         // 현재 레이아웃 id
export let LAYOUT_DATA = null;    // buildLayout() 결과

let blocked = new Set();
let blockedEdges = new Set();
const edgeKey = (x, y, nx, ny) => `${x},${y}>${nx},${ny}`;

function replaceArray(arr, items) { arr.length = 0; arr.push(...items); }
function replaceObject(obj, src) { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, src); }

/** 레이아웃 교체. 실제로 바뀌었으면 true. 색은 applyPalette() 로 다시 입힌다 */
export function setLayout(id) {
  const L = buildLayout(LAYOUTS[id] ? id : DEFAULT_LAYOUT);
  if (LAYOUT === L.id) return false;
  LAYOUT = L.id; LAYOUT_DATA = L;
  replaceArray(ROOMS, L.rooms.map((r) => ({ ...r })));
  replaceArray(FURNITURE, L.furniture);
  replaceArray(WALLS, L.walls);
  replaceArray(DOORS, L.doors);
  replaceObject(SLOTS, L.slots);
  replaceObject(REST_SPOTS, L.restSpots);
  replaceArray(LAMPS, L.lamps);
  Object.assign(USER_SEAT, L.userSeat || { x: 5, y: 20 });
  Object.assign(SPAWN, L.spawn || { x: 24, y: 19 });
  // 통행 테이블
  blocked = new Set();
  for (const f of FURNITURE) {
    if (f.solid === false) continue;
    for (let x = f.x; x < f.x + (f.w || 1); x++) for (let y = f.y; y < f.y + (f.d || 1); y++) blocked.add(`${x},${y}`);
  }
  blockedEdges = new Set();
  for (const w of WALLS) {
    for (let i = 0; i < w.len; i++) {
      if (w.doors.includes(i)) continue;
      if (w.dir === 'h') { const x = w.x + i; blockedEdges.add(edgeKey(x, w.y - 1, x, w.y)); blockedEdges.add(edgeKey(x, w.y, x, w.y - 1)); }
      else { const y = w.y + i; blockedEdges.add(edgeKey(w.x - 1, y, w.x, y)); blockedEdges.add(edgeKey(w.x, y, w.x - 1, y)); }
    }
  }
  replaceArray(AMBIENT_SPOTS, L.ambient.filter((s) => isWalkable(s.tile[0], s.tile[1])));
  applyPalette();
  return true;
}
/** 서버 방 id → 현재 레이아웃의 실제 방 id (휴식 방 별칭 풀기) */
export function resolveRoom(roomId) { return LAYOUT_DATA ? resolveIn(LAYOUT_DATA, roomId) : roomId; }
/** 서버 방 id → 라벨 (현재 레이아웃 기준). 모르면 null */
export function roomLabel(roomId) { return LAYOUT_DATA ? roomLabelIn(LAYOUT_DATA, roomId) : null; }

// ---------- 테마 · 층 스타일 ----------
// ACCENT(소품 강조색)·LABEL(방 이름표 색조)은 sprites.js / render.js 가 읽는다.
export let THEME = 'light';
export let STYLE = DEFAULT_PRESET;
export const ACCENT = { leaf: ['#4e9a55', '#5fae6a', '#3f8a49', '#6bbd77'], sofa: '#f28c38', parasol: '#e8785a', wood: '#d9b382', text: '#4a515a' };
export const LABEL = { text: '#4a515a', bg: 'rgba(255,255,255,0.86)', border: '#e4e7ec' };
function applyPalette() {
  const pal = palette(STYLE, THEME);
  for (const r of ROOMS) { const c = pal.rooms[r.id]; if (!c) continue; r.floor = c.floor; r.trim = c.trim; if (r.pattern === 'checker') r.alt = c.alt; }
  Object.assign(CORRIDOR, pal.corridor);
  Object.assign(ACCENT, pal.accent);
  Object.assign(LABEL, pal.label);
}
export function setTheme(theme) {
  THEME = theme === 'dark' ? 'dark' : 'light';
  applyPalette();
}
/** 프리셋 → 레이아웃 id */
export function layoutOfPreset(presetId) { const p = presetById(presetId) || presetById(DEFAULT_PRESET); return LAYOUTS[p.layout] ? p.layout : DEFAULT_LAYOUT; }
/**
 * 층 인테리어 프리셋 교체: 색 + 레이아웃. 돌려주는 값: 0 = 그대로, 1 = 색만 바뀜, 2 = 레이아웃도 바뀜 (호출자가 캐시를 비운다)
 */
export function setFloorStyle(presetId) {
  const id = presetById(presetId) ? presetId : DEFAULT_PRESET;
  const layoutChanged = setLayout(layoutOfPreset(id));
  if (id === STYLE) return layoutChanged ? 2 : 0;
  STYLE = id;
  applyPalette();
  return layoutChanged ? 2 : 1;
}
setLayout(DEFAULT_LAYOUT);

// ---------- 통행 ----------
export function isDoorEdge(x, y, nx, ny) {
  if (x !== nx || Math.abs(y - ny) !== 1) return false;
  const top = Math.max(y, ny);
  return DOORS.some((d) => d.x === x && d.y === top);
}
export function inGrid(x, y) { return x >= GRID.x0 && x <= GRID.x1 && y >= GRID.y0 && y <= GRID.y1; }
export function isWalkable(x, y) { return inGrid(x, y) && !blocked.has(`${x},${y}`); }
export function edgeBlocked(x, y, nx, ny) { return blockedEdges.has(edgeKey(x, y, nx, ny)); }
export function canStep(x, y, nx, ny) { return isWalkable(nx, ny) && !edgeBlocked(x, y, nx, ny); }

export function roomAt(x, y) {
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
  return null;
}
export function roomById(id) { return ROOMS.find((r) => r.id === id) || null; }

// ---------- 투영 ----------
export function project(tx, ty, z = 0) {
  return { x: (tx - ty) * (TW / 2), y: (tx + ty) * (TH / 2) - z * ZH };
}
export function unproject(wx, wy) {
  const a = wx / (TW / 2), b = wy / (TH / 2);
  return { tx: (a + b) / 2, ty: (b - a) / 2 };
}

/** 전체 맵의 월드 좌표 경계 */
export function worldBounds() {
  const pts = [project(GRID.x0, GRID.y0, 2.6), project(GRID.x1 + 1, GRID.y0, 0), project(GRID.x1 + 1, GRID.y1 + 1, 0), project(GRID.x0, GRID.y1 + 1, 0)];
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
