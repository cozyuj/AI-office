// 가구·벽을 코드로 그린다. 외부 이미지 없음. 모든 좌표는 타일 단위, ctx 는 월드 변환이 걸린 상태.
import { project, ZH } from './map.js';

// ---------- 색 유틸 ----------
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

/**
 * 아이소메트릭 상자. 바닥 [x, x+w) × [y, y+d), 높이 z0 ~ z0+h.
 * 보이는 면: 윗면, 왼쪽면(y+d 변), 오른쪽면(x+w 변).
 */
export function box(ctx, x, y, w, d, h, color, { z0 = 0, top, left, right, line = 'rgba(0,0,0,0.12)' } = {}) {
  const A = project(x, y, z0 + h), B = project(x + w, y, z0 + h), C = project(x + w, y + d, z0 + h), D = project(x, y + d, z0 + h);
  const C0 = project(x + w, y + d, z0), D0 = project(x, y + d, z0), B0 = project(x + w, y, z0);
  ctx.lineWidth = 1;
  poly(ctx, [D, C, C0, D0], left || shade(color, 0.82), line);   // 왼쪽(앞) 면
  poly(ctx, [B, C, C0, B0], right || shade(color, 0.66), line);  // 오른쪽 면
  poly(ctx, [A, B, C, D], top || color, line);                    // 윗면
}

/** 바닥 타일 다이아몬드 */
export function tile(ctx, x, y, fill, stroke) {
  poly(ctx, [project(x, y), project(x + 1, y), project(x + 1, y + 1), project(x, y + 1)], fill, stroke);
}

/** 바닥 그림자 (타원) */
export function shadow(ctx, cx, cy, rx = 0.32, ry = 0.16, alpha = 0.18) {
  const p = project(cx, cy);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, rx * 64, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fill();
  ctx.restore();
}

