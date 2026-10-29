// 테마 층(FE-60) 소품 그리기 — 사무실 가구와 같은 평면 벡터. 배치는 decorPlan.js, 깊이 정렬은 render.js 가 한다.
// 좌표는 타일 단위, ctx 는 월드 변환이 걸린 상태. 반짝이·흔들리는 것(DYNAMIC)은 매 프레임 now 로 다시 그린다.
import { project } from './map.js';
import { box, shadow, poly, ellipse, faceY, faceX, shade } from './sprites.js';

const P = (x, y, z = 0) => project(x, y, z);
const glow = (ctx, p, r, rgb, a) => {
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
};
const flame = (ctx, p, s, now, seed = 0) => {
  const f = 1 + Math.sin(now / 90 + seed) * 0.12;
  glow(ctx, { x: p.x, y: p.y - 3 * s }, 14 * s, '255,190,90', 0.55);
  ctx.fillStyle = '#ffd060'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 3 * s, 1.8 * s, 3.4 * s * f, 0, 0, Math.PI * 2); ctx.fill();
};
const BULB = ['#ff4d4d', '#ffd34d', '#4dd17a', '#4da6ff'];

// 높이(z1)·여백·움직임
export const DECOR_HEIGHT = {
  pumpkin: 0.55, pumpkins: 0.7, candles: 0.6, ghost: 1.9, tombstone: 0.95, cauldron: 0.9, bat: 2.6, cobweb: 1.75, hbunting: 1.7,
  xmastree: 2.9, gifts: 0.55, snowman: 2.0, fireplace: 1.9, wreath: 1.55, xlights: 1.75,
  lantern: 0.5, torch: 1.6,
  beachumbrella: 2.1, lounger: 1.0, beachball: 0.45, cooler: 0.7, floatring: 0.12, surfboard: 2.1, pool: 0.05, lifebuoy: 1.5, bunting: 1.7,
};
export const DECOR_PAD = { xmastree: 60, beachumbrella: 70, ghost: 40, bat: 40, cauldron: 44, pumpkin: 36, pumpkins: 40, candles: 30, fireplace: 50, cobweb: 40, pool: 30 };
export const DECOR_DYNAMIC = new Set(['ghost', 'bat', 'cauldron', 'candles', 'xlights', 'xmastree', 'fireplace', 'lantern', 'torch']);

