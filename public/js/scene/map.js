// 사무실 맵 정의: 타일 격자, 방, 가구, 벽, 서 있는 자리(slot), 통행 규칙, 투영.
// 유효 타일은 x 1..35, y 1..21. (x 28~35 는 카페·테라스 확장 열) x 가 커지면 화면 오른쪽 아래, y 가 커지면 왼쪽 아래.

import { palette, presetById, DEFAULT_PRESET } from './floorStyle.js';

export const TW = 64;  // 타일 가로 (월드 px)
export const TH = 32;  // 타일 세로
export const ZH = 26;  // 높이 1 단위

export const GRID = { x0: 1, y0: 1, x1: 35, y1: 21 }; // inclusive

export const ROOMS = [
  { id: 'library',  label: '자료실',     x0: 1,  y0: 1,  x1: 8,  y1: 7,  floor: '#ead6b4', trim: null,      pattern: 'wood' },
  { id: 'dev',      label: '개발실',     x0: 10, y0: 1,  x1: 17, y1: 7,  floor: '#f7f8fa', trim: '#e6e9ee', pattern: 'grid' },
  { id: 'research', label: '정보검색실', x0: 19, y0: 1,  x1: 26, y1: 7,  floor: '#eef5f3', trim: '#dbe7e2', pattern: 'grid' },
  { id: 'meeting',  label: '회의실',     x0: 1,  y0: 10, x1: 8,  y1: 15, floor: '#f5f3ef', trim: '#e6e2da', pattern: 'grid' },
  { id: 'lounge',   label: '휴게실',     x0: 10, y0: 10, x1: 17, y1: 15, floor: '#f9ecdf', trim: '#efdcc8', pattern: 'checker', alt: '#f2e0cf' },
  { id: 'server',   label: '서버실',     x0: 19, y0: 10, x1: 26, y1: 15, floor: '#ddefe7', trim: '#c9e2d6', pattern: 'grid' },
  { id: 'mydesk',   label: '내 자리',    x0: 1,  y0: 18, x1: 8,  y1: 21, floor: '#e1ebf7', trim: '#cfdcee', pattern: 'grid' },
  { id: 'lobby',    label: '로비',       x0: 10, y0: 18, x1: 17, y1: 21, floor: '#f4f5f7', trim: '#e4e7ec', pattern: 'grid' },
  { id: 'elevator', label: '엘리베이터', x0: 19, y0: 18, x1: 26, y1: 21, floor: '#eceef2', trim: '#dadde4', pattern: 'grid' },
  { id: 'cafe',     label: '카페',       x0: 28, y0: 1,  x1: 35, y1: 7,  floor: '#f8efe4', trim: '#eadbc7', pattern: 'checker', alt: '#f1e4d3' },
  { id: 'terrace',  label: '테라스',     x0: 28, y0: 10, x1: 35, y1: 21, floor: '#dcc39f', trim: '#c9ad85', pattern: 'deck' },
];
export const CORRIDOR = { floor: '#f5f6f8', trim: '#e6e8ec', pattern: 'grid' };

// ---------- 테마 · 층 스타일 ----------
// 색은 floorStyle.js 의 프리셋(층별 인테리어) + 테마(라이트/다크)로 정해진다. 위 ROOMS 의 색은 초기값일 뿐이고
// applyPalette() 가 덮어쓴다. ACCENT(소품 강조색)·LABEL(방 이름표 색조)은 sprites.js / render.js 가 읽는다.
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
/** 층 인테리어 프리셋 교체. 실제로 바뀌었으면 true (호출자가 캐시를 비운다) */
export function setFloorStyle(presetId) {
  const id = presetById(presetId) ? presetId : DEFAULT_PRESET;
  if (id === STYLE) return false;
  STYLE = id;
  applyPalette();
  return true;
}
applyPalette();

// ---------- 가구 ----------
// { type, x, y, w, d, solid(기본 true) } 좌표는 타일 단위. 캐릭터는 solid 타일을 지나지 못한다.
const F = [];
const add = (type, x, y, extra = {}) => F.push({ type, x, y, w: 1, d: 1, ...extra });

