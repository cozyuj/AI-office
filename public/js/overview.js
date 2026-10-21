// 전체 보기: 층들을 건물처럼 세로로 쌓아 한눈에. 층마다 미니 사무실(정적 레이어 캐시) + 캐릭터 점 + 세션 수·상태.
import { GRID, project, worldBounds, layoutOfPreset } from './scene/map.js';
import { buildLayout } from './scene/layouts.js';
import { drawFloor, drawEntities, roundRect, withFloorStyle } from './scene/render.js';
import { palette, DEFAULT_PRESET } from './scene/floorStyle.js';
import { tr } from './i18n.js';

const MINI_SCALE = 0.5;     // 미니 사무실 캐시 해상도 (월드 1px → 0.5px)
const STRIDE = 0.8;         // 층 간격 (이미지 높이 대비) — 살짝 겹쳐 건물처럼
const STATUS_COLOR = { waiting: '#e5484d', working: '#35b36b', thinking: '#e2a21a', idle: '#b3b9c2' };
const STATUS_LABEL = { waiting: '답 기다림', working: '작업 중', thinking: '생각 중', idle: '조용함' };

export function createOverview(canvas, store, { onPick, styleOf } = {}) {
  const ctx = canvas.getContext('2d');
  let visible = false;
  let mini = null;            // { canvas, x0, y0, w, h } 월드 좌표계 기준 — 가장 최근에 쓴 것 (크기 계산용)
  const minis = new Map();    // presetId → mini. 층마다 인테리어 프리셋(FE-34)이 달라 프리셋별로 한 장씩 캐시한다
  let layout = [];            // [{ floor, ox, oy, w, h, s }] 그린 순서(아래층 → 위층)
  let hover = null;           // floor id
  let theme = 'light';

  /** 바닥 + 가구·벽을 한 장에 그려 둔다 (캐릭터 없음). 테마가 바뀌면 invalidate() */
  function buildMini(presetId) {
    const b = worldBounds();
    const pad = 6;
    const x0 = b.x0 - pad, y0 = b.y0 - pad, w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * MINI_SCALE); c.height = Math.ceil(h * MINI_SCALE);
    const g = c.getContext('2d');
    g.scale(MINI_SCALE, MINI_SCALE); g.translate(-x0, -y0);
    withFloorStyle(presetId, () => { drawFloor(g, MINI_SCALE); drawEntities(g, 0, [], MINI_SCALE); });
    const m = { canvas: c, x0, y0, w, h, preset: presetId };
    minis.set(presetId, m);
    return m;
  }
  const presetOf = (f) => (styleOf ? styleOf(f) : DEFAULT_PRESET) || DEFAULT_PRESET;
  /** 프리셋별 미니 사무실. 없으면 그 자리에서 한 장 그린다 (프리셋 수만큼만 생긴다) */
  function miniFor(presetId) { return minis.get(presetId) || buildMini(presetId); }
  function invalidate() { mini = null; minis.clear(); }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  /** 바닥 네 모서리(월드) */
  function groundPoly() {
    return [project(GRID.x0, GRID.y0), project(GRID.x1 + 1, GRID.y0), project(GRID.x1 + 1, GRID.y1 + 1), project(GRID.x0, GRID.y1 + 1)];
  }
  function tracePoly(poly, ox, oy, s, dy = 0) {
    ctx.beginPath();
    poly.forEach((p, i) => { const x = ox + (p.x - mini.x0) * s, y = oy + (p.y - mini.y0) * s + dy; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
  }

  function frame(now) {
    if (!visible) return;
    const { width, height } = resize();
    const dark = theme === 'dark';
    ctx.fillStyle = dark ? '#1e2229' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const floors = store.floorsByNo();          // 높은 층 먼저
    const n = floors.length;
    layout = [];
    if (!n) return;
    mini = miniFor(presetOf(floors[0]));
    const margin = 28;
    const sW = (width - margin * 2) / mini.w;
    const sH = (height - margin * 2) / (mini.h * (1 + STRIDE * (n - 1)));
    const s = Math.max(0.08, Math.min(sW, sH, 0.6));
    const w = mini.w * s, h = mini.h * s, stride = h * STRIDE;
    const totalH = h + stride * (n - 1);
    const ox = (width - w) / 2, top = (height - totalH) / 2;
    const poly = groundPoly();
    const thick = Math.max(5, 16 * s);

    // 아래층부터 그려 위층이 앞에 오게
    for (let i = n - 1; i >= 0; i--) {
      const f = floors[i];
      const oy = top + stride * i;
      layout.push({ floor: f, ox, oy, w, h, s });
      const selected = f.id === store.selectedFloorId, hovered = f.id === hover;
      // 슬래브 (바닥 두께)
      tracePoly(poly, ox, oy, s, thick);
      ctx.fillStyle = dark ? '#343b47' : '#cfd4dc'; ctx.fill();
      tracePoly(poly, ox, oy, s, 0);
      ctx.fillStyle = dark ? '#2a3039' : '#e9ecf0'; ctx.fill();
      // 미니 사무실 (층의 인테리어 프리셋으로)
      const preset = presetOf(f);
      ctx.drawImage(miniFor(preset).canvas, ox, oy, w, h);
      const pal = palette(preset, theme);
      const L = buildLayout(layoutOfPreset(preset)); // 이 층의 레이아웃 (방 위치·슬롯이 층마다 다르다)
      // 캐릭터 점
      const roomCount = {};
      for (const { agent, session } of store.agentsOfFloor(f.id)) {
        const slots = L.slots[agent.room] || L.slots.lobby;
        const k = roomCount[agent.room] = (roomCount[agent.room] || 0);
        roomCount[agent.room]++;
        const [tx, ty] = slots[k % slots.length];
        const p = project(tx + 0.5, ty + 0.5, 0.9);
        const x = ox + (p.x - mini.x0) * s, y = oy + (p.y - mini.y0) * s;
        const r = Math.max(4, 12 * s);
        if (session.status === 'waiting') {
          const pulse = 1 + 0.35 * Math.sin(now / 180);
          ctx.beginPath(); ctx.arc(x, y, r * 1.9 * pulse, 0, Math.PI * 2); ctx.fillStyle = 'rgba(229,72,77,0.28)'; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = store.colorOf(session, agent); ctx.fill();
        ctx.lineWidth = Math.max(1, 2 * s); ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      // 선택/호버 테두리
      if (selected || hovered) {
        tracePoly(poly, ox, oy, s, 0);
        ctx.lineWidth = selected ? 2.5 : 1.5; ctx.strokeStyle = selected ? '#e8683a' : (dark ? '#8b93a1' : '#9aa3ad');
        ctx.setLineDash(selected ? [] : [5, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
      // 라벨 (왼쪽 위 빈 공간)
      const sessions = store.sessionsOfFloor(f.id);
      const status = store.floorStatus(f.id);
      const waiting = store.waitingOfFloor(f.id).length;
      const fname = tr(f.name);
      const name = fname.length > 22 ? fname.slice(0, 21) + '…' : fname;
      ctx.font = '700 12px D2Coding, NanumSquare, system-ui, sans-serif';
      const nameW = ctx.measureText(name).width;
      ctx.font = '11px D2Coding, NanumSquare, system-ui, sans-serif';
      const meta = tr(`세션 ${sessions.length}개 · ${STATUS_LABEL[status]}${waiting ? ` · ${waiting}명 대기` : ''}`);
      const metaW = ctx.measureText(meta).width;
      const bw = Math.max(nameW, metaW) + 62, bh = 40;
      const lx = ox + 8, ly = oy + 6;
      roundRect(ctx, lx, ly, bw, bh, 8);
      ctx.fillStyle = dark ? 'rgba(30,34,41,0.92)' : 'rgba(255,255,255,0.92)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = selected ? '#e8683a' : (dark ? '#2c3139' : '#e3e6ea'); ctx.stroke();
      roundRect(ctx, lx + 8, ly + 9, 28, 22, 6);
      ctx.fillStyle = selected ? '#e8683a' : (dark ? '#343b47' : pal.rooms.lounge.alt); ctx.fill();
      if (!selected) { ctx.lineWidth = 1; ctx.strokeStyle = pal.accent.sofa; ctx.stroke(); } // 프리셋 강조색 테두리
      ctx.fillStyle = selected ? '#fff' : (dark ? '#e6e8ec' : pal.accent.text);
      ctx.font = '700 11px D2Coding, NanumSquare, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${f.no}F`, lx + 22, ly + 20);
      ctx.textAlign = 'left';
      ctx.fillStyle = dark ? '#e6e8ec' : '#1f2328';
      ctx.font = '700 12px D2Coding, NanumSquare, system-ui, sans-serif'; ctx.fillText(name, lx + 44, ly + 14);
      ctx.fillStyle = dark ? '#8b93a1' : '#7a828c';
      ctx.font = '11px D2Coding, NanumSquare, system-ui, sans-serif'; ctx.fillText(meta, lx + 44 + 12, ly + 28);
      ctx.beginPath(); ctx.arc(lx + 48, ly + 28, 3.5, 0, Math.PI * 2); ctx.fillStyle = STATUS_COLOR[status]; ctx.fill();
    }
    ctx.textBaseline = 'alphabetic';
  }

  /** 화면 좌표 → 층 (위층 우선) */
  function floorAt(sx, sy) {
    if (!mini) return null;
    for (let i = layout.length - 1; i >= 0; i--) {
      const L = layout[i];
      if (sx < L.ox || sx > L.ox + L.w || sy < L.oy || sy > L.oy + L.h) continue;
      // 마름모 안쪽인지 (바닥 폴리곤)
      const u = (sx - L.ox) / L.s + mini.x0, v = (sy - L.oy) / L.s + mini.y0;
      const poly = groundPoly();
      let inside = false;
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const pa = poly[a], pb = poly[b];
        if ((pa.y > v) !== (pb.y > v) && u < ((pb.x - pa.x) * (v - pa.y)) / (pb.y - pa.y) + pa.x) inside = !inside;
      }
      if (inside) return L.floor;
    }
    return null;
  }
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const f = floorAt(e.clientX - r.left, e.clientY - r.top);
    hover = f ? f.id : null;
    canvas.style.cursor = f ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const f = floorAt(e.clientX - r.left, e.clientY - r.top);
    if (f) { store.selectFloor(f.id); if (onPick) onPick(f); }
  });

  function setVisible(v) { visible = !!v; canvas.classList.toggle('hidden', !visible); }
  return {
    frame, invalidate,
    setTheme: (t) => { theme = t; invalidate(); },
    show: () => setVisible(true), hide: () => setVisible(false), toggle: () => setVisible(!visible),
    get visible() { return visible; },
  };
}
