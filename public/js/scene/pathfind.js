// 타일 A* (4방향). 벽 edge 와 solid 가구를 피한다. 시작 타일은 결과에 포함하지 않는다.
import { GRID, canStep, isWalkable } from './map.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const W = GRID.x1 + 2;
const idx = (x, y) => y * W + x;

export function findPath(sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [];
  if (!isWalkable(tx, ty)) return null;
  const open = [idx(sx, sy)];
  const came = new Map();
  const g = new Map([[idx(sx, sy), 0]]);
  const f = new Map([[idx(sx, sy), Math.abs(sx - tx) + Math.abs(sy - ty)]]);
  const closed = new Set();
  while (open.length) {
    // 가장 작은 f 를 꺼낸다 (격자가 작아 선형 탐색으로 충분)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if ((f.get(open[i]) ?? Infinity) < (f.get(open[bi]) ?? Infinity)) bi = i;
    const cur = open.splice(bi, 1)[0];
    const cx = cur % W, cy = Math.floor(cur / W);
    if (cx === tx && cy === ty) {
      const path = [];
      let k = cur;
      while (k !== idx(sx, sy)) { path.push([k % W, Math.floor(k / W)]); k = came.get(k); }
      return path.reverse();
    }
    closed.add(cur);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!canStep(cx, cy, nx, ny)) continue;
      const nk = idx(nx, ny);
      if (closed.has(nk)) continue;
      const ng = g.get(cur) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        came.set(nk, cur);
        g.set(nk, ng);
        f.set(nk, ng + Math.abs(nx - tx) + Math.abs(ny - ty));
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  return null;
}

/** 가장 가까운 통행 가능 타일 (갇혔을 때 탈출용) */
export function nearestWalkable(x, y) {
  if (isWalkable(x, y)) return [x, y];
  for (let r = 1; r < 6; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      if (isWalkable(x + dx, y + dy)) return [x + dx, y + dy];
    }
  }
  return [x, y];
}