// 자료실
for (let x = 1; x <= 8; x++) add('shelf', x, 1, { seed: x });
for (let x = 2; x <= 7; x++) add('shelf', x, 4, { seed: x + 10 });
add('roundtable', 3, 6, { w: 2, d: 1 });
add('chair', 3, 7, { solid: false, face: 'n' });
add('chair', 4, 7, { solid: false, face: 'n' });
add('plant', 8, 7);
// 개발실
for (const [x, y] of [[11, 2], [13, 2], [15, 2], [11, 5], [13, 5], [15, 5]]) {
  add('desk', x, y);
  add('chair', x, y + 1, { solid: false, face: 'n' });
}
add('plant', 17, 1);
add('cabinet', 17, 7);
add('plant', 10, 7);
// 정보검색실
add('wallscreen', 20, 1, { w: 2 });
add('wallscreen', 23, 1, { w: 2 });
add('globe', 26, 1);
add('desk', 21, 4);
add('chair', 21, 5, { solid: false, face: 'n' });
add('desk', 24, 4);
add('chair', 24, 5, { solid: false, face: 'n' });
add('plant', 19, 7);
// 회의실
add('whiteboard', 1, 11, { d: 3 });
add('table', 3, 12, { w: 4, d: 2 });
for (let x = 3; x <= 6; x++) { add('chair', x, 11, { solid: false, face: 's' }); add('chair', x, 14, { solid: false, face: 'n' }); }
for (const y of [12, 13]) { add('chair', 2, y, { solid: false, face: 'e' }); add('chair', 7, y, { solid: false, face: 'w' }); }
add('plant', 8, 15);
// 휴게실
add('sofa', 11, 11, { w: 3 });
add('coffeetable', 11, 13, { w: 3 });
add('armchair', 15, 11);
add('armchair', 15, 13);
add('counter', 16, 10, { w: 2 });
add('vending', 17, 14);
add('plant', 10, 10);
add('plant', 10, 15);
// 서버실
for (let x = 20; x <= 25; x++) { add('rack', x, 11, { seed: x }); add('rack', x, 14, { seed: x + 7 }); }
add('ac', 26, 10);
// 내 자리
add('desk2', 3, 19, { w: 2 });
add('chair', 4, 20, { solid: false, face: 'n' });
add('plant', 1, 21);
add('cabinet', 8, 18);
add('plant', 8, 21);
// 로비
add('reception', 12, 19, { w: 3 });
add('sign', 17, 20);
add('plant', 10, 18);
add('plant', 17, 18);
add('plant', 10, 21);
// 엘리베이터 (문이 화면 쪽을 보도록 위쪽 벽에 붙인다)
add('elevator', 24, 18);
add('elevator', 25, 18);
add('bench', 20, 19, { w: 2 });
add('plant', 19, 21);
add('plant', 26, 21);
// 카페 (북쪽 외벽에 창문)
add('counter', 28, 2, { w: 3 });
add('coffeemachine', 31, 2);
for (const x of [28, 29, 30]) add('stool', x, 3, { solid: false });
add('cafetable', 29, 5); add('armchair', 29, 6, { face: 'n' }); add('armchair', 30, 5, { face: 'w' });
add('cafetable', 32, 5); add('armchair', 32, 6, { face: 'n' }); add('armchair', 33, 5, { face: 'w' });
add('cafetable', 34, 3); add('armchair', 34, 4, { face: 'n' });
add('plant', 35, 7);
add('plant', 28, 7);
// 테라스 (바깥: 데크 바닥, 난간, 파라솔)
add('planter', 28, 10, { w: 3 });
add('parasol', 30, 12, { w: 2, d: 2 });
add('parasol', 33, 16, { w: 2, d: 2 });
add('bench', 29, 19, { w: 2 });
add('bench', 32, 19, { w: 2 });
add('plant', 35, 10, { seed: 1 });
add('plant', 35, 21, { seed: 1 });
add('plant', 28, 21, { seed: 1 });
add('plant', 28, 15);

export const FURNITURE = F;

// ---------- 벽 ----------
// h: 타일 (x..x+len-1, y) 의 윗변. (x, y-1) ↔ (x, y) 이동을 막는다.
// v: 타일 (x, y..y+len-1) 의 왼변. (x-1, y) ↔ (x, y) 이동을 막는다.
// doors: 막지 않는 offset 목록. h 는 높이.
const W = [];
W.push({ dir: 'h', x: 1, y: 1, len: 35, doors: [], h: 1.6, outer: true, windows: [28, 29, 30, 31, 32, 33] }); // 카페 구간은 유리창
W.push({ dir: 'v', x: 1, y: 1, len: 21, doors: [], h: 1.6, outer: true });
for (const y of [8, 10, 16, 18]) {
  for (const x of [1, 10, 19]) W.push({ dir: 'h', x, y, len: 8, doors: [3, 4], h: 0.6 });
}
// 세로 칸막이: 방의 서쪽(x=10, 19)과 동쪽(x=9, 18). 방은 복도 쪽 가로 벽의 문으로만 드나든다.
for (const x of [9, 10, 18, 19, 27]) {
  W.push({ dir: 'v', x, y: 1, len: 7, doors: [], h: 0.6 });
  W.push({ dir: 'v', x, y: 10, len: 6, doors: [], h: 0.6 });
  W.push({ dir: 'v', x, y: 18, len: 4, doors: [], h: 0.6 });
}
// 확장 열(x 28~35): 카페는 남쪽 벽 문으로, 테라스는 북쪽 벽 문으로 드나든다
W.push({ dir: 'h', x: 28, y: 8, len: 8, doors: [3, 4], h: 0.6 });
W.push({ dir: 'h', x: 28, y: 10, len: 8, doors: [3, 4], h: 0.6 });
W.push({ dir: 'v', x: 28, y: 1, len: 7, doors: [], h: 0.6 });
W.push({ dir: 'v', x: 28, y: 10, len: 12, doors: [], h: 0.6 });
// 테라스 난간 (동·남쪽 가장자리, 격자 밖이라 통행에는 영향 없음)
W.push({ dir: 'v', x: 36, y: 10, len: 12, doors: [], h: 0.5, rail: true });
W.push({ dir: 'h', x: 28, y: 22, len: 8, doors: [], h: 0.5, rail: true });
export const WALLS = W;

