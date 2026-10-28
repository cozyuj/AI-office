// 캐릭터 v2: Kenney Mini Characters (CC0, www.kenney.nl) 를 사무실 카메라로 구운 스프라이트 시트.
// 시트는 scripts/bake-characters 로 다시 만든다. 한 장에 한 명, 행마다 동작 하나.
// 커스텀 캐릭터(FE-56): 사용자가 올린 배경 없는 그림 한 장. 값은 'custom:<id>', 그림은 setCustomCharacters 로 받는다.
// 파트 조합(FE-57): 머리·몸통 레이어를 따로 그려 섞고, 마스크로 머리카락·상의·하의 색을 바꾸고, 얼굴 소품을 얹는다.
//   값은 'mix:<머리>.<몸통>.<머리카락색>.<상의색>.<하의색>.<소품>' (색은 6자리 hex 또는 '-', 소품은 ACCESSORIES 의 id 또는 '-')

export const CHARACTERS = [
  'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f',
  'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f',
];

// 프레임 W×H, 발 가운데가 (W/2, FOOT), 가장 큰 캐릭터의 머리 꼭대기까지 HEIGHT px (모두 같은 배율). 굽기 스크립트도 이 값을 쓴다.
// <이름>.webp = 머리 레이어 행들 + 몸통 레이어 행들, <이름>.mask.webp = 머리카락·상의·하의 음영 행들 (MASK_BASE = 흰 알베도 대신 쓴 밝기)
export const SHEET = {
  W: 224, H: 248, FOOT: 200, HEIGHT: 200, MASK_BASE: 0.4,
  PARTS: ['head', 'body'],
  MASKS: [{ id: 'hair', part: 'head' }, { id: 'top', part: 'body' }, { id: 'bottom', part: 'body' }],
  ROWS: [
    { id: 'idle', anim: 'idle', frames: 4 },
    { id: 'walk', anim: 'walk', frames: 8 },
    { id: 'sit', anim: 'sit', frames: 1, at: 0.5, lift: 0.28 },
    { id: 'type', anim: 'interact-right', frames: 4 },
    { id: 'nod', anim: 'emote-yes', frames: 4 },
  ],
};
const ROW = Object.fromEntries(SHEET.ROWS.map((r, i) => [r.id, { i, n: r.frames }]));

// 얼굴 소품 (Kenney 팩의 aid-*): 머리 뼈 기준 위치 at 에 붙여 acc-<id>.webp 로 굽는다.
// draw: 굽지 않고 프레임마다 머리 위치에 직접 그리는 코스튬 (FE-62)
export const ACCESSORIES = [
  { id: 'glasses', label: '안경', glb: 'aid-glasses', at: [0, 0.085, 0.08] },
  { id: 'sunglasses', label: '선글라스', glb: 'aid-sunglasses', at: [0, 0.085, 0.08] },
  { id: 'mask', label: '마스크', glb: 'aid-mask', at: [0, 0, 0] },
  { id: 'hearing', label: '보청기', glb: 'aid_hearing', at: [0.23, 0.08, 0] },
  { id: 'santa', label: '산타 모자', draw: true },
  { id: 'antlers', label: '루돌프 뿔', draw: true },
  { id: 'pumpkin', label: '호박 탈', draw: true },
];

// 테마 캐릭터 (FE-62): Kenney Graveyard Kit · Holiday Kit (CC0). 시트 모양은 12명과 같다 (머리 행 + 몸통 행, 마스크 없음 → 색 바꾸기 없음).
// mix: 머리·몸을 다른 캐릭터와 섞을 수 있다. still: 동작이 없는 정지 모델 — 올린 그림처럼 몸 전체를 움직여 보인다
export const SPECIALS = [
  { id: 'vampire', label: '뱀파이어', kit: 'graveyard', glb: 'character-vampire', mix: true },
  { id: 'zombie', label: '좀비', kit: 'graveyard', glb: 'character-zombie', mix: true },
  { id: 'skeleton', label: '해골', kit: 'graveyard', glb: 'character-skeleton', mix: true },
  { id: 'ghost', label: '유령', kit: 'graveyard', glb: 'character-ghost' },
  { id: 'snowman', label: '눈사람', kit: 'holiday', glb: 'snowman-hat', still: true },
  { id: 'reindeer', label: '루돌프', kit: 'holiday', glb: 'reindeer', still: true },
];
const SPECIAL_IDS = SPECIALS.map((c) => c.id);
const STILL = new Set(SPECIALS.filter((c) => c.still).map((c) => c.id));
/** 머리·몸으로 섞을 수 있는 캐릭터: 12명 + 테마 캐릭터 중 mix */
export const MIX_PARTS = [...CHARACTERS, ...SPECIALS.filter((c) => c.mix).map((c) => c.id)];