function circleAt(ctx, tx, ty, z, r, fill) {
  const p = project(tx, ty, z);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

// ---------- 가구 ----------
const BOOK = ['#c0504d', '#4f81bd', '#9bbb59', '#f2a541', '#8064a2', '#4bacc6', '#d98c6a', '#5b7a3a'];

const DRAW = {
  shelf(ctx, f) {
    box(ctx, f.x, f.y, 1, 1, 2, '#9a7b55');
    // 앞면(왼쪽면)에 책등 3단
    const seed = f.seed || 0;
    for (let row = 0; row < 3; row++) {
      const z0 = 0.25 + row * 0.6;
      let u = 0.08;
      let i = 0;
      while (u < 0.9) {
        const bw = 0.1 + ((seed * 7 + row * 3 + i) % 3) * 0.04;
        const bh = 0.38 + ((seed + i * 5 + row) % 3) * 0.05;
        const a = project(f.x + u, f.y + 1, z0), b = project(f.x + u + bw, f.y + 1, z0);
        const a2 = project(f.x + u, f.y + 1, z0 + bh), b2 = project(f.x + u + bw, f.y + 1, z0 + bh);
        poly(ctx, [a2, b2, b, a], BOOK[(seed + i * 3 + row) % BOOK.length]);
        u += bw + 0.02; i++;
      }
      // 선반 판
      const s0 = project(f.x, f.y + 1, z0 - 0.04), s1 = project(f.x + 1, f.y + 1, z0 - 0.04), s2 = project(f.x + 1, f.y + 1, z0 + 0.02), s3 = project(f.x, f.y + 1, z0 + 0.02);
      poly(ctx, [s3, s2, s1, s0], '#7d6244');
    }
  },
  desk(ctx, f) {
    box(ctx, f.x + 0.05, f.y + 0.1, 0.9, 0.8, 0.78, '#d9c3a0');
    // 모니터
    box(ctx, f.x + 0.42, f.y + 0.2, 0.16, 0.5, 0.42, '#2f3542', { z0: 0.78 });
    const s0 = project(f.x + 0.58, f.y + 0.2, 0.86), s1 = project(f.x + 0.58, f.y + 0.7, 0.86), s2 = project(f.x + 0.58, f.y + 0.7, 1.16), s3 = project(f.x + 0.58, f.y + 0.2, 1.16);
    poly(ctx, [s0, s1, s2, s3], '#5aa7e6');
    // 키보드
    box(ctx, f.x + 0.68, f.y + 0.3, 0.14, 0.4, 0.03, '#eef0f3', { z0: 0.78 });
  },
  desk2(ctx, f) {
    box(ctx, f.x + 0.05, f.y + 0.1, f.w - 0.1, 0.8, 0.78, '#cdb48f');
    for (const dx of [0.35, 1.05]) {
      box(ctx, f.x + dx, f.y + 0.2, 0.16, 0.5, 0.42, '#2f3542', { z0: 0.78 });
      const x = f.x + dx + 0.16;
      poly(ctx, [project(x, f.y + 0.2, 0.86), project(x, f.y + 0.7, 0.86), project(x, f.y + 0.7, 1.16), project(x, f.y + 0.2, 1.16)], '#7fc8f0');
    }
    box(ctx, f.x + 1.5, f.y + 0.3, 0.14, 0.4, 0.03, '#eef0f3', { z0: 0.78 });
    circleAt(ctx, f.x + 1.8, f.y + 0.75, 0.82, 4, '#e8683a'); // 머그컵
  },
  chair(ctx, f) {
    const cx = f.x + 0.5, cy = f.y + 0.5;
    box(ctx, cx - 0.22, cy - 0.22, 0.44, 0.44, 0.42, '#4a5160', { line: 'rgba(0,0,0,0.2)' });
    const back = { n: [cx - 0.22, cy - 0.3, 0.44, 0.08], s: [cx - 0.22, cy + 0.22, 0.44, 0.08], e: [cx + 0.22, cy - 0.22, 0.08, 0.44], w: [cx - 0.3, cy - 0.22, 0.08, 0.44] }[f.face || 'n'];
    box(ctx, back[0], back[1], back[2], back[3], 0.75, '#3b414d', { line: 'rgba(0,0,0,0.2)' });
  },
  table(ctx, f) {
    box(ctx, f.x + 0.1, f.y + 0.1, f.w - 0.2, f.d - 0.2, 0.72, '#c9a97c');
  },
  coffeetable(ctx, f) {
    box(ctx, f.x + 0.15, f.y + 0.2, f.w - 0.3, f.d - 0.4, 0.38, '#b89a74');
    circleAt(ctx, f.x + 1, f.y + 0.5, 0.42, 4, '#fff');
    circleAt(ctx, f.x + 1.6, f.y + 0.55, 0.42, 4, '#e8683a');
  },
  sofa(ctx, f) {
    box(ctx, f.x + 0.05, f.y + 0.15, f.w - 0.1, 0.8, 0.5, '#5aa0b8');
    box(ctx, f.x + 0.05, f.y + 0.05, f.w - 0.1, 0.25, 0.9, '#4d8ea5');
    box(ctx, f.x + 0.05, f.y + 0.05, 0.18, 0.9, 0.7, '#4d8ea5');
    box(ctx, f.x + f.w - 0.23, f.y + 0.05, 0.18, 0.9, 0.7, '#4d8ea5');
  },
  armchair(ctx, f) {
    box(ctx, f.x + 0.15, f.y + 0.2, 0.7, 0.7, 0.48, '#7a9d6b');
    box(ctx, f.x + 0.15, f.y + 0.12, 0.7, 0.2, 0.85, '#6a8c5c');
  },
  counter(ctx, f) {
    box(ctx, f.x + 0.05, f.y + 0.1, f.w - 0.1, 0.8, 0.9, '#8c8f98');
    box(ctx, f.x + 0.3, f.y + 0.3, 0.45, 0.45, 0.6, '#2f3542', { z0: 0.9 }); // 커피머신
    circleAt(ctx, f.x + 1.3, f.y + 0.5, 0.92, 4, '#fff');
    circleAt(ctx, f.x + 1.6, f.y + 0.6, 0.92, 4, '#fff');
  },
  vending(ctx, f) {
    box(ctx, f.x + 0.12, f.y + 0.12, 0.76, 0.76, 1.8, '#d9534f');
    const p = [project(f.x + 0.2, f.y + 0.88, 0.6), project(f.x + 0.8, f.y + 0.88, 0.6), project(f.x + 0.8, f.y + 0.88, 1.6), project(f.x + 0.2, f.y + 0.88, 1.6)];
    poly(ctx, p, '#a9d6f5');
  },
  rack(ctx, f) {
    box(ctx, f.x + 0.1, f.y + 0.1, 0.8, 0.8, 2.2, '#363b48', { line: 'rgba(0,0,0,0.3)' });
    const t = performance.now() / 1000;
    for (let i = 0; i < 6; i++) {
      const z = 0.3 + i * 0.3;
      const on = Math.sin(t * (1.5 + (f.seed % 5) * 0.3) + i * 1.7 + f.seed) > 0;
      circleAt(ctx, f.x + 0.3, f.y + 0.9, z, 1.6, on ? '#3ddc84' : '#1f5a3a');
      circleAt(ctx, f.x + 0.5, f.y + 0.9, z, 1.6, Math.sin(t * 2.3 + i + f.seed) > 0.3 ? '#ffb347' : '#5a4420');
      const s = project(f.x + 0.6, f.y + 0.9, z), e = project(f.x + 0.88, f.y + 0.9, z);
      ctx.strokeStyle = '#4b5162'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
  },
  ac(ctx, f) {
    box(ctx, f.x + 0.1, f.y + 0.1, 0.8, 0.8, 1.9, '#c7ccd6');
  },
  wallscreen(ctx, f) {
    box(ctx, f.x + 0.1, f.y + 0.05, f.w - 0.2, 0.12, 1.3, '#1f2430', { z0: 0.7 });
    const y = f.y + 0.17;
    poly(ctx, [project(f.x + 0.16, y, 0.78), project(f.x + f.w - 0.16, y, 0.78), project(f.x + f.w - 0.16, y, 1.92), project(f.x + 0.16, y, 1.92)], '#2d6ca8');
    // 그래프 느낌
    ctx.strokeStyle = '#9fd3ff'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const p = project(f.x + 0.3 + i * (f.w - 0.6) / 6, y, 1.0 + 0.5 * Math.abs(Math.sin(i * 1.3 + f.x)));
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
  },
  globe(ctx, f) {
    box(ctx, f.x + 0.35, f.y + 0.35, 0.3, 0.3, 0.6, '#8a7250');
    const p = project(f.x + 0.5, f.y + 0.5, 1.05);
    const g = ctx.createRadialGradient(p.x - 4, p.y - 4, 2, p.x, p.y, 12);
    g.addColorStop(0, '#9fd0ff'); g.addColorStop(1, '#2d6ca8');
    ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = '#5fae6a'; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y - 2, 5, 3, 0.5, 0, Math.PI * 2); ctx.fill();
  },
  whiteboard(ctx, f) {
    box(ctx, f.x + 0.05, f.y + 0.1, 0.12, f.d - 0.2, 1.4, '#9aa0aa', { z0: 0.6 });
    const x = f.x + 0.17;
    poly(ctx, [project(x, f.y + 0.2, 0.7), project(x, f.y + f.d - 0.2, 0.7), project(x, f.y + f.d - 0.2, 1.9), project(x, f.y + 0.2, 1.9)], '#fbfbfc', 'rgba(0,0,0,0.15)');
    ctx.strokeStyle = '#e8683a'; ctx.lineWidth = 1.2; ctx.beginPath();
    const a = project(x, f.y + 0.4, 1.6), b = project(x, f.y + 1.4, 1.3), c = project(x, f.y + 2.4, 1.5);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.strokeStyle = '#3b6fd6'; ctx.beginPath();
    const d = project(x, f.y + 0.4, 1.1), e = project(x, f.y + 2.4, 1.0);
    ctx.moveTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.stroke();
  },
  plant(ctx, f) {
    box(ctx, f.x + 0.32, f.y + 0.32, 0.36, 0.36, 0.42, '#b86b4b');
    const cx = f.x + 0.5, cy = f.y + 0.5;
    const leaves = [[0, 0, 1.0, 11], [-0.12, 0.08, 0.85, 8], [0.12, 0.1, 0.9, 8], [0.02, -0.1, 1.15, 7]];
    for (const [dx, dy, z, r] of leaves) circleAt(ctx, cx + dx, cy + dy, z, r, ['#4e9a55', '#5fae6a', '#3f8a49', '#6bbd77'][Math.round(z * 10) % 4]);
  },
  cabinet(ctx, f) {
    box(ctx, f.x + 0.1, f.y + 0.1, 0.8, 0.8, 1.0, '#b9bec9');
  },
  reception(ctx, f) {
    box(ctx, f.x + 0.05, f.y + 0.15, f.w - 0.1, 0.7, 0.95, '#e8e2d4');
    box(ctx, f.x + 0.05, f.y + 0.15, f.w - 0.1, 0.7, 0.05, '#c8b89a', { z0: 0.95 });
    circleAt(ctx, f.x + 0.6, f.y + 0.5, 1.0, 5, '#5fae6a');
  },
  sign(ctx, f) {
    box(ctx, f.x + 0.42, f.y + 0.42, 0.16, 0.16, 0.9, '#8a8f99');
    box(ctx, f.x + 0.2, f.y + 0.44, 0.6, 0.12, 0.5, '#2f3542', { z0: 0.9 });
  },
  bench(ctx, f) {
    box(ctx, f.x + 0.1, f.y + 0.3, f.w - 0.2, 0.4, 0.45, '#a88a63');
  },
  elevator(ctx, f) {
    box(ctx, f.x, f.y, 1, 0.5, 2.3, '#b9bec9');
    // 문 (왼쪽면 = y+0.5 변)
    const y = f.y + 0.5;
    const q = (x0, x1, c) => poly(ctx, [project(x0, y, 0.02), project(x1, y, 0.02), project(x1, y, 2.0), project(x0, y, 2.0)], c, 'rgba(0,0,0,0.25)');
    q(f.x + 0.08, f.x + 0.48, '#8ea0b5');
    q(f.x + 0.52, f.x + 0.92, '#8ea0b5');
    // 층 표시등
    const t = Math.floor(performance.now() / 700) % 2;
    circleAt(ctx, f.x + 0.5, y, 2.15, 2.5, t ? '#ffb347' : '#e8683a');
  },
};

export function drawFurniture(ctx, f) {
  const fn = DRAW[f.type];
  if (fn) fn(ctx, f);
  else box(ctx, f.x, f.y, f.w || 1, f.d || 1, 0.8, '#cccccc');
}

/** 벽 조각: 문 구멍을 비우고 1타일 단위로 쪼갠다 (깊이 정렬 정확도를 위해) */
export function wallPieces(w) {
  const th = w.outer ? 0.22 : 0.14;
  const out = [];
  for (let i = 0; i < w.len; i++) {
    if (w.doors.includes(i)) continue;
    const first = i === 0 || w.doors.includes(i - 1);
    const last = i === w.len - 1 || w.doors.includes(i + 1);
    out.push(w.dir === 'h'
      ? { wall: w, x: w.x + i, y: w.y - th / 2, w: 1, d: th, h: w.h, first, last }
      : { wall: w, x: w.x - th / 2, y: w.y + i, w: th, d: 1, h: w.h, first, last });
  }
  return out;
}

export function drawWallPiece(ctx, p) {
  const color = p.wall.outer ? '#e6e3dc' : '#d6dbe3';
  // 조각 사이 이음새가 보이지 않도록 외곽선 없이 면만 그린다
  box(ctx, p.x, p.y, p.w, p.d, p.h, color, { top: shade(color, 1.04), line: null });
}

/** 호환용: 통짜 벽 그리기 (디버그) */
export function drawWall(ctx, w) { for (const p of wallPieces(w)) drawWallPiece(ctx, p); }

export { ZH };