// 문: 가로 벽의 구멍. { x, y } 는 벽이 놓인 타일 (x, y) 의 윗변, 즉 (x, y-1) ↔ (x, y) 사이가 열려 있다.
export const DOORS = [];
for (const w of WALLS) {
  if (w.dir !== 'h') continue;
  for (const off of w.doors) DOORS.push({ x: w.x + off, y: w.y, first: !w.doors.includes(off - 1), last: !w.doors.includes(off + 1) });
}
export function isDoorEdge(x, y, nx, ny) {
  if (x !== nx || Math.abs(y - ny) !== 1) return false;
  const top = Math.max(y, ny);
  return DOORS.some((d) => d.x === x && d.y === top);
}

// ---------- 서 있는 자리 ----------
export const SLOTS = {
  library:  [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [3, 7], [4, 7]],
  dev:      [[11, 3], [13, 3], [15, 3], [11, 6], [13, 6], [15, 6], [16, 3], [16, 6], [12, 7], [14, 7]],
  research: [[20, 2], [21, 2], [23, 2], [24, 2], [21, 5], [24, 5], [22, 6], [25, 6], [26, 3], [19, 3]],
  meeting:  [[3, 11], [4, 11], [5, 11], [6, 11], [3, 14], [4, 14], [5, 14], [6, 14], [2, 12], [2, 13], [7, 12], [7, 13], [8, 11], [8, 13]],
  lounge:   [[11, 12], [12, 12], [13, 12], [14, 12], [15, 12], [12, 14], [14, 14], [16, 12], [16, 14], [13, 15]],
  server:   [[20, 12], [21, 12], [22, 12], [23, 12], [24, 12], [25, 12], [20, 15], [21, 15], [22, 15], [23, 15], [24, 15], [25, 15]],
  mydesk:   [[6, 19], [6, 20], [2, 20], [5, 21], [7, 20], [2, 19]],
  lobby:    [[11, 20], [13, 20], [15, 20], [12, 21], [14, 21]],
  elevator: [[24, 19], [25, 19], [23, 19], [26, 19], [24, 20], [25, 20], [22, 19]],
  cafe:     [[28, 4], [31, 4], [31, 6], [33, 7], [30, 7], [35, 5], [34, 6], [28, 6]],
  terrace:  [[29, 11], [33, 11], [29, 13], [33, 13], [29, 16], [32, 15], [31, 19], [34, 20], [29, 21], [33, 21]],
};
export const USER_SEAT = { x: 5, y: 20 };  // 의자(4,20) 옆에 서 있어 캐릭터가 가려지지 않게
export const SPAWN = { x: 24, y: 19 };   // 서브에이전트 등장/퇴장 지점 (엘리베이터 앞)

// ---------- 통행 ----------
const blocked = new Set();
for (const f of FURNITURE) {
  if (f.solid === false) continue;
  for (let x = f.x; x < f.x + (f.w || 1); x++) for (let y = f.y; y < f.y + (f.d || 1); y++) blocked.add(`${x},${y}`);
}
const blockedEdges = new Set();
const edgeKey = (x, y, nx, ny) => `${x},${y}>${nx},${ny}`;
for (const w of WALLS) {
  for (let i = 0; i < w.len; i++) {
    if (w.doors.includes(i)) continue;
    if (w.dir === 'h') { const x = w.x + i; blockedEdges.add(edgeKey(x, w.y - 1, x, w.y)); blockedEdges.add(edgeKey(x, w.y, x, w.y - 1)); }
    else { const y = w.y + i; blockedEdges.add(edgeKey(w.x - 1, y, w.x, y)); blockedEdges.add(edgeKey(w.x, y, w.x - 1, y)); }
  }
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