/** 사무실 배율 1 에서 캐릭터 키(px). 바닥 타일 64×32 에 맞춘 값 */
export const OFFICE_HEIGHT = 60;

export const DEFAULTS = { me: 'male-a', claude: 'auto', sub: 'auto' };

/** 'custom:<id>' 꼴인지. id 는 소문자·숫자 */
export function isCustomCharacter(v) {
  return typeof v === 'string' && /^custom:[a-z0-9]{1,32}$/.test(v);
}

// ---------- 파트 조합 ----------
export const LOOK_PARTS = ['hair', 'top', 'bottom'];
const HEX = /^[0-9a-f]{6}$/;
/** 'male-a' 또는 'mix:...' → { head, body, hair, top, bottom, acc } (색·소품은 없으면 null). 아니면 null */
export function parseLook(v) {
  if (CHARACTERS.includes(v) || SPECIAL_IDS.includes(v)) return { head: v, body: v, hair: null, top: null, bottom: null, acc: null };
  if (typeof v !== 'string' || !v.startsWith('mix:')) return null;
  const [head, body, hair, top, bottom, acc, ...rest] = v.slice(4).split('.');
  // 섞을 수 없는 테마 캐릭터(유령·눈사람·순록)는 머리=몸일 때만 (코스튬은 씌울 수 있다)
  const whole = SPECIAL_IDS.includes(head) && head === body;
  if (rest.length || !((MIX_PARTS.includes(head) && MIX_PARTS.includes(body)) || whole)) return null;
  const color = (c) => (c === '-' ? null : HEX.test(c) ? c : undefined);
  const look = { head, body, hair: color(hair), top: color(top), bottom: color(bottom), acc: acc === '-' ? null : ACCESSORIES.some((a) => a.id === acc) ? acc : undefined };
  return Object.values(look).includes(undefined) ? null : look;
}
/** 조합 → 저장값. 바꾼 게 없으면 캐릭터 이름 그대로 */
export function lookValue(l) {
  if (l.head === l.body && !l.hair && !l.top && !l.bottom && !l.acc) return l.head;
  return `mix:${l.head}.${l.body}.${l.hair || '-'}.${l.top || '-'}.${l.bottom || '-'}.${l.acc || '-'}`;
}
const isLook = (v) => parseLook(v) !== null;

/** 저장값 → 캐릭터 이름, 'mix:...', 'custom:<id>' 또는 'auto'. 모르는 값은 기본값 (커스텀이 아직 있는지는 avatarStore 가 본다) */
export function normalizeCharacter(v, fallback = 'auto') {
  if (v === 'auto' || isCustomCharacter(v)) return v;
  const l = parseLook(v);
  return l ? lookValue(l) : fallback;
}

/** 'auto' 를 키(세션/에이전트) 해시로 풀어 12명 중 하나로. 같은 세션은 어느 브라우저에서도 같은 캐릭터. 커스텀은 자동에 섞지 않는다 */
export function resolveCharacter(v, key = '') {
  if (isLook(v) || isCustomCharacter(v)) return v;
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CHARACTERS[h % CHARACTERS.length];
}

