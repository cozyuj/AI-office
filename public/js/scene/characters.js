// 캐릭터 v2: Kenney Mini Characters (CC0, www.kenney.nl) 를 사무실 카메라로 구운 스프라이트 시트.
// 시트는 scripts/bake-characters 로 다시 만든다. 한 장에 한 명, 행마다 동작 하나.

export const CHARACTERS = [
  'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f',
  'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f',
];

// 프레임 W×H, 발 가운데가 (W/2, FOOT), 머리 꼭대기까지 HEIGHT px. 굽기 스크립트도 이 값을 쓴다
export const SHEET = {
  W: 224, H: 248, FOOT: 200, HEIGHT: 200,
  ROWS: [
    { id: 'idle', anim: 'idle', frames: 4 },
    { id: 'walk', anim: 'walk', frames: 8 },
    { id: 'sit', anim: 'sit', frames: 1, at: 0.5, lift: 0.28 },
    { id: 'type', anim: 'interact-right', frames: 4 },
    { id: 'nod', anim: 'emote-yes', frames: 4 },
  ],
};
const ROW = Object.fromEntries(SHEET.ROWS.map((r, i) => [r.id, { i, n: r.frames }]));

/** 사무실 배율 1 에서 캐릭터 키(px). 바닥 타일 64×32 에 맞춘 값 */
export const OFFICE_HEIGHT = 60;

export const DEFAULTS = { me: 'male-a', claude: 'auto', sub: 'auto' };

/** 저장값 → 캐릭터 이름 또는 'auto'. 모르는 값은 기본값 */
export function normalizeCharacter(v, fallback = 'auto') {
  return v === 'auto' || CHARACTERS.includes(v) ? v : fallback;
}

/** 'auto' 를 키(세션/에이전트) 해시로 풀어 12명 중 하나로. 같은 세션은 어느 브라우저에서도 같은 캐릭터 */
export function resolveCharacter(v, key = '') {
  if (CHARACTERS.includes(v)) return v;
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CHARACTERS[h % CHARACTERS.length];
}

// ---------- 시트 불러오기 (브라우저에서만) ----------
const sheets = new Map(); // name → HTMLImageElement
function sheetOf(name) {
  if (typeof Image === 'undefined') return null; // Node 테스트
  let im = sheets.get(name);
  if (!im) {
    im = new Image();
    im.src = new URL(`../../assets/characters/${name}.webp`, import.meta.url).href;
    sheets.set(name, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}

// 칸마다 머리 꼭대기 y 와 그 근처 가운데 x (시트 픽셀). 안전모를 머리에 맞춰 얹는 데 쓴다
const heads = new Map(); // name → [[{ top, cx }]] (행·칸)
const HEAD_FALLBACK = { top: SHEET.FOOT - SHEET.HEIGHT * 0.92, cx: SHEET.W / 2 };
function headOf(name, im, row, col) {
  let h = heads.get(name);
  if (!h) {
    h = null;
    try {
      const { W, H, ROWS } = SHEET;
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(im, 0, 0);
      const data = cx.getImageData(0, 0, c.width, c.height).data;
      const opaque = (x, y) => data[(y * c.width + x) * 4 + 3] > 128;
      const XA = Math.round(W * 0.2), XB = Math.round(W * 0.8); // 팔·목발은 빼고 몸통 쪽만
      h = ROWS.map((r, ri) => Array.from({ length: r.frames }, (_, ci) => {
        const x0 = ci * W, y0 = ri * H;
        let top = -1;
        for (let y = 0; y < H && top < 0; y++) for (let x = XA; x < XB; x++) if (opaque(x0 + x, y0 + y)) { top = y; break; }
        if (top < 0) return HEAD_FALLBACK;
        let sum = 0, n = 0;
        for (let y = top; y < Math.min(H, top + 24); y++) for (let x = XA; x < XB; x++) if (opaque(x0 + x, y0 + y)) { sum += x; n++; }
        return { top, cx: n ? sum / n : W / 2 };
      }));
    } catch { h = null; }
    heads.set(name, h);
  }
  return (h && h[row] && h[row][col]) || HEAD_FALLBACK;
}
/** 미리 불러 두기 (첫 프레임에 빈 캐릭터가 덜 보이게) */
export function preloadCharacters() { for (const n of CHARACTERS) sheetOf(n); }

/**
 * 상태 → 시트의 행·칸.
 * o: { walking, walkT(초), sitting, typing, nod, now(ms), seed }
 */
export function frameOf(o) {
  const now = o.now || 0, seed = o.seed || 0;
  if (o.walking) return { row: ROW.walk.i, col: Math.floor((o.walkT || 0) * 9 / (Math.PI * 2) * ROW.walk.n) % ROW.walk.n };
  if (o.sitting) return { row: ROW.sit.i, col: 0 };
  if (o.typing) return { row: ROW.type.i, col: Math.floor(now / 160 + seed) % ROW.type.n };
  if (o.nod) return { row: ROW.nod.i, col: Math.floor(now / 220 + seed) % ROW.nod.n };
  return { row: ROW.idle.i, col: Math.floor(now / 320 + seed) % ROW.idle.n };
}

/**
 * 발 가운데 (fx, fy) 에 캐릭터를 그린다. 시트가 아직 없으면 false.
 * o: frameOf 의 값 + { faceRight, scale(1 = 사무실 크기), hardHat }
 */
export function drawCharacter(ctx, fx, fy, name, o = {}) {
  const im = sheetOf(name);
  if (!im) return false;
  const { W, H, FOOT, HEIGHT } = SHEET;
  const k = OFFICE_HEIGHT / HEIGHT * (o.scale || 1);
  const { row, col } = frameOf(o);
  ctx.save();
  ctx.translate(fx, fy);
  if (o.faceRight) ctx.scale(-1, 1); // 모델은 화면 왼쪽 아래를 본다
  ctx.drawImage(im, col * W, row * H, W, H, -W * k / 2, -FOOT * k, W * k, H * k);
  ctx.restore();
  if (o.hardHat) {
    const head = headOf(name, im, row, col);
    const dx = (head.cx - W / 2) * k * (o.faceRight ? -1 : 1);
    drawHardHat(ctx, fx + dx, fy + (head.top - FOOT) * k, k * HEIGHT / OFFICE_HEIGHT, o.faceRight);
  }
  return true;
}

/** 서브에이전트 표시: 머리에 노란 안전모. top 은 머리 꼭대기(머리카락 포함), s 는 배율 */
function drawHardHat(ctx, x, top, s, faceRight) {
  ctx.save();
  ctx.translate(x, top + 8 * s);
  if (faceRight) ctx.scale(-1, 1);
  ctx.fillStyle = '#f2b51d';
  ctx.beginPath(); ctx.ellipse(0, 0, 15 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();              // 챙
  ctx.beginPath(); ctx.ellipse(0, -1 * s, 11 * s, 9.5 * s, 0, Math.PI, 0); ctx.fill();           // 돔
  ctx.fillStyle = '#d99a0b';
  ctx.fillRect(-1.4 * s, -10.2 * s, 2.8 * s, 9 * s);                                              // 가운데 골
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(-5 * s, -5.5 * s, 2.6 * s, 1.6 * s, -0.5, 0, Math.PI * 2); ctx.fill(); // 광
  ctx.restore();
}
