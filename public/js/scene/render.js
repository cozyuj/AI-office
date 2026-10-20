// 장면 렌더: 바닥 → 깊이 정렬된 가구/벽/캐릭터 → (화면 공간) 방 이름표.
import { GRID, ROOMS, CORRIDOR, FURNITURE, WALLS, project, roomAt } from './map.js';
import { tile, drawFurniture, wallPieces, drawWallPiece } from './sprites.js';

// ---------- 바닥 ----------
export function drawFloor(ctx) {
  for (let y = GRID.y0; y <= GRID.y1; y++) {
    for (let x = GRID.x0; x <= GRID.x1; x++) {
      const r = roomAt(x, y) || CORRIDOR;
      tile(ctx, x, y, r.floor, r.trim);
    }
  }
  // 방 외곽선을 조금 더 진하게
  ctx.lineWidth = 1.2;
  for (const r of ROOMS) {
    const a = project(r.x0, r.y0), b = project(r.x1 + 1, r.y0), c = project(r.x1 + 1, r.y1 + 1), d = project(r.x0, r.y1 + 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.stroke();
  }
}

// ---------- 정적 엔티티 (가구 + 벽) ----------
const STATIC = [];
for (const f of FURNITURE) {
  STATIC.push({ key: (f.x + (f.w || 1)) + (f.y + (f.d || 1)), draw: (ctx) => drawFurniture(ctx, f) });
}
for (const w of WALLS) {
  for (const p of wallPieces(w)) {
    // 벽은 얇아서 far corner 만으로는 캐릭터와 순서가 꼬인다. 벽의 "중심선" 기준으로 약간 뒤로.
    const key = w.dir === 'h' ? (p.x + p.w) + (w.y) - 0.5 : (w.x) + (p.y + p.d) - 0.5;
    STATIC.push({ key, draw: (ctx) => drawWallPiece(ctx, p) });
  }
}

/**
 * 가구·벽·캐릭터를 깊이순으로 그린다.
 * actors: [{ key, draw(ctx, now) }]
 */
export function drawEntities(ctx, now, actors = []) {
  const all = actors.length ? STATIC.concat(actors) : STATIC;
  all.sort((a, b) => a.key - b.key);
  for (const e of all) e.draw(ctx, now);
}

// ---------- 방 이름표 (화면 공간) ----------
export function drawLabels(ctx, camera) {
  ctx.save();
  ctx.font = '600 11px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of ROOMS) {
    const p = project(r.x0 + 0.5, r.y0 + 0.5, 0);
    const s = camera.worldToScreen(p.x, p.y);
    const text = r.label;
    const w = ctx.measureText(text).width + 16;
    const x = s.x, y = s.y - 6;
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.strokeStyle = r.trim;
    ctx.lineWidth = 1;
    roundRect(ctx, x - w / 2, y - 10, w, 20, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a515a';
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
