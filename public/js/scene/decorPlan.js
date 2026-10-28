// 테마 층(FE-60) 소품 배치. 순수 모듈 — 레이아웃 데이터만 보고 어디에 무엇을 놓을지 정한다 (그리기는 decor.js).
// 서 있는 자리·명소·문 앞은 비우고, 방 구석·뒷벽 쪽부터 채운다. solid 소품(트리·벽난로·솥·풀장·선베드)은 map.js 가
// 길이 막히지 않는지 확인한 뒤에만 막는다. 벽 소품은 키 큰 바깥벽(맨 위 줄·맨 왼쪽)에 닿은 방에만 건다.

// hero: 층마다 하나 (HERO_ROOMS 중 앞의 방), feature: 바깥벽에 붙이는 큰 것 하나, big: 2×2 하나 (야외 방 우선)
export const DECOR_SETS = {
  halloween: { hero: 'cauldron', floor: ['pumpkin', 'candles', 'ghost', 'pumpkins', 'tombstone'], outdoor: ['tombstone', 'pumpkins', 'tombstone', 'ghost'], wall: ['cobweb', 'hbunting'], air: 'bat' },
  christmas: { hero: 'xmastree', feature: 'fireplace', floor: ['gifts', 'snowman', 'gifts', 'candles'], outdoor: ['snowman', 'xmastree', 'gifts', 'snowman'], wall: ['wreath', 'xlights'] },
  summer: { hero: 'beachumbrella', big: 'pool', floor: ['beachball', 'lounger', 'floatring', 'cooler'], outdoor: ['lounger', 'beachumbrella', 'beachball', 'lounger'], wall: ['bunting', 'lifebuoy'], lean: 'surfboard' },
};
export const SOLID_DECOR = new Set(['xmastree', 'fireplace', 'cauldron', 'pool', 'lounger']);
const HERO_ROOMS = ['lobby', 'lounge', 'cafe', 'canteen', 'game', 'booklounge'];

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/**
 * 테마 → 소품 목록. data: { rooms, walls, slots, ambient, restSpots, userSeat, spawn, isWalkable, grid }
 * 반환: [{ type, x, y, w?, d?, seed, kind: 'floor'|'wall'|'air', dir?, len?, solid? }] (타일 좌표)
 */