// ---------- 할로윈 ----------
function pumpkinAt(ctx, x, y, z, s) {
  const p = P(x, y, z + 0.22 * s), rx = 13 * s, ry = 10 * s;
  glow(ctx, p, 30 * s, '255,150,50', 0.4);
  for (const [dx, col, w] of [[-6, '#e06a1c', 0.6], [6, '#c95a14', 0.6], [0, '#f28a2a', 0.65]]) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(p.x + dx * s, p.y, rx * w, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#4a7a3a'; ctx.fillRect(p.x - 1.5 * s, p.y - ry - 4 * s, 3 * s, 5 * s);
  ctx.fillStyle = '#ffd34d';
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(p.x + d * 6 * s, p.y - 4 * s); ctx.lineTo(p.x + d * 2 * s, p.y - 1 * s); ctx.lineTo(p.x + d * 7 * s, p.y); ctx.closePath(); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(p.x - 7 * s, p.y + 3 * s); ctx.lineTo(p.x - 3 * s, p.y + 5 * s); ctx.lineTo(p.x - 1 * s, p.y + 3.5 * s); ctx.lineTo(p.x + 2 * s, p.y + 5.5 * s);
  ctx.lineTo(p.x + 7 * s, p.y + 3 * s); ctx.lineTo(p.x + 3 * s, p.y + 7 * s); ctx.lineTo(p.x - 3 * s, p.y + 7 * s); ctx.closePath(); ctx.fill();
}
function batAt(ctx, p, s, flap) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s); ctx.fillStyle = '#1a1424';
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(d * 8, -10 * flap - 2, d * 16, -4 * flap); ctx.quadraticCurveTo(d * 12, 0, d * 10, 3); ctx.quadraticCurveTo(d * 6, 1, d * 3, 4); ctx.closePath(); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(0, 1, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(-2, -7); ctx.lineTo(0, -3); ctx.lineTo(2, -7); ctx.lineTo(3, -3); ctx.fill();
  ctx.fillStyle = '#ff5050'; ctx.fillRect(-2, -1, 1.2, 1.2); ctx.fillRect(1, -1, 1.2, 1.2);
  ctx.restore();
}
function web(ctx, o, len, a0, a1) {
  ctx.strokeStyle = 'rgba(235,230,255,0.6)'; ctx.lineWidth = 0.7;
  for (let i = 0; i <= 5; i++) { const a = a0 + (a1 - a0) * i / 5; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + Math.cos(a) * len, o.y + Math.sin(a) * len); ctx.stroke(); }
  for (let k = 1; k <= 4; k++) {
    const rr = len * k / 4.5;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = a0 + (a1 - a0) * i / 5, x = o.x + Math.cos(a) * rr, y = o.y + Math.sin(a) * rr;
      if (!i) ctx.moveTo(x, y); else ctx.quadraticCurveTo(o.x + Math.cos(a - (a1 - a0) / 10) * rr * 0.85, o.y + Math.sin(a - (a1 - a0) / 10) * rr * 0.85, x, y);
    }
    ctx.stroke();
  }
}
/** 벽을 따라 늘어진 줄 + 깃발/전구. pts: 화면 점들, each(x, y, k) 로 매단 것을 그린다. k0: 첫 번째 것의 번호 (한 칸씩 나눈 줄) */
function garland(ctx, pts, color, each, k0 = 0) {
  ctx.strokeStyle = color; ctx.lineWidth = 0.8; ctx.beginPath();
  pts.forEach((p, i) => { if (!i) ctx.moveTo(p.x, p.y); else ctx.quadraticCurveTo((p.x + pts[i - 1].x) / 2, (p.y + pts[i - 1].y) / 2 + 7, p.x, p.y); });
  ctx.stroke();
  let k = k0;
  for (let i = 0; i < pts.length - 1; i++) for (const t of [0.2, 0.5, 0.8]) {
    const a = pts[i], b = pts[i + 1];
    each(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + 7 * 4 * t * (1 - t) * 0.5, k++);
  }
}
/** 벽 소품의 점들: 벽 앞면을 따라 len 칸. 높이는 그 벽 꼭대기 조금 아래 (it.z 가 없으면 바깥벽 높이) */
function wallPoints(it) {
  const z = (it.z || 1.6) - (it.z && it.z < 1 ? 0.04 : 0.1), off = it.rail ? 0 : it.outer || !it.z ? 0.12 : 0.08;
  return Array.from({ length: it.len + 1 }, (_, i) => (it.dir === 'h' ? P(it.x + i, it.y + off, z) : P(it.x + off, it.y + i, z)));
}
function flag(ctx, x, y, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y + 1); ctx.lineTo(x, y + 9); ctx.closePath(); ctx.fill(); }

