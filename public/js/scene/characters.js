// 캐릭터 v2: Kenney Mini Characters (CC0, www.kenney.nl) 를 사무실 카메라로 구운 스프라이트 시트.
// 시트는 scripts/bake-characters 로 다시 만든다. 한 장에 한 명, 행마다 동작 하나.
// 커스텀 캐릭터(FE-56): 사용자가 올린 배경 없는 그림 한 장. 값은 'custom:<id>', 그림은 setCustomCharacters 로 받는다.

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

/** 'custom:<id>' 꼴인지. id 는 소문자·숫자 */
export function isCustomCharacter(v) {
  return typeof v === 'string' && /^custom:[a-z0-9]{1,32}$/.test(v);
}

/** 저장값 → 캐릭터 이름, 'custom:<id>' 또는 'auto'. 모르는 값은 기본값 (커스텀이 아직 있는지는 avatarStore 가 본다) */
export function normalizeCharacter(v, fallback = 'auto') {
  return v === 'auto' || CHARACTERS.includes(v) || isCustomCharacter(v) ? v : fallback;
}

/** 'auto' 를 키(세션/에이전트) 해시로 풀어 12명 중 하나로. 같은 세션은 어느 브라우저에서도 같은 캐릭터. 커스텀은 자동에 섞지 않는다 */
export function resolveCharacter(v, key = '') {
  if (CHARACTERS.includes(v) || isCustomCharacter(v)) return v;
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

// 머리 꼭대기 y 와 그 근처 가운데 x. 안전모를 머리에 맞춰 얹는 데 쓴다
/** 알파 data(가로 stride) 의 (x0, y0) 부터 W×H 칸에서: 팔·목발은 빼고 몸통 쪽(가로 20~80%)의 첫 불투명 줄과 그 아래 band 줄의 가운데 x. 없으면 null */
export function scanHead(data, stride, x0, y0, W, H, band = 24) {
  const opaque = (x, y) => data[((y0 + y) * stride + x0 + x) * 4 + 3] > 128;
  const XA = Math.round(W * 0.2), XB = Math.max(XA + 1, Math.round(W * 0.8));
  let top = -1;
  for (let y = 0; y < H && top < 0; y++) for (let x = XA; x < XB; x++) if (opaque(x, y)) { top = y; break; }
  if (top < 0) return null;
  let sum = 0, n = 0;
  for (let y = top; y < Math.min(H, top + band); y++) for (let x = XA; x < XB; x++) if (opaque(x, y)) { sum += x; n++; }
  return { top, cx: n ? sum / n : W / 2 };
}
function pixelsOf(im) {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(im, 0, 0);
  return cx.getImageData(0, 0, c.width, c.height).data;
}
const heads = new Map(); // name → [[{ top, cx }]] (행·칸)
const HEAD_FALLBACK = { top: SHEET.FOOT - SHEET.HEIGHT * 0.92, cx: SHEET.W / 2 };
function headOf(name, im, row, col) {
  let h = heads.get(name);
  if (!h) {
    h = null;
    try {
      const { W, H, ROWS } = SHEET;
      const data = pixelsOf(im);
      h = ROWS.map((r, ri) => Array.from({ length: r.frames }, (_, ci) => scanHead(data, im.naturalWidth, ci * W, ri * H, W, H) || HEAD_FALLBACK));
    } catch { h = null; }
    heads.set(name, h);
  }
  return (h && h[row] && h[row][col]) || HEAD_FALLBACK;
}

// ---------- 커스텀 캐릭터 (한 장짜리 그림) ----------
const customs = new Map(); // 'custom:<id>' → { src, im, head }
/** 커스텀 그림 목록을 받는다 ([{ id, src }]). 같은 id·src 는 불러 둔 Image 를 그대로 쓴다 */
export function setCustomCharacters(list) {
  const keep = new Set();
  for (const c of list || []) {
    const key = `custom:${c.id}`;
    if (!isCustomCharacter(key) || typeof c.src !== 'string') continue;
    keep.add(key);
    const cur = customs.get(key);
    if (!cur || cur.src !== c.src) customs.set(key, { src: c.src, im: null, head: undefined });
  }
  for (const k of [...customs.keys()]) if (!keep.has(k)) customs.delete(k);
}
function customOf(name) {
  const c = customs.get(name);
  if (!c || typeof Image === 'undefined') return null;
  if (!c.im) { c.im = new Image(); c.im.src = c.src; }
  return c.im.complete && c.im.naturalWidth && c.im.naturalHeight ? c : null;
}
function customHead(c) {
  if (c.head === undefined) {
    const { naturalWidth: w, naturalHeight: h } = c.im;
    try { c.head = scanHead(pixelsOf(c.im), w, 0, 0, w, h, Math.max(4, Math.round(h * 0.12))); } catch { c.head = null; }
    if (!c.head) c.head = { top: 0, cx: w / 2 };
  }
  return c.head;
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
  if (isCustomCharacter(name)) return drawCustom(ctx, fx, fy, name, o);
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

/**
 * 커스텀 그림 그리기: 발(그림 아래 가운데)을 (fx, fy)에, 키 OFFICE_HEIGHT (너무 넓은 그림은 너비 1.2배까지).
 * 정지 그림이라 동작은 몸 전체를 움직여 보인다: 걷기 = 걸음마다 통통 + 살짝 기울기, 앉기 = 낮게, 타이핑 = 잔떨림, 끄덕임 = 숙였다 펴기, 서기 = 숨쉬기
 */
function drawCustom(ctx, fx, fy, name, o) {
  const c = customOf(name);
  if (!c) return false;
  const { naturalWidth: w, naturalHeight: h } = c.im;
  const k = Math.min(OFFICE_HEIGHT / h, OFFICE_HEIGHT * 1.2 / w) * (o.scale || 1);
  const s = h * k / OFFICE_HEIGHT; // 그려진 키 / 사무실 키 (안전모·움직임 배율)
  const now = o.now || 0, seed = o.seed || 0;
  let lift = 0, tilt = 0, sx = 1, sy = 1;
  if (o.walking) {
    const p = (o.walkT || 0) * 9;
    lift = Math.abs(Math.sin(p)) * 3 * s;
    tilt = Math.sin(p) * 0.06;
  } else if (o.sitting) {
    sy = 0.86; sx = 1.04;
  } else if (o.typing) {
    lift = Math.abs(Math.sin(now / 90 + seed)) * 0.9 * s;
    tilt = Math.sin(now / 160 + seed) * 0.015;
  } else if (o.nod) {
    const p = Math.max(0, Math.sin(now / 220 + seed));
    sy = 1 - p * 0.06; tilt = p * 0.05;
  } else {
    sy = 1 + Math.sin(now / 600 + seed) * 0.012;
  }
  ctx.save();
  ctx.translate(fx, fy - lift);
  ctx.rotate(o.faceRight ? -tilt : tilt);
  ctx.scale((o.faceRight ? -1 : 1) * sx, sy);
  ctx.drawImage(c.im, -w * k / 2, -h * k, w * k, h * k);
  if (o.hardHat) { // 뒤집힌 좌표 안에서 그리므로 모자도 그림과 함께 뒤집힌다
    const head = customHead(c);
    drawHardHat(ctx, (head.cx - w / 2) * k, (head.top - h) * k, s, false);
  }
  ctx.restore();
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