export function planDecor(theme, data) {
  const set = DECOR_SETS[theme];
  if (!set) return [];
  const { rooms, walls, slots = {}, ambient = [], restSpots = {}, isWalkable, grid } = data;
  const key = (x, y) => `${x},${y}`;
  const reserved = new Set();
  for (const list of Object.values(slots)) for (const [x, y] of list) reserved.add(key(x, y));
  for (const s of ambient) reserved.add(key(s.tile[0], s.tile[1]));
  for (const list of Object.values(restSpots)) for (const s of list) reserved.add(key(s.tile[0], s.tile[1]));
  for (const p of [data.userSeat, data.spawn]) if (p) reserved.add(key(p.x, p.y));
  for (const w of walls) for (const i of w.doors) {   // 문 앞: 문 구멍 양쪽 타일과 그 옆
    for (const d of [-1, 0, 1]) {
      if (w.dir === 'h') { reserved.add(key(w.x + i + d, w.y)); reserved.add(key(w.x + i + d, w.y - 1)); }
      else { reserved.add(key(w.x, w.y + i + d)); reserved.add(key(w.x - 1, w.y + i + d)); }
    }
  }
  const free = (x, y) => isWalkable(x, y) && !reserved.has(key(x, y));
  const take = (x, y, w = 1, d = 1) => { for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) reserved.add(key(x + i, y + j)); };
  const out = [];
  const inRoom = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const rest = rooms.filter((r) => r.id !== 'elevator');
  const heroRoom = HERO_ROOMS.map((id) => rest.find((r) => r.id === id)).find(Boolean) || rest[0];

  // 2×2 큰 것 (풀장): 야외 방 → 히어로 방 순으로 빈 2×2 자리
  if (set.big) {
    for (const r of [...rest.filter((r) => r.outdoor), heroRoom]) {
      let spot = null;
      for (let y = r.y0 + 1; y < r.y1 && !spot; y++) for (let x = r.x0 + 1; x < r.x1 && !spot; x++) {
        if ([[0, 0], [1, 0], [0, 1], [1, 1]].every(([i, j]) => inRoom(r, x + i, y + j) && free(x + i, y + j))) spot = { x, y };
      }
      if (spot) { out.push({ type: set.big, x: spot.x, y: spot.y, w: 2, d: 2, seed: 0, kind: 'floor', solid: true }); take(spot.x, spot.y, 2, 2); break; }
    }
  }
  // 바깥벽에 붙이는 큰 것 (벽난로): 바깥 뒷벽에 닿은 실내 방에서 빈 두 칸
  if (set.feature) {
    const order = [heroRoom, ...rest].filter((r, i, a) => !r.outdoor && a.indexOf(r) === i);
    for (const r of order) {
      let spot = null;
      if (r.y0 === grid.y0) for (let x = r.x0 + 1; x < r.x1 && !spot; x++) if (free(x, r.y0) && free(x + 1, r.y0)) spot = { x, y: r.y0, w: 2, d: 1, dir: 'h' };
      if (!spot && r.x0 === grid.x0) for (let y = r.y0 + 1; y < r.y1 && !spot; y++) if (free(r.x0, y) && free(r.x0, y + 1)) spot = { x: r.x0, y, w: 1, d: 2, dir: 'v' };
      if (spot) { out.push({ type: set.feature, ...spot, seed: 0, kind: 'floor', solid: true }); take(spot.x, spot.y, spot.w, spot.d); break; }
    }
  }

  for (const r of rest) {
    const h = hash(`${theme}:${r.id}`);
    const area = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    const n = r.outdoor ? 4 : area >= 48 ? 3 : 2;
    // 후보: 구석 → 뒷벽 쪽 가장자리 → 나머지 가장자리 순
    const tiles = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (!free(x, y)) continue;
      const corner = (x === r.x0 || x === r.x1) && (y === r.y0 || y === r.y1);
      const back = x === r.x0 || y === r.y0;
      if (!back && x !== r.x1 && y !== r.y1) continue;
      tiles.push({ x, y, back, rank: (corner ? 0 : back ? 1 : 2) * 1000 + ((x * 7 + y * 13 + h) % 97) });
    }
    tiles.sort((a, b) => a.rank - b.rank);
    const types = r.outdoor ? set.outdoor : set.floor;
    const picked = [];
    for (const t of tiles) {
      if (picked.length >= n) break;
      if (picked.some((p) => Math.max(Math.abs(p.x - t.x), Math.abs(p.y - t.y)) < 2)) continue;
      picked.push(t);
    }
    picked.forEach((t, i) => {
      const type = r === heroRoom && i === 0 ? set.hero : types[(h + i) % types.length];
      out.push({ type, x: t.x, y: t.y, seed: (h + i * 31) % 7, kind: 'floor', solid: SOLID_DECOR.has(type) });
      take(t.x, t.y);
    });
    // 벽에 기대 세운 것 (서핑보드): 뒷벽 쪽 빈 타일 하나
    if (set.lean && !r.outdoor && (r.y0 === grid.y0 || area >= 48)) {
      const t = tiles.find((t) => t.back && free(t.x, t.y) && !picked.includes(t));
      if (t) { out.push({ type: set.lean, x: t.x, y: t.y, seed: h % 3, kind: 'floor', dir: t.y === r.y0 ? 'h' : 'v' }); take(t.x, t.y); }
    }
    // 벽 소품: 키 큰 바깥벽에 닿은 실내 방
    if (!r.outdoor && set.wall) {
      const along = r.y0 === grid.y0 ? 'h' : r.x0 === grid.x0 ? 'v' : null;
      if (along) {
        const len = along === 'h' ? r.x1 - r.x0 + 1 : r.y1 - r.y0 + 1;
        for (const w of set.wall) {
          const mid = Math.floor(len / 2) - 1 + (h % 2);
          if (w === 'cobweb') out.push({ type: w, x: r.x0, y: r.y0, seed: h % 3, kind: 'wall', dir: along });
          else if (w === 'wreath' || w === 'lifebuoy') out.push({ type: w, x: along === 'h' ? r.x0 + mid : r.x0, y: along === 'h' ? r.y0 : r.y0 + mid, seed: 0, kind: 'wall', dir: along });
          else out.push({ type: w, x: r.x0, y: r.y0, len, seed: h % 5, kind: 'wall', dir: along });
        }
      }
    }
    // 하늘을 나는 것 (할로윈 박쥐): 넓은 실내 방에 하나씩
    if (set.air && !r.outdoor && area >= 48) {
      out.push({ type: set.air, x: r.x0 + 2 + (h % Math.max(1, r.x1 - r.x0 - 3)), y: r.y0 + 1 + ((h >>> 4) % Math.max(1, r.y1 - r.y0 - 2)), seed: h % 11, kind: 'air' });
    }
  }
  return out;
}