const DRAW = {
  pumpkin(ctx, it) { const x = it.x + 0.5, y = it.y + 0.5; shadow(ctx, x, y, 0.3, 0.15, 0.22); pumpkinAt(ctx, x, y, 0, 1.1); },
  pumpkins(ctx, it) {
    const x = it.x + 0.5, y = it.y + 0.5; shadow(ctx, x, y, 0.45, 0.22, 0.22);
    pumpkinAt(ctx, x - 0.18, y - 0.15, 0, 0.8); pumpkinAt(ctx, x + 0.2, y - 0.1, 0, 0.7); pumpkinAt(ctx, x, y + 0.1, 0, 1.25);
  },
  candles(ctx, it, now) {
    for (const [dx, dy, h, s] of [[0, -0.1, 0.45, 0], [0.18, 0.05, 0.32, 1], [-0.15, 0.12, 0.25, 2]]) {
      const x = it.x + 0.5 + dx, y = it.y + 0.5 + dy;
      box(ctx, x - 0.05, y - 0.05, 0.1, 0.1, h, '#efe6d6');
      flame(ctx, P(x, y, h + 0.12), 1, now, s * 2 + it.seed);
    }
  },
  ghost(ctx, it, now) {
    const x = it.x + 0.5, y = it.y + 0.5, z = 0.8 + Math.sin(now / 700 + it.seed) * 0.15;
    shadow(ctx, x, y, 0.25, 0.12, 0.16);
    const p = P(x, y, z);
    ctx.save(); ctx.translate(p.x, p.y); if (it.seed % 2) ctx.scale(-1, 1);
    glow(ctx, { x: 0, y: -8 }, 30, '220,230,255', 0.35);
    ctx.fillStyle = '#f7f8ff'; ctx.beginPath(); ctx.moveTo(-14, 6); ctx.lineTo(-14, -12); ctx.arc(0, -12, 14, Math.PI, 0); ctx.lineTo(14, 6);
    const w = Math.sin(now / 200 + it.seed) * 1.5;
    for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(14 - i * 7 - 3.5, 12 + (i % 2 ? w : -w), 14 - (i + 1) * 7, 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#dfe3f5'; ctx.beginPath(); ctx.ellipse(6, -6, 5, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2433'; ctx.beginPath(); ctx.ellipse(-5, -13, 2.2, 3, 0, 0, Math.PI * 2); ctx.ellipse(3, -13, 2.2, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-1, -6, 2.5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,140,160,0.6)'; ctx.beginPath(); ctx.arc(-9, -9, 2, 0, Math.PI * 2); ctx.arc(7, -9, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  tombstone(ctx, it) {
    const x = it.x + 0.2, y = it.y + 0.4;
    shadow(ctx, x + 0.3, y + 0.2, 0.4, 0.2, 0.22);
    box(ctx, x, y, 0.6, 0.22, 0.65, '#8f8aa3', { top: '#a9a4bc', left: '#8f8aa3', right: '#77728a' });
    const t = P(x + 0.3, y + 0.22, 0.65); ctx.fillStyle = '#8f8aa3'; ctx.beginPath(); ctx.ellipse(t.x - 3, t.y - 2, 13, 8, -0.46, Math.PI, 0); ctx.fill();
    const m = P(x + 0.3, y + 0.23, 0.36);
    ctx.save(); ctx.translate(m.x, m.y); ctx.transform(1, -0.5, 0, 1, 0, 0); ctx.fillStyle = '#4b4660'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('RIP', 0, 0); ctx.restore();
    ctx.fillStyle = '#5a7a4a'; const gp = P(x + 0.1, y + 0.3);
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(gp.x + i * 4, gp.y); ctx.lineTo(gp.x + i * 4 + 1.5, gp.y - 6); ctx.lineTo(gp.x + i * 4 + 3, gp.y); ctx.fill(); }
  },
  cauldron(ctx, it, now) {
    const x = it.x + 0.5, y = it.y + 0.5;
    shadow(ctx, x, y, 0.5, 0.25, 0.28);
    const f = P(x, y, 0.05);
    for (const [dx, hh, col, s] of [[-8, 14, '#ff7a1a', 0], [6, 16, '#ff9a2a', 1], [0, 18, '#ffd060', 2]]) {
      const k = 1 + Math.sin(now / 110 + s * 2) * 0.15;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(f.x + dx - 5, f.y + 3); ctx.quadraticCurveTo(f.x + dx, f.y - hh * k, f.x + dx + 5, f.y + 3); ctx.fill();
    }
    const p = P(x, y, 0.45);
    ctx.fillStyle = '#2a2433'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 20, 18, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#3a3346'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 22, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7cf06a'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
    glow(ctx, { x: p.x, y: p.y - 4 }, 40, '130,255,110', 0.4);
    ctx.fillStyle = '#b8ffaa';
    for (let i = 0; i < 5; i++) { const t = ((now / 1400 + i / 5 + it.seed / 7) % 1); ctx.beginPath(); ctx.arc(p.x + ((i * 7) % 15) - 7, p.y - 2 - t * 22, 3.2 * (1 - t) + 0.6, 0, Math.PI * 2); ctx.fill(); }
  },
  bat(ctx, it, now) {
    const t = now / 1600 + it.seed;
    const x = it.x + 0.5 + Math.cos(t) * 0.7, y = it.y + 0.5 + Math.sin(t * 1.3) * 0.5, z = 2.2 + Math.sin(t * 2) * 0.15;
    batAt(ctx, P(x, y, z), 0.9, Math.sin(now / 90 + it.seed));
  },
  cobweb(ctx, it) {
    if (it.dir === 'h') web(ctx, P(it.x, it.y + 0.11, 1.6), 30, 0.2, 2.9);
    else web(ctx, P(it.x + 0.11, it.y, 1.6), 30, 0.2, 2.9);
  },
  hbunting(ctx, it) { garland(ctx, wallPoints(it), '#2a1f3a', (x, y, k) => flag(ctx, x, y, k % 2 ? '#8a4fd1' : '#ff8a1f'), it.k0); },

  // ---------- 크리스마스 ----------
  xmastree(ctx, it, now) {
    const cx = it.x + 0.5, cy = it.y + 0.5;
    shadow(ctx, cx, cy, 0.6, 0.3, 0.2);
    box(ctx, cx - 0.2, cy - 0.2, 0.4, 0.4, 0.28, '#c0392b', { top: '#d9534a' });
    const layers = [[0.28, 0.62, 0.85], [0.85, 0.5, 0.75], [1.4, 0.37, 0.65], [1.9, 0.24, 0.55]];
    layers.forEach(([z, r, h], li) => {
      const base = P(cx, cy, z), top = P(cx, cy, z + h), rx = r * 46, ry = r * 23;
      ctx.fillStyle = '#2c7343'; ctx.beginPath(); ctx.ellipse(base.x, base.y, rx, ry, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#3d8c52'; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(base.x - rx, base.y); ctx.lineTo(base.x, base.y + ry); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2f7a45'; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(base.x + rx, base.y); ctx.lineTo(base.x, base.y + ry); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(base.x - rx * 0.8, base.y - ry * 0.2); ctx.quadraticCurveTo(base.x, base.y + ry * 0.9, base.x + rx * 0.85, base.y - ry * 0.6); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const t = (i + 0.5) / 5, x = base.x + (t - 0.5) * rx * 1.5, y = base.y - ry * 0.1 + Math.sin(t * 3) * ry * 0.4;
        const on = Math.floor(now / 500 + i + li) % 3 !== 0;
        ctx.fillStyle = on ? ['#ff4d4d', '#4da6ff', '#ffd34d', '#c55bd6', '#f6f2ea'][(i + li) % 5] : '#7a6a5a';
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    });
    const t = P(cx, cy, 2.55);
    glow(ctx, t, 14, '255,220,90', 0.4 + Math.sin(now / 400) * 0.15);
    ctx.fillStyle = '#ffd34d'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 3.2 : 7.5; ctx.lineTo(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  },
  gifts(ctx, it) {
    const C = [['#f4f2ee', '#d42a32'], ['#2f7a45', '#ffd34d'], ['#d42a32', '#f4f2ee'], ['#4da6ff', '#f4f2ee']];
    const one = (x, y, w, d, h, [col, rib]) => {
      shadow(ctx, x + w / 2, y + d / 2, w * 0.6, d * 0.3, 0.15);
      box(ctx, x, y, w, d, h, col);
      faceY(ctx, x + w / 2 - 0.04, x + w / 2 + 0.04, y + d, 0, h, rib); faceX(ctx, x + w, y + d / 2 - 0.04, y + d / 2 + 0.04, 0, h, shade(rib, 0.85));
      const tp = P(x + w / 2, y + d / 2, h); ctx.fillStyle = rib;
      ctx.beginPath(); ctx.ellipse(tp.x - 3.5, tp.y - 2, 4, 2.6, -0.5, 0, Math.PI * 2); ctx.ellipse(tp.x + 3.5, tp.y - 2, 4, 2.6, 0.5, 0, Math.PI * 2); ctx.fill();
    };
    const s = it.seed;
    one(it.x + 0.15, it.y + 0.15, 0.4, 0.4, 0.38, C[s % 4]);
    one(it.x + 0.55, it.y + 0.5, 0.3, 0.3, 0.26, C[(s + 1) % 4]);
    one(it.x + 0.15, it.y + 0.6, 0.3, 0.28, 0.22, C[(s + 2) % 4]);
  },
  snowman(ctx, it) {
    const x = it.x + 0.5, y = it.y + 0.5; shadow(ctx, x, y, 0.4, 0.2, 0.2);
    const ball = (z, r) => { const p = P(x, y, z); const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.2, p.x, p.y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfd8e6'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); return p; };
    ball(0.4, 15); const m = ball(1.0, 11.5); const h = ball(1.52, 9);
    ctx.fillStyle = '#d42a32'; ctx.beginPath(); ctx.ellipse(m.x, m.y - 8, 11, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(m.x + 3, m.y - 7, 4.5, 11);
    ctx.fillStyle = '#222'; for (const dx of [-3.5, 3.5]) { ctx.beginPath(); ctx.arc(h.x + dx - 2, h.y - 2, 1.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(h.x - 2, h.y + 1); ctx.lineTo(h.x - 11, h.y + 4); ctx.lineTo(h.x - 2, h.y + 4); ctx.fill();
    ctx.fillStyle = '#2b2b30'; ctx.fillRect(h.x - 10, h.y - 8, 20, 3); ctx.fillRect(h.x - 6.5, h.y - 19, 13, 12); ctx.fillStyle = '#d42a32'; ctx.fillRect(h.x - 6.5, h.y - 10, 13, 2.2);
  },
  fireplace(ctx, it, now) {
    // 바깥벽에 붙인 두 칸짜리 돌 벽난로 (it.dir: 붙은 벽)
    const h = it.dir === 'h', x = it.x, y = it.y;
    const STONE = '#a59c90', top = '#b7afa3';
    if (h) box(ctx, x + 0.05, y + 0.1, 1.9, 0.55, 1.45, STONE, { top, left: '#958c80', right: '#857c71' });
    else box(ctx, x + 0.1, y + 0.05, 0.55, 1.9, 1.45, STONE, { top, left: '#857c71', right: '#958c80' });
    const front = (u0, u1, z0, z1, col) => (h ? faceY(ctx, x + u0, x + u1, y + 0.66, z0, z1, col) : faceX(ctx, x + 0.66, y + u0, y + u1, z0, z1, col));
    front(0.55, 1.45, 0, 0.8, '#2a1812');
    const fp = h ? P(x + 1, y + 0.55, 0.05) : P(x + 0.55, y + 1, 0.05);
    glow(ctx, { x: fp.x, y: fp.y - 8 }, 42, '255,170,70', 0.75);
    [[-9, 24, '#ff7a1a'], [7, 28, '#ff9a2a'], [-1, 33, '#ffb52e'], [0, 18, '#ffe08a'], [10, 16, '#ffd060']].forEach(([dx, hh, col], i) => {
      const k = 1 + Math.sin(now / 120 + i * 1.7) * 0.15;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fp.x + dx - 6, fp.y); ctx.quadraticCurveTo(fp.x + dx - 7, fp.y - hh * k * 0.5, fp.x + dx, fp.y - hh * k); ctx.quadraticCurveTo(fp.x + dx + 7, fp.y - hh * k * 0.5, fp.x + dx + 6, fp.y); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = '#5a3a24'; ctx.beginPath(); ctx.ellipse(fp.x - 6, fp.y + 2, 11, 3, 0.3, 0, Math.PI * 2); ctx.ellipse(fp.x + 7, fp.y + 2, 11, 3, -0.3, 0, Math.PI * 2); ctx.fill();
    if (h) box(ctx, x - 0.05, y + 0.05, 2.1, 0.72, 0.1, '#8a5a34', { z0: 1.45, top: '#a26c40' });
    else box(ctx, x + 0.05, y - 0.05, 0.72, 2.1, 0.1, '#8a5a34', { z0: 1.45, top: '#a26c40' });
    // 양말 셋
    [[0.35, '#d42a32'], [1.0, '#2f8a4f'], [1.65, '#d42a32']].forEach(([u, col]) => {
      const p = h ? P(x + u, y + 0.78, 1.42) : P(x + 0.78, y + u, 1.42);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p.x - 4.5, p.y); ctx.lineTo(p.x + 4.5, p.y - 2); ctx.lineTo(p.x + 4.5, p.y + 14); ctx.quadraticCurveTo(p.x + 11, p.y + 16, p.x + 9, p.y + 21); ctx.lineTo(p.x - 3, p.y + 20); ctx.quadraticCurveTo(p.x - 6, p.y + 18, p.x - 4.5, p.y + 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f6f2ea'; ctx.fillRect(p.x - 5.5, p.y - 3, 11, 4.5);
    });
  },
  wreath(ctx, it) {
    const p = it.dir === 'h' ? P(it.x + 0.5, it.y + 0.12, 1.2) : P(it.x + 0.12, it.y + 0.5, 1.2);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; ctx.fillStyle = i % 2 ? '#2f7a45' : '#3d8c52'; ctx.beginPath(); ctx.ellipse(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 11, 4.5, 3.6, a, 0, Math.PI * 2); ctx.fill(); }
    for (const [dx, dy, col] of [[-6, -7, '#e33'], [7, 2, '#ffd34d'], [-4, 8, '#e33'], [8, -8, '#ffd34d']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, 1.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#d42a32'; ctx.beginPath(); ctx.ellipse(p.x - 4, p.y + 11, 4.5, 2.6, -0.5, 0, Math.PI * 2); ctx.ellipse(p.x + 4, p.y + 11, 4.5, 2.6, 0.5, 0, Math.PI * 2); ctx.fill();
  },
  xlights(ctx, it, now) {
    garland(ctx, wallPoints(it), '#2e5a32', (x, y, k) => {
      const on = Math.floor(now / 600 + k) % 2 === 0, col = BULB[k % 4];
      if (on) glow(ctx, { x, y }, 8, col === '#ff4d4d' ? '255,77,77' : col === '#ffd34d' ? '255,211,77' : col === '#4dd17a' ? '77,209,122' : '77,166,255', 0.7);
      ctx.fillStyle = on ? col : shade(col, 0.55); ctx.beginPath(); ctx.ellipse(x, y + 2, 1.7, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    }, it.k0);
  },

  // ---------- 여름휴가 ----------
  beachumbrella(ctx, it) {
    const cx = it.x + 0.5, cy = it.y + 0.5;
    shadow(ctx, cx + 0.3, cy + 0.3, 0.8, 0.4, 0.16);
    const b = P(cx, cy, 0), t = P(cx, cy, 2.0);
    ctx.strokeStyle = '#8a6a48'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    const rim = P(cx, cy, 1.6);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : (it.seed % 2 ? '#22a7c4' : '#ff7a59'); ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.ellipse(rim.x, rim.y, 42, 21, 0, i * Math.PI / 4, (i + 1) * Math.PI / 4); ctx.closePath(); ctx.fill(); }
  },
  lounger(ctx, it) {
    const x = it.x, y = it.y, towel = ['#22a7c4', '#ff7a59', '#ffd34d'][it.seed % 3];
    shadow(ctx, x + 0.5, y + 0.5, 0.5, 0.3, 0.14);
    for (const [dx, dy] of [[0.12, 0.1], [0.8, 0.1], [0.12, 0.82], [0.8, 0.82]]) box(ctx, x + dx, y + dy, 0.07, 0.07, 0.22, '#ffffff');
    box(ctx, x + 0.08, y + 0.05, 0.84, 0.9, 0.05, '#ffffff', { z0: 0.22 });
    box(ctx, x + 0.14, y + 0.1, 0.72, 0.82, 0.03, towel, { z0: 0.27, top: towel });
    for (let i = 0; i < 3; i++) box(ctx, x + 0.2 + i * 0.22, y + 0.1, 0.08, 0.82, 0.004, '#ffffff', { z0: 0.3, top: 'rgba(255,255,255,0.75)' });
    poly(ctx, [P(x + 0.08, y + 0.08, 0.27), P(x + 0.92, y + 0.08, 0.27), P(x + 0.92, y - 0.05, 0.8), P(x + 0.08, y - 0.05, 0.8)], shade(towel, 0.92));
  },
  beachball(ctx, it) {
    const x = it.x + 0.5, y = it.y + 0.5, p = P(x, y, 0.2); shadow(ctx, x, y, 0.2, 0.1, 0.2);
    const C = ['#ff5a4a', '#ffffff', '#ffd34d', '#ffffff', '#22a7c4', '#ffffff'];
    for (let i = 0; i < 6; i++) { ctx.fillStyle = C[i]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, 8.5, i * Math.PI / 3 + it.seed, (i + 1) * Math.PI / 3 + it.seed); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(p.x - 3, p.y - 3, 2.4, 0, Math.PI * 2); ctx.fill();
  },
  cooler(ctx, it) {
    const x = it.x + 0.2, y = it.y + 0.28; shadow(ctx, x + 0.3, y + 0.22, 0.4, 0.2, 0.15);
    box(ctx, x, y, 0.6, 0.45, 0.4, '#22a7c4', { top: '#ffffff' });
    for (const [dx, col] of [[0.1, '#ff7a59'], [0.3, '#5ac487'], [0.45, '#ffd34d']]) { const p = P(x + dx, y + 0.15, 0.4); ctx.fillStyle = col; ctx.fillRect(p.x - 1.5, p.y - 9, 3, 9); }
  },
  floatring(ctx, it) {
    const p = P(it.x + 0.5, it.y + 0.5, 0.04); ctx.lineWidth = 5;
    for (let i = 0; i < 8; i++) { ctx.strokeStyle = i % 2 ? '#ffffff' : ['#ff8fb3', '#ffd34d', '#4da6ff'][it.seed % 3]; ctx.beginPath(); ctx.ellipse(p.x, p.y, 13, 6.5, 0, i * Math.PI / 4, (i + 1) * Math.PI / 4); ctx.stroke(); }
  },
  surfboard(ctx, it) {
    // 뒷벽에 기댄 서핑보드
    const h = it.dir !== 'v';
    const b = h ? P(it.x + 0.5, it.y + 0.4, 0.02) : P(it.x + 0.4, it.y + 0.5, 0.02);
    const t = h ? P(it.x + 0.45, it.y + 0.14, 2.0) : P(it.x + 0.14, it.y + 0.45, 2.0);
    const ang = Math.atan2(t.y - b.y, t.x - b.x), L = Math.hypot(t.x - b.x, t.y - b.y) / 2;
    const col = ['#ff7a59', '#22a7c4', '#ffd34d'][it.seed % 3];
    ctx.save(); ctx.translate((b.x + t.x) / 2, (b.y + t.y) / 2); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 7, L, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-1.2, -L + 6, 2.4, L * 2 - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-3, -L * 0.3, 1.5, L * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  pool(ctx, it) {
    const x0 = it.x + 0.1, y0 = it.y + 0.1, x1 = it.x + 1.9, y1 = it.y + 1.9;
    poly(ctx, [P(x0 - 0.08, y0 - 0.08), P(x1 + 0.08, y0 - 0.08), P(x1 + 0.08, y1 + 0.08), P(x0 - 0.08, y1 + 0.08)], '#ffffff');
    poly(ctx, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], '#3ec1e0');
    poly(ctx, [P(x0, y0), P(x1, y0), P(x1 - 0.12, y0 + 0.12), P(x0 + 0.12, y0 + 0.12)], '#2aa3c4');
    poly(ctx, [P(x0, y0), P(x0 + 0.12, y0 + 0.12), P(x0 + 0.12, y1 - 0.12), P(x0, y1)], '#2fb0d0');
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
    for (const [u, v] of [[0.6, 0.6], [1.3, 0.9], [0.8, 1.4]]) { const p = P(it.x + u, it.y + v); ctx.beginPath(); ctx.ellipse(p.x, p.y, 8, 2.6, 0, 0.2, 2.8); ctx.stroke(); }
    const d = P(it.x + 0.6, it.y + 1.3, 0.04); ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(d.x, d.y, 5.5, 3.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(d.x - 4, d.y - 4.5, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(d.x - 6.5, d.y - 4.5); ctx.lineTo(d.x - 10, d.y - 3.5); ctx.lineTo(d.x - 6.5, d.y - 3); ctx.fill();
  },
  lifebuoy(ctx, it) {
    const p = it.dir === 'h' ? P(it.x + 0.5, it.y + 0.12, 1.15) : P(it.x + 0.12, it.y + 0.5, 1.15);
    ctx.lineWidth = 5.5;
    for (let i = 0; i < 8; i++) { ctx.strokeStyle = i % 2 ? '#ffffff' : '#ff5a4a'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 8.5, 10, 0, i * Math.PI / 4, (i + 1) * Math.PI / 4); ctx.stroke(); }
  },
  bunting(ctx, it) { const C = ['#ff7a59', '#ffd34d', '#22a7c4', '#5ac487', '#e48bb4']; garland(ctx, wallPoints(it), '#6a7a80', (x, y, k) => flag(ctx, x, y, C[k % 5]), it.k0); },

  // ---------- 바닥에 까는 것 (FE-63): 바닥 캐시에 그린다 ----------
  rugweb(ctx, it) { // 거미줄 무늬 둥근 러그
    const p = P(it.x, it.y), rx = it.w * 23, ry = it.d * 11.5;
    ctx.fillStyle = 'rgba(30,18,46,0.75)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(200,190,230,0.45)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * rx, p.y + Math.sin(a) * ry); ctx.stroke(); }
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.ellipse(p.x, p.y, rx * k / 3.4, ry * k / 3.4, 0, 0, Math.PI * 2); ctx.stroke(); }
  },
  rugplaid(ctx, it) { // 빨강·초록 체크 러그
    const x0 = it.x - it.w / 2, y0 = it.y - it.d / 2, x1 = it.x + it.w / 2, y1 = it.y + it.d / 2;
    poly(ctx, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], '#b83a3a');
    const n = 6;
    for (let i = 1; i < n; i += 2) {
      const u = x0 + (x1 - x0) * i / n, v = y0 + (y1 - y0) * i / n;
      poly(ctx, [P(u - 0.07, y0), P(u + 0.07, y0), P(u + 0.07, y1), P(u - 0.07, y1)], 'rgba(47,122,69,0.75)');
      poly(ctx, [P(x0, v - 0.07), P(x1, v - 0.07), P(x1, v + 0.07), P(x0, v + 0.07)], 'rgba(47,122,69,0.75)');
    }
    ctx.strokeStyle = 'rgba(255,240,220,0.7)'; ctx.lineWidth = 1.2;
    const c = [P(x0 + 0.08, y0 + 0.08), P(x1 - 0.08, y0 + 0.08), P(x1 - 0.08, y1 - 0.08), P(x0 + 0.08, y1 - 0.08)];
    ctx.beginPath(); c.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke();
  },
  towels(ctx, it) { // 줄무늬 비치 타월 두 장
    const C = [['#ff7a59', '#ffffff'], ['#22a7c4', '#ffd34d']];
    [[-0.55, -0.1], [0.45, 0.15]].forEach(([dx, dy], k) => {
      const x0 = it.x + dx - 0.4, y0 = it.y + dy - 0.75;
      for (let i = 0; i < 5; i++) poly(ctx, [P(x0 + i * 0.16, y0), P(x0 + (i + 1) * 0.16, y0), P(x0 + (i + 1) * 0.16, y0 + 1.5), P(x0 + i * 0.16, y0 + 1.5)], C[(k + it.seed) % 2][i % 2]);
    });
  },
  fog(ctx, it) { // 바닥에 낮게 깔린 안개
    const p = P(it.x, it.y);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 70);
    g.addColorStop(0, 'rgba(220,210,245,0.32)'); g.addColorStop(1, 'rgba(220,210,245,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  // ---------- 복도 소품 (FE-63) ----------
  lantern(ctx, it, now) { // 촛불 랜턴
    const x = it.x + 0.5, y = it.y + 0.5; shadow(ctx, x, y, 0.2, 0.1, 0.18);
    box(ctx, x - 0.12, y - 0.12, 0.24, 0.24, 0.05, '#3a2a20');
    box(ctx, x - 0.1, y - 0.1, 0.2, 0.2, 0.32, 'rgba(255,220,150,0.55)', { z0: 0.05, top: '#3a2a20', left: 'rgba(255,214,140,0.6)', right: 'rgba(240,190,110,0.6)' });
    flame(ctx, P(x, y, 0.22), 0.9, now, it.seed);
    box(ctx, x - 0.13, y - 0.13, 0.26, 0.26, 0.04, '#3a2a20', { z0: 0.37 });
  },
  torch(ctx, it, now) { // 대나무 횃불
    const x = it.x + 0.5, y = it.y + 0.5; shadow(ctx, x, y, 0.18, 0.09, 0.18);
    box(ctx, x - 0.035, y - 0.035, 0.07, 0.07, 1.2, '#b58b5a', { top: '#c99d6a' });
    box(ctx, x - 0.07, y - 0.07, 0.14, 0.14, 0.14, '#8a6a48', { z0: 1.2 });
    const f = P(x, y, 1.42), k = 1 + Math.sin(now / 100 + it.seed) * 0.15;
    glow(ctx, f, 22, '255,170,70', 0.5);
    ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(f.x - 5, f.y + 4); ctx.quadraticCurveTo(f.x, f.y - 14 * k, f.x + 5, f.y + 4); ctx.fill();
    ctx.fillStyle = '#ffd060'; ctx.beginPath(); ctx.moveTo(f.x - 2.5, f.y + 4); ctx.quadraticCurveTo(f.x, f.y - 7 * k, f.x + 2.5, f.y + 4); ctx.fill();
  },
};

/** 소품 하나 그리기 */
export function drawDecor(ctx, it, now = 0) {
  const fn = DRAW[it.type];
  if (fn) fn(ctx, it, now);
}

/** 깊이 정렬용 상자 (타일 단위). 벽 소품은 벽 앞면에 바닥까지 얇은 판으로 (벽 조각처럼), 나는 것은 높이.
 *  벽 소품을 공중에 띄우면 그 아래 낮은 가구보다 "위 = 앞" 이 되어 정렬에 순환이 생기고, 순환에 걸린 캐릭터는 줄 뒤로 그려진다 (FE-65) */
export function decorBox(it) {
  const z1 = DECOR_HEIGHT[it.type] || 1;
  if (it.kind === 'wall') {
    const len = it.len || 1, z0 = 0;
    if (it.z) return it.dir === 'h' ? { x0: it.x, y0: it.y + 0.07, x1: it.x + len, y1: it.y + 0.12, z0, z1: it.z + 0.05 } : { x0: it.x + 0.07, y0: it.y, x1: it.x + 0.12, y1: it.y + len, z0, z1: it.z + 0.05 };
    return it.dir === 'h' ? { x0: it.x, y0: it.y + 0.11, x1: it.x + len, y1: it.y + 0.16, z0, z1 } : { x0: it.x + 0.11, y0: it.y, x1: it.x + 0.16, y1: it.y + len, z0, z1 };
  }
  if (it.kind === 'air') return { x0: it.x - 0.3, y0: it.y - 0.1, x1: it.x + 1.3, y1: it.y + 1.1, z0: 1.9, z1 };
  const w = it.w || 1, d = it.d || 1;
  return { x0: it.x + 0.12, y0: it.y + 0.12, x1: it.x + w - 0.12, y1: it.y + d - 0.12, z0: 0, z1 };
}