// ---------- 시트 불러오기 (브라우저에서만) ----------
const sheets = new Map(); // 파일 이름 → HTMLImageElement
function imageOf(file) {
  if (typeof Image === 'undefined') return null; // Node 테스트
  let im = sheets.get(file);
  if (!im) {
    im = new Image();
    im.src = new URL(`../../assets/characters/${file}.webp`, import.meta.url).href;
    sheets.set(file, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
const sheetOf = (name) => imageOf(name);            // 머리 행들 + 몸통 행들
const maskOf = (name) => imageOf(`${name}.mask`);   // 머리카락·상의·하의 음영 행들
const accOf = (id) => imageOf(`acc-${id}`);

// 색 바꾸기: 레이어(머리 또는 몸통 행 묶음)를 복사해 마스크 음영 × 새 색으로 칠한다 (선형 색공간). 같은 조합은 캐시
const PART_ROWS = SHEET.ROWS.length;
const LIN = Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const SRGB = Array.from({ length: 4096 }, (_, i) => { const l = i / 4095; return Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)); });
const toSrgb = (l) => SRGB[Math.min(4095, Math.max(0, Math.round(l * 4095)))];
const hexLin = (h) => [0, 2, 4].map((i) => LIN[parseInt(h.slice(i, i + 2), 16)]);
const tints = new Map(); // `${name}|${part}|${색들}` → canvas (최근 것만)
const TINT_KEEP = 16;
/** 레이어 그림과 그 안의 y 시작. 색을 바꿀 게 없거나 마스크가 아직 없으면 원래 시트 */
function layerOf(name, part, colors) {
  const im = sheetOf(name);
  if (!im) return null;
  const pi = SHEET.PARTS.indexOf(part);
  const plain = { im, y0: pi * PART_ROWS * SHEET.H };
  const want = SHEET.MASKS.map((m, mi) => [m, mi]).filter(([m]) => m.part === part && colors[m.id]);
  if (!want.length) return plain;
  const key = `${name}|${part}|${want.map(([m]) => colors[m.id]).join(',')}`;
  let c = tints.get(key);
  if (c) { tints.delete(key); tints.set(key, c); return { im: c, y0: 0 }; }
  const mask = maskOf(name);
  if (!mask) return plain;
  try {
    const w = im.naturalWidth, h = PART_ROWS * SHEET.H;
    c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
    const mx = mc.getContext('2d', { willReadFrequently: true });
    cx.drawImage(im, 0, plain.y0, w, h, 0, 0, w, h);
    const out = cx.getImageData(0, 0, w, h), px = out.data;
    for (const [m, mi] of want) {
      mx.clearRect(0, 0, w, h);
      mx.drawImage(mask, 0, mi * h, w, h, 0, 0, w, h);
      const md = mx.getImageData(0, 0, w, h).data, t = hexLin(colors[m.id]);
      for (let p = 0; p < px.length; p += 4) {
        const a = md[p + 3];
        if (!a) continue;
        const f = a / 255, shade = LIN[md[p]] / SHEET.MASK_BASE;
        for (let k = 0; k < 3; k++) px[p + k] = px[p + k] * (1 - f) + toSrgb(t[k] * shade) * f;
      }
    }
    cx.putImageData(out, 0, 0);
  } catch { return plain; }
  tints.set(key, c);
  while (tints.size > TINT_KEEP) tints.delete(tints.keys().next().value);
  return { im: c, y0: 0 };
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
const heads = new Map(); // name → [[{ top, cx }]] (머리 레이어의 행·칸)
const HEAD_FALLBACK = { top: SHEET.FOOT - SHEET.HEIGHT * 0.92, cx: SHEET.W / 2 };
/** 머리 레이어에서 찾고, 머리가 없는 캐릭터(유령·눈사람·순록)는 몸통 레이어에서 */
function headOf(name, row, col) {
  let h = heads.get(name);
  if (!h) {
    const im = sheetOf(name);
    if (!im) return HEAD_FALLBACK;
    h = null;
    try {
      const { W, H, ROWS } = SHEET;
      const data = pixelsOf(im), body = ROWS.length * H;
      h = ROWS.map((r, ri) => Array.from({ length: r.frames }, (_, ci) => scanHead(data, im.naturalWidth, ci * W, ri * H, W, H)
        || scanHead(data, im.naturalWidth, ci * W, body + ri * H, W, H) || HEAD_FALLBACK));
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

/** 미리 불러 두기 (첫 프레임에 빈 캐릭터가 덜 보이게). parts 면 마스크·소품·테마 캐릭터도 */
export function preloadCharacters(parts = false) {
  for (const n of CHARACTERS) { sheetOf(n); if (parts) maskOf(n); }
  if (parts) { for (const a of ACCESSORIES) if (!a.draw) accOf(a.id); for (const c of SPECIALS) sheetOf(c.id); }
}

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
  const look = parseLook(name);
  if (!look) return false;
  // 몸통 → 머리(팔이 앞에 오는 곳은 구울 때 잘려 있다) → 소품. 셋 다 같은 칸
  const body = layerOf(look.body, 'body', look);
  const head = layerOf(look.head, 'head', look);
  if (!body || !head) return false;
  const costume = look.acc && ACCESSORIES.find((a) => a.id === look.acc && a.draw);
  const acc = look.acc && !costume ? accOf(look.acc) : null;
  const { W, H, FOOT, HEIGHT } = SHEET;
  const k = OFFICE_HEIGHT / HEIGHT * (o.scale || 1);
  // 정지 모델(눈사람·순록)은 한 칸만 있고 몸 전체를 움직인다
  const still = STILL.has(look.body);
  const { row, col } = still ? { row: 0, col: 0 } : frameOf(o);
  const m = still ? motionOf(o, o.scale || 1) : { lift: 0, tilt: 0, sx: 1, sy: 1 };
  ctx.save();
  ctx.translate(fx, fy - m.lift);
  ctx.rotate(o.faceRight ? -m.tilt : m.tilt);
  ctx.scale((o.faceRight ? -1 : 1) * m.sx, m.sy); // 모델은 화면 왼쪽 아래를 본다
  for (const l of [body, head, acc && { im: acc, y0: 0 }]) if (l) ctx.drawImage(l.im, col * W, l.y0 + row * H, W, H, -W * k / 2, -FOOT * k, W * k, H * k);
  // 코스튬·안전모: 뒤집힌 좌표 안에서 머리에 맞춰 (앞은 늘 -x 쪽)
  if (costume || o.hardHat) {
    const hd = headOf(look.head, row, col);
    const x = (hd.cx - W / 2) * k, top = (hd.top - FOOT) * k, s = k * HEIGHT / OFFICE_HEIGHT;
    if (costume) drawCostume(ctx, costume.id, x, top, s);
    if (o.hardHat) drawHardHat(ctx, x, top, s, false);
  }
  ctx.restore();
  return true;
}

/** 정지 그림·모델의 동작: 걷기 = 걸음마다 통통 + 살짝 기울기, 앉기 = 낮게, 타이핑 = 잔떨림, 끄덕임 = 숙였다 펴기, 서기 = 숨쉬기. s 는 배율 */
function motionOf(o, s) {
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
  return { lift, tilt, sx, sy };
}

/** 직접 그리는 코스튬 (FE-62). (x, top) = 머리 가운데·꼭대기, 앞은 -x 쪽, s 는 배율 */
function drawCostume(ctx, id, x, top, s) {
  ctx.save();
  ctx.translate(x, top);
  ctx.scale(s, s);
  if (id === 'santa') {
    ctx.fillStyle = '#d42a32';
    ctx.beginPath(); ctx.moveTo(-13, 13); ctx.quadraticCurveTo(-3, -9, 14, -5); ctx.lineTo(13, 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fafafa';
    ctx.beginPath(); ctx.ellipse(0, 13, 15, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -5, 4, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'antlers') {
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * 6, 11); ctx.lineTo(d * 10, -3); ctx.lineTo(d * 16, -9);
      ctx.moveTo(d * 10, -1); ctx.lineTo(d * 17, -1);
      ctx.moveTo(d * 9, 4); ctx.lineTo(d * 4, -5);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(-8, 23, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-9, 22, 1, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'pumpkin') {
    const cy = 14;
    for (const [dx, col, w] of [[8, '#c95a14', 0.64], [-8, '#e06a1c', 0.64], [0, '#f28a2a', 0.7]]) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(dx, cy, 20 * w, 15, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#4a7a3a'; ctx.fillRect(-2, cy - 19, 4, 6);
    ctx.fillStyle = '#ffd34d';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-2 + d * 8, cy - 5); ctx.lineTo(-2 + d * 2, cy - 1); ctx.lineTo(-2 + d * 9, cy); ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-11, cy + 4); ctx.lineTo(-6, cy + 6); ctx.lineTo(-3, cy + 4); ctx.lineTo(1, cy + 7); ctx.lineTo(7, cy + 4); ctx.lineTo(2, cy + 9); ctx.lineTo(-6, cy + 9); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
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
  const { lift, tilt, sx, sy } = motionOf(o, s);
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
