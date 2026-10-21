// 가구·벽을 코드로 그린다 — 플랫 벡터 아이소메트릭 스타일. 외부 이미지 없음.
// 좌표는 타일 단위, ctx 는 월드 변환이 걸린 상태.
import { project, ZH, ACCENT } from './map.js';
import { palette as daylight } from './daylight.js';

export const FONT = "'D2Coding','NanumSquare',-apple-system,'Apple SD Gothic Neo',sans-serif";
const labels = { me: 'me' };
export function setLabels(v) { Object.assign(labels, v); }

// ---------- 색 유틸 ----------
export function shade(hex, f) {
  if (!hex || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.min(255, Math.max(0, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

/** 아이소메트릭 상자. 바닥 [x, x+w) × [y, y+d), 높이 z0 ~ z0+h. 보이는 면: 윗면, 왼쪽(y+d 변), 오른쪽(x+w 변) */
export function box(ctx, x, y, w, d, h, color, { z0 = 0, top, left, right, line = null } = {}) {
  const A = project(x, y, z0 + h), B = project(x + w, y, z0 + h), C = project(x + w, y + d, z0 + h), D = project(x, y + d, z0 + h);
  const C0 = project(x + w, y + d, z0), D0 = project(x, y + d, z0), B0 = project(x + w, y, z0);
  poly(ctx, [D, C, C0, D0], left || shade(color, 0.86), line);
  poly(ctx, [B, C, C0, B0], right || shade(color, 0.74), line);
  poly(ctx, [A, B, C, D], top || color, line);
}

/** 바닥 타일 다이아몬드 */
export function tile(ctx, x, y, fill, stroke) {
  poly(ctx, [project(x, y), project(x + 1, y), project(x + 1, y + 1), project(x, y + 1)], fill, stroke);
}

/** 바닥 그림자 (부드러운 타원) */
export function shadow(ctx, cx, cy, rx = 0.34, ry = 0.17, alpha = 0.16) {
  const p = project(cx, cy);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, rx * 64);
  g.addColorStop(0, `rgba(40,40,60,${alpha})`);
  g.addColorStop(1, 'rgba(40,40,60,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, rx * 64, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function circle(ctx, tx, ty, z, r, fill) {
  const p = project(tx, ty, z);
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}
function ellipse(ctx, tx, ty, z, rx, ry, fill) {
  const p = project(tx, ty, z);
  ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}
function faceY(ctx, x0, x1, y, z0, z1, fill) { poly(ctx, [project(x0, y, z0), project(x1, y, z0), project(x1, y, z1), project(x0, y, z1)], fill); }
function faceX(ctx, x, y0, y1, z0, z1, fill) { poly(ctx, [project(x, y0, z0), project(x, y1, z0), project(x, y1, z1), project(x, y0, z1)], fill); }
function post(ctx, x, y, h, color) { box(ctx, x - 0.04, y - 0.04, 0.08, 0.08, h, color); }

// ---------- 팔레트 ----------
const CREAM = { top: '#f6f2ea', left: '#ece6da', right: '#ddd6c8' };
// 층 스타일(FE-34)에 따라 바뀌는 강조색은 map.js 의 ACCENT 에서 매번 읽는다: 목재(테이블·벤치), 식물 잎, 소파·카페 의자, 파라솔.
const WOOD = () => ACCENT.wood;
const LEAF = () => ACCENT.leaf;
const SOFA = () => ACCENT.sofa;
const DARK = '#2b2f3a';
const PURPLE = '#7d5fcf';
const BOOK = ['#e76f51', '#f4a261', '#2a9d8f', '#264653', '#8ab17d', '#e9c46a', '#6d597a', '#457b9d', '#d1495b'];

// ---------- 부품 ----------
function monitor(ctx, mx, my) {
  box(ctx, mx - 0.06, my + 0.02, 0.12, 0.12, 0.14, '#3a3f4b', { z0: 0.78 });
  box(ctx, mx - 0.3, my, 0.6, 0.06, 0.44, DARK, { z0: 0.92 });
  faceY(ctx, mx - 0.27, mx + 0.27, my + 0.07, 1.0, 1.33, '#5fb4ff');
  faceY(ctx, mx - 0.27, mx + 0.27, my + 0.07, 1.2, 1.33, 'rgba(255,255,255,0.25)');
}
function keyboard(ctx, mx, my) { box(ctx, mx - 0.22, my, 0.44, 0.16, 0.03, '#eef0f3', { z0: 0.78 }); }
function laptop(ctx, lx, ly) {
  box(ctx, lx, ly, 0.5, 0.35, 0.03, '#d9dce2', { z0: 0.78 });
  box(ctx, lx, ly, 0.5, 0.04, 0.3, DARK, { z0: 0.81 });
  faceY(ctx, lx + 0.02, lx + 0.48, ly + 0.05, 0.86, 1.08, '#9fd3ff');
}
function legs(ctx, pts, h, color = '#d9dce2') { for (const [lx, ly] of pts) box(ctx, lx, ly, 0.08, 0.08, h, color); }

function palm(ctx, cx, cy, big) {
  shadow(ctx, cx, cy, 0.3, 0.15, 0.14);
  box(ctx, cx - 0.17, cy - 0.17, 0.34, 0.34, 0.32, '#f1ece2', { left: '#e4dccd', right: '#d6ccba' });
  ellipse(ctx, cx, cy, 0.32, 9, 4.5, '#8b6a4a');
  const z = big ? 1.25 : 0.75;
  if (big) {
    ctx.strokeStyle = '#b58b5a'; ctx.lineWidth = 3;
    const a = project(cx, cy, 0.3), b = project(cx, cy, z);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  const top = project(cx, cy, z);
  const n = big ? 9 : 7;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + (big ? 0.3 : 0);
    const len = (big ? 46 : 30) * (0.85 + ((i * 7) % 3) * 0.1);
    const dx = Math.cos(a), dy = Math.sin(a) * 0.55;
    const tip = { x: top.x + dx * len, y: top.y + dy * len + (big ? 10 : 6) };
    const nx = -dy, ny = dx, wdt = big ? 9 : 7;
    ctx.beginPath(); ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(top.x + dx * len * 0.5 + nx * wdt, top.y + dy * len * 0.5 + ny * wdt, tip.x, tip.y);
    ctx.quadraticCurveTo(top.x + dx * len * 0.5 - nx * wdt, top.y + dy * len * 0.5 - ny * wdt, top.x, top.y);
    ctx.fillStyle = LEAF()[i % 4]; ctx.fill();
  }
  circle(ctx, cx, cy, z + 0.02, 4, LEAF()[2]);
}

function officeChair(ctx, cx, cy, face = 'n') {
  shadow(ctx, cx, cy, 0.3, 0.15, 0.14);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const ex = cx + Math.cos(a) * 0.26, ey = cy + Math.sin(a) * 0.26;
    const p0 = project(cx, cy, 0.04), p1 = project(ex, ey, 0.04);
    ctx.strokeStyle = DARK; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    circle(ctx, ex, ey, 0.02, 2.2, '#4a515e');
  }
  box(ctx, cx - 0.03, cy - 0.03, 0.06, 0.06, 0.42, '#4a515e');
  ellipse(ctx, cx, cy, 0.46, 15, 8, DARK);
  ellipse(ctx, cx, cy, 0.49, 13, 6.5, '#3a4050');
  const back = { n: [cx - 0.2, cy - 0.22, 0.4, 0.07], s: [cx - 0.2, cy + 0.15, 0.4, 0.07], e: [cx + 0.15, cy - 0.2, 0.07, 0.4], w: [cx - 0.22, cy - 0.2, 0.07, 0.4] }[face] || [cx - 0.2, cy - 0.22, 0.4, 0.07];
  box(ctx, back[0], back[1], back[2], back[3], 0.5, DARK, { z0: 0.46, top: '#3a4050' });
}

function cafeChair(ctx, cx, cy, face = 'n') {
  shadow(ctx, cx, cy, 0.26, 0.13, 0.12);
  const c = SOFA(), top = shade(c, 1.1);
  legs(ctx, [[cx - 0.2, cy - 0.2], [cx + 0.14, cy - 0.2], [cx - 0.2, cy + 0.14], [cx + 0.14, cy + 0.14]], 0.42, shade(c, 0.78));
  box(ctx, cx - 0.22, cy - 0.22, 0.44, 0.44, 0.07, c, { z0: 0.42, top });
  const back = { n: [cx - 0.22, cy - 0.24, 0.44, 0.06], s: [cx - 0.22, cy + 0.18, 0.44, 0.06], e: [cx + 0.18, cy - 0.22, 0.06, 0.44], w: [cx - 0.24, cy - 0.22, 0.06, 0.44] }[face] || [cx - 0.22, cy - 0.24, 0.44, 0.06];
  box(ctx, back[0], back[1], back[2], back[3], 0.5, c, { z0: 0.49, top });
}

function roundTable(ctx, cx, cy, r = 0.42, h = 0.72, color = WOOD()) {
  shadow(ctx, cx, cy, r, r * 0.5, 0.12);
  box(ctx, cx - 0.05, cy - 0.05, 0.1, 0.1, h - 0.05, '#8b6a4a');
  ellipse(ctx, cx, cy, h - 0.04, r * 64, r * 32, shade(color, 0.85));
  ellipse(ctx, cx, cy, h, r * 64, r * 32, color);
}

function bandDesk(ctx, x, y, w, text, band = '#2f5bd8') {
  shadow(ctx, x + w / 2, y + 0.5, 0.48 * w, 0.3, 0.12);
  box(ctx, x + 0.03, y + 0.1, w - 0.06, 0.8, 0.78, '#ffffff', { left: '#eef0f3', right: '#dfe2e8' });
  faceY(ctx, x + 0.03, x + w - 0.03, y + 0.9, 0.3, 0.55, band);
  if (text) {
    ctx.save();
    const a = project(x + 0.15, y + 0.9, 0.44), b = project(x + w - 0.2, y + 0.9, 0.44);
    ctx.translate(a.x, a.y); ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
    ctx.fillStyle = '#fff'; ctx.font = `bold 9px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

// ---------- 가구 ----------
const DRAW = {
  shelf(ctx, f) {
    box(ctx, f.x + 0.05, f.y + 0.08, 0.9, 0.84, 2.0, CREAM.top, { left: CREAM.left, right: CREAM.right });
    const seed = f.seed || 0;
    for (let row = 0; row < 4; row++) {
      const z0 = 0.18 + row * 0.44;
      let u = 0.1, i = 0;
      while (u < 0.86) {
        const bw = 0.09 + ((seed * 7 + row * 3 + i) % 3) * 0.03, bh = 0.3 + ((seed + i * 5 + row) % 3) * 0.04;
        faceY(ctx, f.x + u, f.x + u + bw, f.y + 0.92, z0, z0 + bh, BOOK[(seed + i * 3 + row) % BOOK.length]);
        u += bw + 0.015; i++;
      }
      faceY(ctx, f.x + 0.05, f.x + 0.95, f.y + 0.92, z0 - 0.03, z0, '#d9d2c5');
    }
  },
  desk(ctx, f) {
    const w = f.w || 1;
    shadow(ctx, f.x + w / 2, f.y + 0.5, 0.45 * w, 0.2, 0.12);
    legs(ctx, [[f.x + 0.1, f.y + 0.75], [f.x + w - 0.18, f.y + 0.75], [f.x + w - 0.18, f.y + 0.18]], 0.7);
    box(ctx, f.x + 0.03, f.y + 0.1, w - 0.06, 0.8, 0.08, '#ffffff', { z0: 0.7, left: '#e6e8ec', right: '#d5d8de' });
    for (let i = 0; i < w; i++) { monitor(ctx, f.x + i + 0.5, f.y + 0.4); keyboard(ctx, f.x + i + 0.5, f.y + 0.62); }
  },
  desk2(ctx, f) {
    bandDesk(ctx, f.x, f.y, f.w || 2, labels.me);
    monitor(ctx, f.x + 0.65, f.y + 0.42);
    laptop(ctx, f.x + 1.2, f.y + 0.45);
    circle(ctx, f.x + 1.85, f.y + 0.78, 0.82, 3.5, '#e8683a');
  },
  reception(ctx, f) {
    bandDesk(ctx, f.x, f.y, f.w || 3, 'INFO');
    laptop(ctx, f.x + 1.2, f.y + 0.45);
    circle(ctx, f.x + 0.5, f.y + 0.5, 0.82, 5, '#5fae6a');
  },
  chair(ctx, f) { officeChair(ctx, f.x + 0.5, f.y + 0.5, f.face); },
  armchair(ctx, f) { cafeChair(ctx, f.x + 0.5, f.y + 0.5, f.face || 'n'); },
  table(ctx, f) {
    const w = f.w || 1, d = f.d || 1;
    shadow(ctx, f.x + w / 2, f.y + d / 2, 0.5 * w, 0.25 * d, 0.12);
    legs(ctx, [[f.x + 0.12, f.y + d - 0.2], [f.x + w - 0.2, f.y + d - 0.2], [f.x + w - 0.2, f.y + 0.12]], 0.66, '#b08d63');
    const wood = WOOD();
    box(ctx, f.x + 0.08, f.y + 0.08, w - 0.16, d - 0.16, 0.08, wood, { z0: 0.66, top: shade(wood, 1.05), left: shade(wood, 0.9), right: shade(wood, 0.8) });
  },
  roundtable(ctx, f) { roundTable(ctx, f.x + (f.w || 1) / 2, f.y + (f.d || 1) / 2, 0.46, 0.72); },
  coffeetable(ctx, f) {
    const w = f.w || 1;
    shadow(ctx, f.x + w / 2, f.y + 0.5, 0.45 * w, 0.2, 0.1);
    box(ctx, f.x + 0.2, f.y + 0.25, w - 0.4, 0.5, 0.36, '#e9c48a', { top: '#f0d3a2', left: '#d8b27a', right: '#c9a26b' });
    circle(ctx, f.x + 0.7, f.y + 0.5, 0.4, 4, '#fff');
    circle(ctx, f.x + w - 0.6, f.y + 0.55, 0.4, 4, '#e8683a');
  },
  sofa(ctx, f) {
    const w = f.w || 1;
    shadow(ctx, f.x + w / 2, f.y + 0.5, 0.5 * w, 0.24, 0.13);
    const c = SOFA(), sides = { top: shade(c, 1.1), left: shade(c, 0.9), right: shade(c, 0.8) };
    box(ctx, f.x + 0.05, f.y + 0.15, w - 0.1, 0.8, 0.46, c, sides);
    box(ctx, f.x + 0.05, f.y + 0.05, w - 0.1, 0.22, 0.86, c, sides);
    box(ctx, f.x + 0.05, f.y + 0.05, 0.16, 0.9, 0.66, shade(c, 0.9), { top: c });
    box(ctx, f.x + w - 0.21, f.y + 0.05, 0.16, 0.9, 0.66, shade(c, 0.9), { top: c });
  },
  counter(ctx, f) {
    const w = f.w || 1;
    shadow(ctx, f.x + w / 2, f.y + 0.5, 0.5 * w, 0.24, 0.12);
    box(ctx, f.x + 0.05, f.y + 0.1, w - 0.1, 0.8, 0.9, '#ffffff', { left: '#eceef2', right: '#dcdfe5' });
    box(ctx, f.x + 0.3, f.y + 0.3, 0.42, 0.42, 0.55, DARK, { z0: 0.9, top: '#3a4050' });
    circle(ctx, f.x + 1.3, f.y + 0.5, 0.93, 4, '#fff');
    circle(ctx, f.x + 1.6, f.y + 0.6, 0.93, 4, '#fff');
  },
  vending(ctx, f) {
    shadow(ctx, f.x + 0.5, f.y + 0.5, 0.34, 0.17, 0.14);
    box(ctx, f.x + 0.12, f.y + 0.12, 0.76, 0.76, 1.8, '#ffffff', { left: '#eceef2', right: '#dcdfe5' });
    faceY(ctx, f.x + 0.2, f.x + 0.8, f.y + 0.88, 0.6, 1.6, '#8b6cff');
    faceY(ctx, f.x + 0.26, f.x + 0.74, f.y + 0.88, 0.9, 1.5, '#d9cfff');
  },
  rack(ctx, f) {
    const cx = f.x + 0.5, cy = f.y + 0.5;
    shadow(ctx, cx, cy, 0.32, 0.16, 0.16);
    box(ctx, cx - 0.24, cy - 0.24, 0.48, 0.48, 1.9, PURPLE, { top: '#9a86e0', left: '#8a6fd8', right: '#6a4fb8' });
    faceY(ctx, cx - 0.24, cx + 0.24, cy + 0.24, 1.45, 1.6, '#d9cfff');
    const t = performance.now() / 1000;
    for (let i = 0; i < 3; i++) {
      const on = Math.sin(t * (1.3 + ((f.seed || 0) % 4) * 0.3) + i * 1.7 + (f.seed || 0)) > 0;
      circle(ctx, cx - 0.14 + i * 0.14, cy + 0.24, 1.2, 1.7, on ? '#c8f0d4' : '#ffd27a');
    }
  },
  ac(ctx, f) {
    box(ctx, f.x + 0.15, f.y + 0.15, 0.7, 0.7, 1.85, '#ffffff', { left: '#eceef2', right: '#dcdfe5' });
    for (let i = 0; i < 4; i++) faceY(ctx, f.x + 0.25, f.x + 0.75, f.y + 0.86, 1.2 + i * 0.12, 1.24 + i * 0.12, '#d5d8de');
  },
  wallscreen(ctx, f) {
    const w = f.w || 1;
    box(ctx, f.x + 0.1, f.y + 0.05, w - 0.2, 0.1, 1.2, DARK, { z0: 0.75, top: '#3a4050' });
    const y = f.y + 0.16;
    faceY(ctx, f.x + 0.16, f.x + w - 0.16, y, 0.82, 1.88, '#1f3b66');
    ctx.strokeStyle = '#9fd3ff'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const p = project(f.x + 0.3 + i * (w - 0.6) / 6, y, 1.05 + 0.5 * Math.abs(Math.sin(i * 1.3 + f.x)));
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
  },
  globe(ctx, f) {
    box(ctx, f.x + 0.35, f.y + 0.35, 0.3, 0.3, 0.6, '#f1ece2', { left: '#e4dccd', right: '#d6ccba' });
    const p = project(f.x + 0.5, f.y + 0.5, 1.05);
    const g = ctx.createRadialGradient(p.x - 4, p.y - 4, 2, p.x, p.y, 12);
    g.addColorStop(0, '#9fd0ff'); g.addColorStop(1, '#2d6ca8');
    ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = '#5fae6a'; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y - 2, 5, 3, 0.5, 0, Math.PI * 2); ctx.fill();
  },
  whiteboard(ctx, f) {
    const d = f.d || 1;
    box(ctx, f.x + 0.05, f.y + 0.1, 0.1, d - 0.2, 1.3, '#d9dce2', { z0: 0.6 });
    const x = f.x + 0.16;
    faceX(ctx, x, f.y + 0.2, f.y + d - 0.2, 0.7, 1.85, '#ffffff');
    ctx.strokeStyle = '#e8683a'; ctx.lineWidth = 1.4; ctx.beginPath();
    const a = project(x, f.y + 0.4, 1.55), b = project(x, f.y + d / 2, 1.25), c = project(x, f.y + d - 0.4, 1.45);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.strokeStyle = '#3b6fd6'; ctx.beginPath();
    const dd = project(x, f.y + 0.4, 1.05), e = project(x, f.y + d - 0.4, 0.98);
    ctx.moveTo(dd.x, dd.y); ctx.lineTo(e.x, e.y); ctx.stroke();
  },
  plant(ctx, f) { palm(ctx, f.x + 0.5, f.y + 0.5, ((f.x + f.y) % 3) === 0); },
  cabinet(ctx, f) {
    box(ctx, f.x + 0.1, f.y + 0.1, 0.8, 0.8, 1.0, '#ffffff', { left: '#eceef2', right: '#dcdfe5' });
    faceY(ctx, f.x + 0.35, f.x + 0.65, f.y + 0.91, 0.5, 0.54, '#c9ccd3');
  },
  sign(ctx, f) {
    post(ctx, f.x + 0.5, f.y + 0.5, 0.9, '#e4d2b0');
    box(ctx, f.x + 0.22, f.y + 0.44, 0.56, 0.1, 0.42, '#2f5bd8', { z0: 0.9, top: '#4a74e6' });
  },
  cafetable(ctx, f) { roundTable(ctx, f.x + 0.5, f.y + 0.5, 0.36, 0.74, '#f4efe6'); },
  stool(ctx, f) {
    shadow(ctx, f.x + 0.5, f.y + 0.5, 0.2, 0.1, 0.1);
    post(ctx, f.x + 0.5, f.y + 0.5, 0.55, '#8a6a48');
    ellipse(ctx, f.x + 0.5, f.y + 0.5, 0.56, 9, 4.5, '#b58f66');
    ellipse(ctx, f.x + 0.5, f.y + 0.5, 0.6, 9, 4.5, '#d9b98f');
  },
  coffeemachine(ctx, f) {
    shadow(ctx, f.x + 0.5, f.y + 0.5, 0.34, 0.17, 0.12);
    box(ctx, f.x + 0.05, f.y + 0.1, 0.9, 0.8, 0.9, '#ffffff', { left: '#eceef2', right: '#dcdfe5' });
    box(ctx, f.x + 0.25, f.y + 0.3, 0.5, 0.45, 0.55, '#3a4050', { z0: 0.9, top: '#4a5264', left: '#2f3542', right: '#262b36' });
    box(ctx, f.x + 0.3, f.y + 0.3, 0.4, 0.1, 0.25, '#c0392b', { z0: 1.2, top: '#e74c3c' });
    circle(ctx, f.x + 0.5, f.y + 0.82, 1.0, 3, '#e8d9c0');
  },
  planter(ctx, f) {
    const w = f.w || 1;
    shadow(ctx, f.x + w / 2, f.y + 0.5, 0.5 * w, 0.22, 0.12);
    box(ctx, f.x + 0.08, f.y + 0.2, w - 0.16, 0.6, 0.5, '#a88b6a', { top: '#5a4330', left: '#9a7d5e', right: '#86694c' });
    for (let i = 0; i < w * 3; i++) {
      const cx = f.x + 0.2 + (i + 0.5) * ((w - 0.4) / (w * 3)), cy = f.y + 0.5 + ((i % 2) ? 0.12 : -0.12);
      const t = project(cx, cy, 0.5);
      ctx.fillStyle = LEAF()[i % 4];
      ctx.beginPath(); ctx.ellipse(t.x, t.y - 8, 7, 11, 0, 0, Math.PI * 2); ctx.fill();
    }
  },
  parasol(ctx, f) {
    const cx = f.x + 1, cy = f.y + 1;
    shadow(ctx, cx, cy, 0.9, 0.45, 0.14);
    roundTable(ctx, cx, cy, 0.5, 0.72, '#f4efe6');
    for (const [dx, dy] of [[-0.62, 0], [0.62, 0], [0, -0.62], [0, 0.62]]) {
      const t = project(cx + dx, cy + dy, 0.45);
      ctx.fillStyle = '#d9b98f'; ctx.beginPath(); ctx.ellipse(t.x, t.y, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      post(ctx, cx + dx, cy + dy, 0.45, '#8a6a48');
    }
    post(ctx, cx, cy, 2.1, '#8a6a48');
    const top = project(cx, cy, 2.1), rim = project(cx, cy, 1.65);
    const pc = ACCENT.parasol;
    ctx.fillStyle = pc;
    ctx.beginPath(); ctx.ellipse(rim.x, rim.y, 60, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(pc, 1.18);
    for (let i = 0; i < 6; i += 2) {
      const a0 = i / 6 * Math.PI * 2, a1 = (i + 1) / 6 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(rim.x, rim.y); ctx.ellipse(rim.x, rim.y, 60, 30, 0, a0, a1); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = shade(pc, 0.85); ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rim.x + Math.cos(a) * 60, rim.y + Math.sin(a) * 30); ctx.stroke(); }
    circle(ctx, cx, cy, 2.15, 3, shade(pc, 0.85));
  },
  bench(ctx, f) {
    const w = f.w || 1;
    shadow(ctx, f.x + w / 2, f.y + 0.5, 0.45 * w, 0.2, 0.1);
    legs(ctx, [[f.x + 0.15, f.y + 0.62], [f.x + w - 0.25, f.y + 0.62]], 0.4, '#b08d63');
    box(ctx, f.x + 0.1, f.y + 0.3, w - 0.2, 0.4, 0.08, WOOD(), { z0: 0.4, top: shade(WOOD(), 1.05) });
  },
  // ---------- FE-35 편의시설 가구 ----------
  treadmill(ctx, f) {
    const d = f.d || 2;
    shadow(ctx, f.x + 0.5, f.y + d / 2, 0.4, 0.5, 0.12);
    box(ctx, f.x + 0.12, f.y + 0.15, 0.76, d - 0.3, 0.18, '#3a4050', { top: '#4a5264', left: '#2f3542', right: '#262b36' });
    box(ctx, f.x + 0.2, f.y + 0.45, 0.6, d - 0.7, 0.03, '#2b2f3a', { z0: 0.18, top: '#20242c' });
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    for (let k = 0.6; k < d - 0.3; k += 0.25) { const a = project(f.x + 0.22, f.y + k, 0.21), b = project(f.x + 0.78, f.y + k, 0.21); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    box(ctx, f.x + 0.14, f.y + 0.15, 0.08, 0.1, 1.1, '#b9c3d1', { z0: 0.18 }); box(ctx, f.x + 0.78, f.y + 0.15, 0.08, 0.1, 1.1, '#b9c3d1', { z0: 0.18 });
    box(ctx, f.x + 0.14, f.y + 0.12, 0.72, 0.16, 0.08, '#d9dce2', { z0: 1.28 });
    box(ctx, f.x + 0.3, f.y + 0.1, 0.4, 0.08, 0.3, DARK, { z0: 1.3, top: '#3a4050' });
    faceY(ctx, f.x + 0.33, f.x + 0.67, f.y + 0.19, 1.36, 1.56, '#5fb4ff');
  },
  dumbbells(ctx, f) {
    const d = f.d || 2;
    shadow(ctx, f.x + 0.5, f.y + d / 2, 0.36, 0.5, 0.12);
    for (const z0 of [0, 0.55, 1.0]) box(ctx, f.x + 0.15, f.y + 0.1, 0.7, d - 0.2, 0.08, '#3a4050', { z0, top: '#4a5264' });
    const cols = ['#e76f51', '#2a9d8f', '#e9c46a', '#457b9d'];
    for (const [k, z0] of [[0, 0.08], [1, 0.63], [2, 1.08]]) for (let i = 0; i < 4; i++) {
      const cy = f.y + 0.3 + i * ((d - 0.5) / 3), c = cols[(i + k) % 4];
      box(ctx, f.x + 0.22, cy - 0.1, 0.18, 0.2, 0.2, c, { z0 }); box(ctx, f.x + 0.6, cy - 0.1, 0.18, 0.2, 0.2, c, { z0 });
      box(ctx, f.x + 0.4, cy - 0.03, 0.2, 0.06, 0.06, '#b9c3d1', { z0: z0 + 0.07 });
    }
  },
  mat(ctx, f) {
    const w = f.w || 2, c = f.color || ACCENT.sofa;
    box(ctx, f.x + 0.15, f.y + 0.2, w - 0.3, 0.6, 0.04, c, { top: shade(c, 1.1) });
  },
  cooler(ctx, f) {
    shadow(ctx, f.x + 0.5, f.y + 0.5, 0.3, 0.15, 0.12);
    box(ctx, f.x + 0.25, f.y + 0.25, 0.5, 0.5, 1.1, '#ffffff', { left: '#eceef2', right: '#dcdfe5' });
    faceY(ctx, f.x + 0.35, f.x + 0.65, f.y + 0.76, 0.5, 0.9, '#5fb4ff');
    box(ctx, f.x + 0.32, f.y + 0.32, 0.36, 0.36, 0.45, '#9fd3ff', { z0: 1.1, top: '#bfe3f7', left: '#8ac6f5', right: '#7ab8ea' });
  },
  flowerbed(ctx, f) {
    const w = f.w || 3, d = f.d || 2;
    box(ctx, f.x + 0.08, f.y + 0.08, w - 0.16, d - 0.16, 0.3, '#a88b6a', { top: '#5a4330', left: '#9a7d5e', right: '#86694c' });
    const cols = ['#e76f51', '#f4a261', '#d1495b', '#e9c46a', '#f28ca8', '#9b6bd6'];
    for (let i = 0; i < w * d * 3; i++) {
      const cx = f.x + 0.3 + ((i * 7) % (w * 10)) / 10 * ((w - 0.6) / w), cy = f.y + 0.3 + ((i * 3) % (d * 10)) / 10 * ((d - 0.6) / d);
      const t = project(cx, cy, 0.3);
      ctx.fillStyle = LEAF()[i % 4]; ctx.beginPath(); ctx.ellipse(t.x, t.y - 5, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.arc(t.x, t.y - 10, 3, 0, Math.PI * 2); ctx.fill();
    }
  },
  pond(ctx, f) {
    const w = f.w || 3, d = f.d || 2, rx = (w + d) * 13, ry = (w + d) * 6.5;
    const c = project(f.x + w / 2, f.y + d / 2, 0);
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = '#b8b0a2'; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7fc3e8'; ctx.beginPath(); ctx.ellipse(0, -2, rx - 6, ry - 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-rx * 0.3, -8, rx * 0.25, ry * 0.2, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5fae6a';
    for (const [dx, dy] of [[rx * 0.35, 2], [-rx * 0.2, 8], [rx * 0.05, -9]]) { ctx.beginPath(); ctx.ellipse(dx, dy, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f28c38'; ctx.beginPath(); ctx.ellipse(rx * 0.15, 5, 4, 2, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  buffet(ctx, f) {
    const w = f.w || 4;
    shadow(ctx, f.x + w / 2, f.y + 0.5, 0.5 * w, 0.24, 0.12);
    box(ctx, f.x + 0.05, f.y + 0.1, w - 0.1, 0.8, 0.9, '#ffffff', { left: '#eceef2', right: '#dcdfe5' });
    const foods = ['#e9c46a', '#8ab17d', '#e76f51', '#f4a261', '#d1495b', '#2a9d8f'];
    for (let i = 0; i < w * 2; i++) { box(ctx, f.x + 0.12 + i * 0.5, f.y + 0.2, 0.36, 0.5, 0.1, '#d9dce2', { z0: 0.9 }); box(ctx, f.x + 0.16 + i * 0.5, f.y + 0.25, 0.28, 0.4, 0.1, foods[i % foods.length], { z0: 1.0 }); }
    for (const dx of [0.1, w / 2, w - 0.1]) box(ctx, f.x + dx - 0.03, f.y + 0.12, 0.06, 0.06, 0.65, '#b9c3d1', { z0: 0.9 });
    faceY(ctx, f.x + 0.1, f.x + w - 0.1, f.y + 0.15, 1.15, 1.55, 'rgba(191,227,247,0.5)');
  },
  fridge(ctx, f) {
    shadow(ctx, f.x + 0.5, f.y + 0.5, 0.34, 0.17, 0.14);
    box(ctx, f.x + 0.12, f.y + 0.12, 0.76, 0.76, 2.0, '#e6e8ee', { top: '#f3f4f7', left: '#dfe2e8', right: '#cfd3db' });
    faceY(ctx, f.x + 0.2, f.x + 0.8, f.y + 0.89, 0.1, 1.2, '#d5d8de');
    faceY(ctx, f.x + 0.2, f.x + 0.8, f.y + 0.89, 1.28, 1.9, '#d5d8de');
    faceY(ctx, f.x + 0.68, f.x + 0.74, f.y + 0.9, 0.4, 1.0, '#8a919b');
    faceY(ctx, f.x + 0.68, f.x + 0.74, f.y + 0.9, 1.4, 1.8, '#8a919b');
  },
  bed(ctx, f) {
    const d = f.d || 2, c = f.color || ACCENT.sofa;
    shadow(ctx, f.x + 0.5, f.y + d / 2, 0.4, 0.5, 0.12);
    box(ctx, f.x + 0.08, f.y + 0.08, 0.84, d - 0.16, 0.35, '#d9b98f', { top: '#e8d9c0', left: '#c9a76f', right: '#b8955e' });
    box(ctx, f.x + 0.12, f.y + 0.12, 0.76, d - 0.24, 0.12, '#ffffff', { z0: 0.35, left: '#eceef2', right: '#dcdfe5' });
    box(ctx, f.x + 0.2, f.y + 0.18, 0.6, 0.35, 0.12, '#f6f2ea', { z0: 0.47, left: '#ece6da', right: '#ddd6c8' });
    box(ctx, f.x + 0.12, f.y + 0.65, 0.76, d - 0.77, 0.08, c, { z0: 0.47, top: shade(c, 1.1), left: shade(c, 0.9), right: shade(c, 0.8) });
  },
  partition(ctx, f) {
    const d = f.d || 2;
    box(ctx, f.x + 0.45, f.y + 0.05, 0.1, d - 0.1, 1.5, '#cfd6e0', { top: '#e3e8ef', left: '#dfe5ed', right: '#bfc8d4' });
  },
  floorlamp(ctx, f) {
    const cx = f.x + 0.5, cy = f.y + 0.5;
    ellipse(ctx, cx, cy, 0.02, 8, 4, '#4a515e');
    post(ctx, cx, cy, 1.55, '#4a515e');
    const p = project(cx, cy, 1.55), g = project(cx, cy, 1.85);
    poly(ctx, [{ x: p.x - 14, y: p.y }, { x: p.x + 14, y: p.y }, { x: g.x + 8, y: g.y }, { x: g.x - 8, y: g.y }], '#f4d9a6');
    ctx.fillStyle = 'rgba(255,220,140,0.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
  },
  pooltable(ctx, f) {
    const w = f.w || 3, d = f.d || 2;
    shadow(ctx, f.x + w / 2, f.y + d / 2, 0.5 * w, 0.25 * d, 0.14);
    legs(ctx, [[f.x + 0.15, f.y + d - 0.25], [f.x + w - 0.25, f.y + d - 0.25], [f.x + w - 0.25, f.y + 0.15]], 0.6, '#5a4330');
    box(ctx, f.x + 0.1, f.y + 0.1, w - 0.2, d - 0.2, 0.18, '#6b4e3d', { z0: 0.6, top: '#2f8f5b', left: '#5a4330', right: '#4a3627' });
    box(ctx, f.x + 0.1, f.y + 0.1, w - 0.2, 0.12, 0.06, '#6b4e3d', { z0: 0.78 }); box(ctx, f.x + 0.1, f.y + d - 0.22, w - 0.2, 0.12, 0.06, '#6b4e3d', { z0: 0.78 });
    box(ctx, f.x + 0.1, f.y + 0.1, 0.12, d - 0.2, 0.06, '#6b4e3d', { z0: 0.78 }); box(ctx, f.x + w - 0.22, f.y + 0.1, 0.12, d - 0.2, 0.06, '#6b4e3d', { z0: 0.78 });
    for (const [bx, by, c] of [[1.2, 0.8, '#ffffff'], [1.7, 1.1, '#e76f51'], [1.9, 0.7, '#e9c46a'], [0.8, 1.3, '#457b9d']]) circle(ctx, f.x + bx, f.y + by, 0.82, 2.5, c);
  },
  arcade(ctx, f) {
    shadow(ctx, f.x + 0.5, f.y + 0.5, 0.32, 0.16, 0.14);
    box(ctx, f.x + 0.15, f.y + 0.15, 0.7, 0.7, 1.7, PURPLE, { top: '#9a86e0', left: '#8a6fd8', right: '#6a4fb8' });
    faceY(ctx, f.x + 0.22, f.x + 0.78, f.y + 0.86, 0.95, 1.45, '#1f3b66');
    faceY(ctx, f.x + 0.28, f.x + 0.72, f.y + 0.87, 1.0, 1.4, ['#5fb4ff', '#f28ca8', '#8fd49e'][(f.x + f.y) % 3]);
    faceY(ctx, f.x + 0.22, f.x + 0.78, f.y + 0.86, 1.5, 1.68, '#ffd27a');
    box(ctx, f.x + 0.2, f.y + 0.7, 0.6, 0.2, 0.06, '#3a4050', { z0: 0.9 });
    circle(ctx, f.x + 0.35, f.y + 0.8, 0.98, 2, '#e76f51'); circle(ctx, f.x + 0.5, f.y + 0.8, 0.98, 2, '#e9c46a'); circle(ctx, f.x + 0.65, f.y + 0.8, 0.98, 2, '#2a9d8f');
  },
  beanbag(ctx, f) {
    const c = f.color || ACCENT.sofa, p = project(f.x + 0.5, f.y + 0.5, 0);
    shadow(ctx, f.x + 0.5, f.y + 0.5, 0.34, 0.17, 0.12);
    ctx.fillStyle = shade(c, 0.85); ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, 20, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(p.x, p.y - 10, 17, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(c, 1.12); ctx.beginPath(); ctx.ellipse(p.x - 4, p.y - 13, 7, 4, -0.3, 0, Math.PI * 2); ctx.fill();
  },
  pingpong(ctx, f) {
    const w = f.w || 3, d = f.d || 2;
    shadow(ctx, f.x + w / 2, f.y + d / 2, 0.5 * w, 0.25 * d, 0.12);
    legs(ctx, [[f.x + 0.2, f.y + d - 0.3], [f.x + w - 0.3, f.y + d - 0.3], [f.x + w - 0.3, f.y + 0.2]], 0.7, '#4a515e');
    box(ctx, f.x + 0.1, f.y + 0.15, w - 0.2, d - 0.3, 0.06, '#2f6fb0', { z0: 0.7, top: '#3b7fc4', left: '#285f98', right: '#214f80' });
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
    const a = project(f.x + 0.1, f.y + d / 2, 0.76), b = project(f.x + w - 0.1, f.y + d / 2, 0.76);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    faceX(ctx, f.x + w / 2, f.y + 0.1, f.y + d - 0.1, 0.76, 0.92, 'rgba(240,244,250,0.85)');
    circle(ctx, f.x + 0.8, f.y + 0.6, 0.8, 2, '#f28c38');
  },
  lowshelf(ctx, f) {
    box(ctx, f.x + 0.05, f.y + 0.1, 0.9, 0.8, 1.0, CREAM.top, { left: CREAM.left, right: CREAM.right });
    const seed = f.seed || 0;
    for (let row = 0; row < 2; row++) {
      const z0 = 0.15 + row * 0.42;
      let u = 0.1, i = 0;
      while (u < 0.86) { const bw = 0.09 + ((seed * 7 + row * 3 + i) % 3) * 0.03; faceY(ctx, f.x + u, f.x + u + bw, f.y + 0.92, z0, z0 + 0.3, BOOK[(seed + i * 3 + row) % BOOK.length]); u += bw + 0.015; i++; }
      faceY(ctx, f.x + 0.05, f.x + 0.95, f.y + 0.92, z0 - 0.03, z0, '#d9d2c5');
    }
  },
  rug(ctx, f) {
    const w = f.w || 3, d = f.d || 2, c = f.color || ACCENT.sofa;
    poly(ctx, [project(f.x + 0.1, f.y + 0.1), project(f.x + w - 0.1, f.y + 0.1), project(f.x + w - 0.1, f.y + d - 0.1), project(f.x + 0.1, f.y + d - 0.1)], shade(c, 1.25));
    poly(ctx, [project(f.x + 0.35, f.y + 0.35), project(f.x + w - 0.35, f.y + 0.35), project(f.x + w - 0.35, f.y + d - 0.35), project(f.x + 0.35, f.y + d - 0.35)], shade(c, 1.4));
  },
  booth(ctx, f) {
    const w = f.w || 2, d = f.d || 2;
    shadow(ctx, f.x + w / 2, f.y + d / 2, 0.5 * w, 0.25 * d, 0.12);
    box(ctx, f.x + 0.1, f.y + 0.1, w - 0.2, d - 0.2, 0.1, '#3a4050', { top: '#4a5264' });
    post(ctx, f.x + 0.5, f.y + d - 0.4, 1.0, '#8a919b');
    circle(ctx, f.x + 0.5, f.y + d - 0.4, 1.05, 4, '#2b2f3a');
    box(ctx, f.x + 0.1, f.y + 0.1, w - 0.2, d - 0.2, 1.9, 'rgba(191,227,247,0.35)', { z0: 0.1, top: 'rgba(230,240,250,0.5)', left: 'rgba(191,227,247,0.4)', right: 'rgba(170,210,235,0.45)' });
    for (const [px, py] of [[f.x + 0.12, f.y + 0.12], [f.x + w - 0.12, f.y + 0.12], [f.x + 0.12, f.y + d - 0.12], [f.x + w - 0.12, f.y + d - 0.12]]) post(ctx, px, py, 2.0, '#3a4050');
    faceY(ctx, f.x + 0.3, f.x + w - 0.3, f.y + d - 0.08, 1.6, 1.78, '#e05252');
  },
  camera(ctx, f) {
    const cx = f.x + 0.5, cy = f.y + 0.5;
    ctx.strokeStyle = '#4a515e'; ctx.lineWidth = 2;
    for (const [dx, dy] of [[-0.25, 0.2], [0.25, 0.2], [0, -0.28]]) { const a = project(cx + dx, cy + dy, 0), b = project(cx, cy, 1.1); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    box(ctx, cx - 0.2, cy - 0.15, 0.4, 0.3, 0.28, DARK, { z0: 1.1, top: '#3a4050' });
    box(ctx, cx - 0.1, cy + 0.15, 0.2, 0.2, 0.2, '#4a515e', { z0: 1.14 });
    circle(ctx, cx, cy + 0.35, 1.24, 3, '#5fb4ff');
    circle(ctx, cx - 0.12, cy - 0.1, 1.42, 1.6, '#e05252');
  },
  lightstand(ctx, f) {
    const cx = f.x + 0.5, cy = f.y + 0.5;
    ellipse(ctx, cx, cy, 0.02, 9, 4.5, '#4a515e');
    post(ctx, cx, cy, 1.5, '#4a515e');
    box(ctx, cx - 0.3, cy - 0.08, 0.6, 0.16, 0.5, '#f3f4f7', { z0: 1.45, top: '#ffffff', left: '#e3e6ea', right: '#d5d8de' });
    const p = project(cx, cy + 0.1, 1.7); ctx.fillStyle = 'rgba(255,245,210,0.45)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 22, 9, 0, 0, Math.PI * 2); ctx.fill();
  },
  mic(ctx, f) {
    const cx = f.x + 0.5, cy = f.y + 0.5;
    ellipse(ctx, cx, cy, 0.02, 7, 3.5, '#4a515e');
    post(ctx, cx, cy, 1.25, '#4a515e');
    box(ctx, cx - 0.06, cy - 0.06, 0.12, 0.12, 0.2, '#2b2f3a', { z0: 1.25, top: '#8a919b' });
  },
  podium(ctx, f) {
    const wood = WOOD();
    shadow(ctx, f.x + 0.5, f.y + 0.5, 0.3, 0.15, 0.12);
    box(ctx, f.x + 0.2, f.y + 0.2, 0.6, 0.6, 1.0, wood, { top: shade(wood, 1.05), left: shade(wood, 0.9), right: shade(wood, 0.8) });
    box(ctx, f.x + 0.15, f.y + 0.15, 0.7, 0.7, 0.1, shade(wood, 0.85), { z0: 1.0, top: shade(wood, 0.95) });
    box(ctx, f.x + 0.3, f.y + 0.3, 0.4, 0.3, 0.03, '#ffffff', { z0: 1.1 });
  },
  seat(ctx, f) {
    const cx = f.x + 0.5, cy = f.y + 0.5, c = f.color || ACCENT.sofa;
    legs(ctx, [[cx - 0.2, cy - 0.2], [cx + 0.14, cy - 0.2], [cx - 0.2, cy + 0.14], [cx + 0.14, cy + 0.14]], 0.4, '#4a515e');
    box(ctx, cx - 0.24, cy - 0.24, 0.48, 0.48, 0.07, c, { z0: 0.4, top: shade(c, 1.1) });
    box(ctx, cx - 0.24, cy - 0.26, 0.48, 0.07, 0.42, c, { z0: 0.47, top: shade(c, 1.1) });
  },
  elevator(ctx, f) {
    box(ctx, f.x, f.y, 1, 0.5, 2.3, '#e6e8ee', { top: '#f3f4f7', left: '#dfe2e8', right: '#cfd3db' });
    const y = f.y + 0.5;
    faceY(ctx, f.x + 0.08, f.x + 0.48, y, 0.02, 2.0, '#b9c3d1');
    faceY(ctx, f.x + 0.52, f.x + 0.92, y, 0.02, 2.0, '#b9c3d1');
    faceY(ctx, f.x + 0.1, f.x + 0.46, y, 0.05, 1.97, '#c8d1dd');
    faceY(ctx, f.x + 0.54, f.x + 0.9, y, 0.05, 1.97, '#c8d1dd');
    const t = Math.floor(performance.now() / 700) % 2;
    circle(ctx, f.x + 0.5, y, 2.15, 2.5, t ? '#ffb347' : '#e8683a');
  },
};

export function drawFurniture(ctx, f) {
  const fn = DRAW[f.type];
  if (fn) fn(ctx, f);
  else box(ctx, f.x, f.y, f.w || 1, f.d || 1, 0.8, '#cccccc');
}

// ---------- 벽 ----------
/** 벽 조각: 문 구멍을 비우고 1타일 단위로 쪼갠다 (깊이 정렬 정확도를 위해) */
export function wallPieces(w) {
  const th = w.outer ? 0.2 : 0.14;
  const out = [];
  for (let i = 0; i < w.len; i++) {
    if (w.doors.includes(i)) continue;
    const first = i === 0 || w.doors.includes(i - 1);
    const last = i === w.len - 1 || w.doors.includes(i + 1);
    const win = !!(w.windows && w.windows.includes(i));
    out.push(w.dir === 'h'
      ? { wall: w, x: w.x + i, y: w.y - th / 2, w: 1, d: th, h: w.h, first, last, win, rail: !!w.rail, dir: 'h' }
      : { wall: w, x: w.x - th / 2, y: w.y + i, w: th, d: 1, h: w.h, first, last, win, rail: !!w.rail, dir: 'v' });
  }
  return out;
}

export function drawWallPiece(ctx, p) {
  if (p.rail) { drawRail(ctx, p); return; }
  box(ctx, p.x, p.y, p.w, p.d, p.h, '#fbfbfc', { top: '#ffffff', left: '#e9ebf0', right: '#d8dbe2' });
  if (p.win && p.dir === 'h') {
    // 유리창: 벽 앞면(남쪽)에 틀 + 유리 + 사선 하이라이트. 유리 색은 시간대(daylight.js)에 따라 다르다
    const y = p.y + p.d + 0.001, x0 = p.x + 0.1, x1 = p.x + 0.9, z0 = 0.45, z1 = p.h - 0.2;
    faceY(ctx, x0, x1, y, z0, z1, '#cfd6e0');
    const dl = daylight();
    const A = project(x0 + 0.05, y, z0 + 0.05), B = project(x1 - 0.05, y, z0 + 0.05), C = project(x1 - 0.05, y, z1 - 0.05), D = project(x0 + 0.05, y, z1 - 0.05);
    const g = ctx.createLinearGradient(0, D.y, 0, A.y); // 위(z1) → 아래(z0)
    dl.sky.forEach((c, i) => g.addColorStop(dl.sky.length === 1 ? 0 : i / (dl.sky.length - 1), c));
    poly(ctx, [A, B, C, D], g);
    ctx.save(); ctx.beginPath();
    ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.clip();
    if (dl.stars) {
      // 밤: 작은 별 (창마다 다른 자리) + 달 (가운데 창 하나)
      const w = B.x - A.x, h = A.y - D.y;
      for (let i = 0; i < 4; i++) {
        const k = (p.x * 7 + i * 13) % 11, m = (p.x * 5 + i * 17) % 7;
        const sx = D.x + 4 + (w - 8) * (k / 10), sy = D.y + 3 + (h - 10) * (m / 6);
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.85)' : 'rgba(255,245,210,0.7)';
        ctx.fillRect(sx, sy, i % 3 ? 1 : 1.5, i % 3 ? 1 : 1.5);
      }
      if (p.x === 31) { ctx.fillStyle = '#f3eed6'; ctx.beginPath(); ctx.arc(D.x + w * 0.68, D.y + h * 0.28, 3.2, 0, Math.PI * 2); ctx.fill(); }
    }
    const a = A, b = C;
    ctx.strokeStyle = `rgba(255,255,255,${dl.glare})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(a.x - 6, b.y + 18); ctx.lineTo(a.x + 14, b.y - 4); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x + 4, b.y + 22); ctx.lineTo(a.x + 22, b.y + 2); ctx.stroke();
    ctx.restore();
    // 창살
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    faceY(ctx, mx - 0.015, mx + 0.015, y + 0.001, z0, z1, '#cfd6e0');
    faceY(ctx, x0 + 0.05, x1 - 0.05, y + 0.001, mz - 0.012, mz + 0.012, '#cfd6e0');
  }
}

/** 난간: 기둥 + 가로대 두 줄 (테라스 가장자리) */
function drawRail(ctx, p) {
  const c = '#8a6a48', top = '#b58f66';
  if (p.dir === 'h') {
    const y = p.y + p.d / 2;
    box(ctx, p.x + 0.04, y - 0.03, 0.06, 0.06, p.h, c, { top });
    box(ctx, p.x, y - 0.015, 1, 0.03, 0.035, c, { z0: p.h - 0.035, top });
    box(ctx, p.x, y - 0.015, 1, 0.03, 0.03, c, { z0: p.h * 0.5, top });
    if (p.last) box(ctx, p.x + 0.9, y - 0.03, 0.06, 0.06, p.h, c, { top });
  } else {
    const x = p.x + p.w / 2;
    box(ctx, x - 0.03, p.y + 0.04, 0.06, 0.06, p.h, c, { top });
    box(ctx, x - 0.015, p.y, 0.03, 1, 0.035, c, { z0: p.h - 0.035, top });
    box(ctx, x - 0.015, p.y, 0.03, 1, 0.03, c, { z0: p.h * 0.5, top });
    if (p.last) box(ctx, x - 0.03, p.y + 0.9, 0.06, 0.06, p.h, c, { top });
  }
}

/** 문매트: 문이 있는 변을 가로지르는 얇은 띠 (바닥 위에 그린다) */
export function drawDoorMat(ctx, d) {
  const y0 = d.y - 0.35, y1 = d.y + 0.35;
  poly(ctx, [project(d.x, y0), project(d.x + 1, y0), project(d.x + 1, y1), project(d.x, y1)], 'rgba(90,70,50,0.12)');
  const a = project(d.x, d.y), b = project(d.x + 1, d.y);
  ctx.strokeStyle = 'rgba(90,70,50,0.3)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

/** 문설주: 문 양 끝의 짧은 기둥 */
export function drawDoorPost(ctx, x, y, h) {
  box(ctx, x - 0.08, y - 0.08, 0.16, 0.16, h + 0.15, '#e4d2b0', { top: '#efe0c4', left: '#d8c4a0', right: '#c9b48f' });
}

/** 호환용: 통짜 벽 그리기 (디버그) */
export function drawWall(ctx, w) { for (const p of wallPieces(w)) drawWallPiece(ctx, p); }

export { ZH };
