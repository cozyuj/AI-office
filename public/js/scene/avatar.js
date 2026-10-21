// 치비 캐릭터: 몸 종류(사람·로봇·고양이·곰) + 피부·머리·상의·하의·신발 + 안경·모자·소품을 코드로 그린다 (플랫 벡터 스타일).
// spec = { body, skin, hair:{style,color}, top:{style,color}, bottom:{style,color}, shoes, glasses, hat, hatColor, extra }
// 색은 프리셋 또는 임의의 #rrggbb. top.color 'auto' 는 세션 색. skin 은 로봇이면 금속색, 동물이면 털색.
import { shade } from './sprites.js';

const SKIN = ['#fbe3cf', '#f6d7bf', '#eec4a3', '#d8a97f', '#b6865c', '#8d5a3b', '#5c3a24'];

export const OPTIONS = {
  body: [['human', '사람'], ['robot', '로봇'], ['cat', '고양이'], ['bear', '곰']],
  skin: SKIN,
  /** 몸 종류별 피부(털·금속) 색 팔레트 */
  bodySkins: {
    human: SKIN,
    robot: ['#c9d1d9', '#8a8f99', '#e8e8ec', '#5aa7e6', '#e0a526', '#2f3542', '#c0504d'],
    cat: ['#f0c48a', '#d99a5b', '#8a8f99', '#f4f4f4', '#2f3542', '#e8683a', '#b6865c'],
    bear: ['#8d5a3b', '#b6865c', '#d99a5b', '#f4f4f4', '#2f3542', '#5c3a24', '#8a8f99'],
  },
  hair: { styles: [['short', '짧은'], ['bangs', '앞머리'], ['bob', '단발'], ['long', '긴 머리'], ['pony', '포니테일'], ['twin', '양갈래'], ['bun', '똥머리'], ['curly', '곱슬'], ['afro', '아프로'], ['spiky', '삐죽'], ['mohawk', '모호크'], ['bald', '민머리']],
    colors: ['#2b2320', '#4a3528', '#7a5236', '#a86b3b', '#d9a24a', '#e8d8b8', '#c0504d', '#3b6fd6', '#7a4fa3', '#2fa36b'] },
  top: { styles: [['tee', '티셔츠'], ['hoodie', '후드'], ['shirt', '셔츠'], ['sweater', '목폴라'], ['vest', '조끼'], ['suit', '정장'], ['labcoat', '가운'], ['dress', '원피스']],
    colors: ['auto', '#e8683a', '#3b6fd6', '#2fa36b', '#9b59b6', '#e0a526', '#1fa2b5', '#d9507a', '#f4f4f4', '#2f3542'] },
  bottom: { styles: [['pants', '바지'], ['shorts', '반바지'], ['skirt', '치마']],
    colors: ['#3a3f4b', '#2f4a7a', '#6b4e3d', '#8a8f99', '#d8cfc0', '#1f2430', '#b85c5c'] },
  shoes: { colors: ['#2b2f3a', '#6b4e3d', '#f4f4f4', '#c0504d', '#3b6fd6', '#e8683a'] },
  glasses: [['none', '없음'], ['round', '둥근 안경'], ['square', '네모 안경'], ['sun', '선글라스'], ['goggles', '고글'], ['monocle', '외알 안경']],
  hat: [['none', '없음'], ['cap', '캡'], ['beanie', '비니'], ['beret', '베레모'], ['band', '머리띠'], ['bucket', '버킷햇'], ['tophat', '실크햇'], ['wizard', '마법사'], ['crown', '왕관']],
  extra: [['none', '없음'], ['headphones', '헤드폰'], ['scarf', '스카프'], ['badge', '사원증'], ['earring', '귀걸이'], ['bowtie', '나비넥타이'], ['beard', '수염'], ['mask', '마스크'], ['cape', '망토']],
};

export const DEFAULTS = {
  claude: { body: 'human', skin: '#f6d7bf', hair: { style: 'short', color: '#4a3528' }, top: { style: 'tee', color: 'auto' }, bottom: { style: 'pants', color: '#3a3f4b' }, shoes: '#2b2f3a', glasses: 'none', hat: 'none', hatColor: '#2f3542', extra: 'none' },
  sub: { body: 'human', skin: '#eec4a3', hair: { style: 'curly', color: '#2b2320' }, top: { style: 'hoodie', color: '#3b6fd6' }, bottom: { style: 'pants', color: '#2f4a7a' }, shoes: '#f4f4f4', glasses: 'none', hat: 'none', hatColor: '#2f3542', extra: 'badge' },
  me: { body: 'human', skin: '#f6d7bf', hair: { style: 'bangs', color: '#2b2320' }, top: { style: 'shirt', color: '#f4f4f4' }, bottom: { style: 'pants', color: '#1f2430' }, shoes: '#2b2f3a', glasses: 'none', hat: 'none', hatColor: '#2f3542', extra: 'none' },
};

/** 한 번에 적용하는 프리셋. 적용 뒤 파츠를 개별로 더 바꿀 수 있다. */
export const PRESETS = [
  { id: 'dev', label: '개발자', spec: { body: 'human', skin: '#f6d7bf', hair: { style: 'short', color: '#2b2320' }, top: { style: 'hoodie', color: '#2f3542' }, bottom: { style: 'pants', color: '#3a3f4b' }, shoes: '#f4f4f4', glasses: 'square', hat: 'none', hatColor: '#2f3542', extra: 'headphones' } },
  { id: 'suit', label: '정장', spec: { body: 'human', skin: '#eec4a3', hair: { style: 'short', color: '#4a3528' }, top: { style: 'suit', color: '#c0504d' }, bottom: { style: 'pants', color: '#1f2430' }, shoes: '#2b2f3a', glasses: 'none', hat: 'none', hatColor: '#2f3542', extra: 'badge' } },
  { id: 'lab', label: '연구원', spec: { body: 'human', skin: '#fbe3cf', hair: { style: 'bun', color: '#7a5236' }, top: { style: 'labcoat', color: '#1fa2b5' }, bottom: { style: 'pants', color: '#8a8f99' }, shoes: '#f4f4f4', glasses: 'round', hat: 'none', hatColor: '#2f3542', extra: 'badge' } },
  { id: 'casual', label: '캐주얼', spec: { body: 'human', skin: '#d8a97f', hair: { style: 'curly', color: '#2b2320' }, top: { style: 'tee', color: '#e0a526' }, bottom: { style: 'shorts', color: '#2f4a7a' }, shoes: '#e8683a', glasses: 'sun', hat: 'cap', hatColor: '#3b6fd6', extra: 'none' } },
  { id: 'artist', label: '예술가', spec: { body: 'human', skin: '#f6d7bf', hair: { style: 'twin', color: '#7a4fa3' }, top: { style: 'vest', color: '#d9507a' }, bottom: { style: 'skirt', color: '#1f2430' }, shoes: '#c0504d', glasses: 'round', hat: 'beret', hatColor: '#c0504d', extra: 'earring' } },
  { id: 'wizard', label: '마법사', spec: { body: 'human', skin: '#f6d7bf', hair: { style: 'long', color: '#e8d8b8' }, top: { style: 'sweater', color: '#7a4fa3' }, bottom: { style: 'pants', color: '#1f2430' }, shoes: '#2b2f3a', glasses: 'none', hat: 'wizard', hatColor: '#7a4fa3', extra: 'beard' } },
  { id: 'king', label: '임금님', spec: { body: 'human', skin: '#eec4a3', hair: { style: 'short', color: '#4a3528' }, top: { style: 'suit', color: '#e0a526' }, bottom: { style: 'pants', color: '#1f2430' }, shoes: '#2b2f3a', glasses: 'monocle', hat: 'crown', hatColor: '#e0a526', extra: 'cape' } },
  { id: 'robot', label: '로봇', spec: { body: 'robot', skin: '#c9d1d9', hair: { style: 'short', color: '#2b2320' }, top: { style: 'tee', color: '#5aa7e6' }, bottom: { style: 'pants', color: '#8a8f99' }, shoes: '#2f3542', glasses: 'none', hat: 'none', hatColor: '#2f3542', extra: 'none' } },
  { id: 'cat', label: '고양이', spec: { body: 'cat', skin: '#f0c48a', hair: { style: 'bald', color: '#2b2320' }, top: { style: 'hoodie', color: '#e8683a' }, bottom: { style: 'pants', color: '#3a3f4b' }, shoes: '#f4f4f4', glasses: 'none', hat: 'none', hatColor: '#2f3542', extra: 'bowtie' } },
  { id: 'bear', label: '곰', spec: { body: 'bear', skin: '#8d5a3b', hair: { style: 'bald', color: '#2b2320' }, top: { style: 'sweater', color: '#2fa36b' }, bottom: { style: 'pants', color: '#6b4e3d' }, shoes: '#2b2f3a', glasses: 'none', hat: 'none', hatColor: '#2f3542', extra: 'scarf' } },
];

const HEX = /^#[0-9a-f]{6}$/i;
const isColor = (v) => typeof v === 'string' && HEX.test(v);
const hasKey = (list, v) => list.some((o) => (Array.isArray(o) ? o[0] : o) === v);

export function randomAvatar(seed = Math.random()) {
  let x = Math.floor(seed * 2 ** 31) || 1;
  const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
  const p = (arr) => arr[Math.floor(r() * arr.length)];
  const body = r() < 0.75 ? 'human' : p(OPTIONS.body.slice(1))[0];
  return {
    body,
    skin: p(OPTIONS.bodySkins[body]),
    hair: { style: p(OPTIONS.hair.styles)[0], color: p(OPTIONS.hair.colors) },
    top: { style: p(OPTIONS.top.styles)[0], color: p(OPTIONS.top.colors.slice(1)) },
    bottom: { style: p(OPTIONS.bottom.styles)[0], color: p(OPTIONS.bottom.colors) },
    shoes: p(OPTIONS.shoes.colors),
    glasses: r() < 0.35 ? p(OPTIONS.glasses.slice(1))[0] : 'none',
    hat: r() < 0.3 ? p(OPTIONS.hat.slice(1))[0] : 'none',
    hatColor: p(OPTIONS.top.colors.slice(1)),
    extra: r() < 0.4 ? p(OPTIONS.extra.slice(1))[0] : 'none',
  };
}

/** 깨진/옛 spec 을 기본값으로 채운다. 색은 프리셋이 아니어도 #rrggbb 면 허용. body 가 없는 옛 저장값은 사람 */
export function normalizeAvatar(spec, base = DEFAULTS.claude) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const color = (v, fallback, allowAuto = false) => (isColor(v) || (allowAuto && v === 'auto')) ? v : fallback;
  return {
    body: hasKey(OPTIONS.body, s.body) ? s.body : (base.body || 'human'),
    skin: color(s.skin, base.skin),
    hair: { style: hasKey(OPTIONS.hair.styles, s.hair?.style) ? s.hair.style : base.hair.style, color: color(s.hair?.color, base.hair.color) },
    top: { style: hasKey(OPTIONS.top.styles, s.top?.style) ? s.top.style : base.top.style, color: color(s.top?.color, base.top.color, true) },
    bottom: { style: hasKey(OPTIONS.bottom.styles, s.bottom?.style) ? s.bottom.style : base.bottom.style, color: color(s.bottom?.color, base.bottom.color) },
    shoes: color(typeof s.shoes === 'string' ? s.shoes : s.shoes?.color, base.shoes),
    glasses: hasKey(OPTIONS.glasses, s.glasses) ? s.glasses : base.glasses,
    hat: hasKey(OPTIONS.hat, s.hat) ? s.hat : base.hat,
    hatColor: color(s.hatColor, base.hatColor),
    extra: hasKey(OPTIONS.extra, s.extra) ? s.extra : base.extra,
  };
}

function rr(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}
function poly(ctx, pts, fill) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}
function dot(ctx, x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

/**
 * 발 위치 (fx, fy) 에 치비를 그린다. 키 약 58px (1배).
 * o: { sessionColor, walking, walkT, now, faceRight, scale, hardHat, sitting }
 */
export function drawAvatar(ctx, fx, fy, s, o = {}) {
  const sc = o.scale || 1;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(sc, sc);
  const body = s.body || 'human';
  const robot = body === 'robot', animal = body === 'cat' || body === 'bear';
  const top = s.top.color === 'auto' ? (o.sessionColor || '#e8683a') : s.top.color;
  const skin = s.skin, hair = s.hair.color, bot = s.bottom.color;
  const swing = o.walking ? Math.sin((o.walkT || 0) * 9) * 3 : 0;
  const faceRight = o.faceRight !== false;
  const ex = faceRight ? 1 : -1;
  const hy = -44, R = 14;
  const hs = robot ? 'none' : s.hair.style; // 로봇은 머리카락 없음

  // 뒷머리 (몸통 뒤)
  if (hs === 'afro') dot(ctx, 0, hy - 2, R + 6, hair);
  if (hs === 'long') rr(ctx, -R - 1, hy - 4, 2 * R + 2, 24, 6, hair);
  if (hs === 'bob') rr(ctx, -R - 1.5, hy - 4, 2 * R + 3, 17, 6, hair);
  if (hs === 'pony') rr(ctx, faceRight ? -R - 4 : R - 2, hy - 2, 6, 22, 3, hair);
  if (hs === 'twin') { rr(ctx, -R - 5, hy - 1, 6, 20, 3, hair); rr(ctx, R - 1, hy - 1, 6, 20, 3, hair); }
  if (hs === 'bun') dot(ctx, 0, hy - 14, 6, hair);
  // 망토 (몸통 뒤, 걸으면 살짝 펄럭)
  if (s.extra === 'cape') poly(ctx, [[-9, -29], [9, -29], [14 - swing * 0.6, -5], [-14 - swing * 0.6, -5]], shade(top, 0.65));

  // 다리 + 신발
  const legSkin = s.bottom.style !== 'pants';
  const lTop = -12 + Math.max(0, swing), rTop = -12 + Math.max(0, -swing);
  rr(ctx, -7, lTop, 6, -lTop - 2, 2, legSkin ? skin : bot);
  rr(ctx, 1, rTop, 6, -rTop - 2, 2, legSkin ? skin : bot);
  if (s.bottom.style === 'shorts') { rr(ctx, -7, -12, 6, 5, 2, bot); rr(ctx, 1, -12, 6, 5, 2, bot); }
  rr(ctx, -8, -4 + Math.max(0, swing) * 0.3, 7, 4, 2, s.shoes);
  rr(ctx, 1, -4 + Math.max(0, -swing) * 0.3, 7, 4, 2, s.shoes);

  // 몸통
  const ts = s.top.style;
  const isDress = ts === 'dress';
  const bodyC = ts === 'suit' ? '#2f3542' : ts === 'vest' ? '#f4f4f4' : top;
  const sleeve = ts === 'labcoat' || ts === 'vest' ? '#f4f4f4' : bodyC; // 소매 색
  if (ts === 'hoodie') { ctx.fillStyle = shade(top, 0.8); ctx.beginPath(); ctx.arc(0, -31, 11, Math.PI, Math.PI * 2); ctx.fill(); }
  rr(ctx, -10, -30, 20, isDress ? 22 : 20, 7, bodyC);
  if (s.bottom.style === 'skirt' || isDress) poly(ctx, [[-9, -14], [9, -14], [12, -6], [-12, -6]], isDress ? bodyC : bot);
  if (ts === 'labcoat') { // 셔츠 위에 흰 가운 + 옷깃
    rr(ctx, -11, -30, 8, 24, 3, '#f4f4f4'); rr(ctx, 3, -30, 8, 24, 3, '#f4f4f4');
    poly(ctx, [[-3, -30], [-7, -21], [-3, -21]], '#d9dce2'); poly(ctx, [[3, -30], [7, -21], [3, -21]], '#d9dce2');
  }
  if (ts === 'vest') { rr(ctx, -9, -30, 7, 17, 3, top); rr(ctx, 2, -30, 7, 17, 3, top); ctx.fillStyle = shade(top, 0.7); ctx.fillRect(-0.7, -23, 1.4, 1.4); ctx.fillRect(-0.7, -18, 1.4, 1.4); }
  if (ts === 'sweater') { rr(ctx, -6, -34, 12, 6, 3, shade(top, 0.85)); ctx.fillStyle = shade(top, 0.9); for (let i = 0; i < 3; i++) ctx.fillRect(-8, -25 + i * 4, 16, 1); }
  // 팔
  const bare = ts === 'tee' || isDress;
  const armRaise = o.thinking ? -4 : (o.typing ? Math.round(Math.sin((o.now || 0) / 90) * 1.5) : 0);
  rr(ctx, -14, -28, 4, 12 + armRaise, 2, bare ? skin : sleeve);
  rr(ctx, 10, -28, 4, 12, 2, bare ? skin : sleeve);
  if (bare) { rr(ctx, -14, -28, 4, 5, 2, bodyC); rr(ctx, 10, -28, 4, 5, 2, bodyC); }
  rr(ctx, -14, -17 + armRaise, 4, 4, 2, skin);
  rr(ctx, 10, -17, 4, 4, 2, skin);
  if (ts === 'shirt') {
    poly(ctx, [[-4, -30], [0, -25], [4, -30]], '#fff');
    ctx.fillStyle = shade(top, 0.75); for (let i = 0; i < 3; i++) ctx.fillRect(-0.7, -23 + i * 4, 1.4, 1.4);
  }
  if (ts === 'suit') {
    poly(ctx, [[-5, -30], [0, -21], [5, -30]], '#fff');
    ctx.fillStyle = top === '#2f3542' ? '#c0504d' : top; ctx.fillRect(-1.5, -28, 3, 8);
  }
  if (ts === 'hoodie') { ctx.fillStyle = shade(top, 0.8); ctx.fillRect(-5, -17, 10, 5); ctx.fillStyle = '#fff'; ctx.fillRect(-2, -28, 1, 6); ctx.fillRect(1, -28, 1, 6); }
  if (s.extra === 'scarf') { rr(ctx, -11, -32, 22, 6, 3, '#c0504d'); rr(ctx, 3, -30, 6, 12, 2, '#c0504d'); }
  if (s.extra === 'badge') { rr(ctx, 4, -26, 5, 7, 1, '#fff'); rr(ctx, 4, -26, 5, 2, 1, '#3b6fd6'); ctx.strokeStyle = '#8a919b'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(6.5, -26); ctx.lineTo(6.5, -30); ctx.stroke(); }
  if (s.extra === 'bowtie') { poly(ctx, [[0, -29], [-6, -32.5], [-6, -25.5]], '#c0504d'); poly(ctx, [[0, -29], [6, -32.5], [6, -25.5]], '#c0504d'); rr(ctx, -1.3, -30.5, 2.6, 3, 1, shade('#c0504d', 0.7)); }

  // 머리
  if (robot) {
    rr(ctx, -R, hy - R + 1, 2 * R, 2 * R - 1, 5, skin);
    rr(ctx, -R + 3, hy - R + 3, 2 * R - 6, 3, 1.5, shade(skin, 1.12));
    dot(ctx, -R, hy + 3, 2.5, shade(skin, 0.75)); dot(ctx, R, hy + 3, 2.5, shade(skin, 0.75)); // 볼트 귀
    ctx.strokeStyle = shade(skin, 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, hy - R + 1); ctx.lineTo(0, hy - R - 6); ctx.stroke();
    dot(ctx, 0, hy - R - 8, 2.5, '#e8683a'); // 안테나
  } else {
    dot(ctx, 0, hy, R, skin);
  }
  ctx.fillStyle = hair;
  if (hs === 'none') {
    // 로봇
  } else if (hs === 'bald') {
    if (!animal) { ctx.fillStyle = shade(skin, 0.96); ctx.beginPath(); ctx.arc(0, hy - 1, R, Math.PI * 1.15, Math.PI * 1.85); ctx.fill(); }
  } else if (hs === 'curly') {
    for (const [dx, dy, r] of [[-11, -6, 6], [-5, -12, 6.5], [3, -13, 6.5], [10, -6, 6], [-14, 2, 4.5], [14, 2, 4.5]]) { ctx.beginPath(); ctx.arc(dx, hy + dy, r, 0, Math.PI * 2); ctx.fill(); }
  } else if (hs === 'mohawk') {
    if (!animal) { ctx.fillStyle = shade(skin, 0.96); ctx.beginPath(); ctx.arc(0, hy - 1, R, Math.PI * 1.15, Math.PI * 1.85); ctx.fill(); }
    const pts = [[-4, hy - R + 4]];
    for (let i = 0; i < 4; i++) pts.push([-4 + i * 2.2 + 1.1, hy - R - 10 + Math.abs(i - 1.5) * 1.5], [-4 + (i + 1) * 2.2, hy - R + 1]);
    pts.push([4, hy - R + 4]);
    poly(ctx, pts, hair);
  } else {
    ctx.beginPath(); ctx.arc(0, hy - 2, R + 0.5, Math.PI, Math.PI * 2); ctx.fill();
    rr(ctx, -R - 0.5, hy - 3, 2 * R + 1, 5, 2, hair);
    if (hs === 'spiky') {
      const pts = [[-13, hy - 3]];
      for (let i = 0; i < 5; i++) pts.push([-13 + i * 6.5 + 3.25, hy - R - 6 - (i % 2) * 2], [-13 + (i + 1) * 6.5, hy - 3]);
      poly(ctx, pts, hair);
    }
    if (hs === 'bangs' || hs === 'bob' || hs === 'long' || hs === 'twin') {
      ctx.fillStyle = hair;
      ctx.beginPath(); ctx.moveTo(-12, hy + 2);
      for (let i = 0; i < 5; i++) { ctx.lineTo(-12 + i * 6 + 3, hy + 6); ctx.lineTo(-12 + (i + 1) * 6, hy + 2); }
      ctx.lineTo(12, hy - 3); ctx.lineTo(-12, hy - 3); ctx.closePath(); ctx.fill();
    } else {
      poly(ctx, [[-13, hy + 1], [-6, hy - 2], [2, hy + 1], [9, hy - 2], [13, hy + 1], [13, hy - 4], [-13, hy - 4]], hair);
    }
  }
  // 동물 귀 (머리카락 위로 솟게)
  if (body === 'cat') {
    for (const d of [-1, 1]) {
      poly(ctx, [[d * (R - 1), hy - 7], [d * (R + 1), hy - R - 8], [d * 3, hy - R + 1]], skin);
      poly(ctx, [[d * (R - 2), hy - 8], [d * (R - 0.5), hy - R - 4], [d * 6, hy - R + 1]], '#f0a3a3');
    }
  }
  if (body === 'bear') {
    for (const d of [-1, 1]) { dot(ctx, d * (R - 3), hy - R + 3, 5, skin); dot(ctx, d * (R - 3), hy - R + 3, 2.5, shade(skin, 1.3)); }
  }
  // 얼굴
  if (robot) {
    const eye = '#5fe3ff';
    if (o.blink) { ctx.fillStyle = eye; ctx.fillRect(-8 + ex, hy + 4, 5, 1.4); ctx.fillRect(3 + ex, hy + 4, 5, 1.4); }
    else { rr(ctx, -8 + ex, hy + 2, 5, 4.5, 1.2, eye); rr(ctx, 3 + ex, hy + 2, 5, 4.5, 1.2, eye); }
    ctx.fillStyle = shade(skin, 0.7); ctx.fillRect(-5 + ex, hy + 9.5, 10, 1.6); ctx.fillRect(-2 + ex, hy + 9.5, 1, 3); ctx.fillRect(1 + ex, hy + 9.5, 1, 3); // 입 (그릴)
  } else {
    if (animal) { ctx.fillStyle = shade(skin, body === 'bear' ? 1.35 : 1.15); ctx.beginPath(); ctx.ellipse(ex, hy + 9, body === 'bear' ? 7 : 6, 4.5, 0, 0, Math.PI * 2); ctx.fill(); } // 주둥이
    ctx.fillStyle = '#2b2f3a';
    if (o.blink) { ctx.fillRect(-7 + ex, hy + 5, 4, 1.4); ctx.fillRect(3 + ex, hy + 5, 4, 1.4); }
    else { ctx.beginPath(); ctx.arc(-5 + ex, hy + 5, 1.8, 0, Math.PI * 2); ctx.arc(5 + ex, hy + 5, 1.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(240,120,120,0.35)'; ctx.beginPath(); ctx.arc(-8, hy + 9, 2.5, 0, Math.PI * 2); ctx.arc(8, hy + 9, 2.5, 0, Math.PI * 2); ctx.fill();
    if (animal) {
      ctx.fillStyle = body === 'bear' ? '#2b2f3a' : '#e58a8a'; ctx.beginPath(); ctx.ellipse(ex, hy + 7.5, 2.2, 1.6, 0, 0, Math.PI * 2); ctx.fill(); // 코
      ctx.strokeStyle = '#b0605a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ex - 1.6, hy + 10, 1.6, 0.1, Math.PI - 0.1); ctx.moveTo(ex + 3.2, hy + 10); ctx.arc(ex + 1.6, hy + 10, 1.6, 0.1, Math.PI - 0.1); ctx.stroke(); // ω 입
      if (body === 'cat') { ctx.strokeStyle = 'rgba(43,47,58,0.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (const d of [-1, 1]) { ctx.moveTo(d * 7, hy + 8); ctx.lineTo(d * 14, hy + 6.5); ctx.moveTo(d * 7, hy + 10); ctx.lineTo(d * 14, hy + 11); } ctx.stroke(); } // 수염
    } else {
      ctx.strokeStyle = '#b0605a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ex, hy + 9, 2, 0.2, Math.PI - 0.2); ctx.stroke();
    }
  }
  if (s.extra === 'beard') { rr(ctx, -9, hy + 7, 18, 9, 4.5, hair); rr(ctx, -5, hy + 7.5, 10, 2.2, 1.1, shade(hair, 0.8)); }
  if (s.extra === 'mask') { rr(ctx, -8, hy + 5.5, 16, 8, 3, '#f4f4f4'); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-8, hy + 7); ctx.lineTo(-R, hy + 4); ctx.moveTo(8, hy + 7); ctx.lineTo(R, hy + 4); ctx.stroke(); }
  // 안경
  if (s.glasses === 'goggles') {
    rr(ctx, -R - 1, hy + 2.5, 2 * R + 2, 4, 1, '#2f3542');
    ctx.strokeStyle = '#2f3542'; ctx.lineWidth = 1.6; ctx.fillStyle = 'rgba(255,200,80,0.55)';
    for (const dx of [-5, 5]) { ctx.beginPath(); ctx.arc(dx + ex * 0.5, hy + 5, 4.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  } else if (s.glasses === 'monocle') {
    ctx.strokeStyle = '#e0a526'; ctx.lineWidth = 1.3; ctx.fillStyle = 'rgba(180,220,255,0.25)';
    ctx.beginPath(); ctx.arc(5 + ex, hy + 5, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9 + ex, hy + 8); ctx.quadraticCurveTo(13 + ex, hy + 12, 11 + ex, hy + 17); ctx.stroke(); // 줄
  } else if (s.glasses && s.glasses !== 'none') {
    ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = 1.2;
    ctx.fillStyle = s.glasses === 'sun' ? 'rgba(43,47,58,0.85)' : 'rgba(180,220,255,0.25)';
    for (const dx of [-5, 5]) { ctx.beginPath(); if (s.glasses === 'square') ctx.rect(dx - 4, hy + 1.5, 8, 7); else ctx.arc(dx, hy + 5, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-1, hy + 5); ctx.lineTo(1, hy + 5); ctx.moveTo(-9, hy + 4); ctx.lineTo(-13, hy + 2); ctx.moveTo(9, hy + 4); ctx.lineTo(13, hy + 2); ctx.stroke();
  }
  // 소품 (머리 주변)
  if (s.extra === 'headphones') {
    ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, hy - 1, R + 2, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    rr(ctx, -R - 5, hy - 3, 5, 9, 2.5, '#2b2f3a'); rr(ctx, R, hy - 3, 5, 9, 2.5, '#2b2f3a');
    rr(ctx, -R - 4, hy - 2, 3, 7, 1.5, '#e8683a'); rr(ctx, R + 1, hy - 2, 3, 7, 1.5, '#e8683a');
  }
  if (s.extra === 'earring') { dot(ctx, -R + 1, hy + 6, 1.6, '#e0a526'); dot(ctx, R - 1, hy + 6, 1.6, '#e0a526'); }
  // 모자
  const hc = s.hatColor || '#2f3542';
  if (s.hat === 'cap') { ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(0, hy - 4, R + 1, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, -R - 1, hy - 5, 2 * R + 2, 4, 2, hc); rr(ctx, faceRight ? -2 : -R - 4, hy - 3, R + 6, 3.5, 1.5, shade(hc, 0.8)); }
  if (s.hat === 'beanie') { ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(0, hy - 3, R + 2, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, -R - 2, hy - 5, 2 * R + 4, 5, 2, shade(hc, 0.85)); dot(ctx, 0, hy - R - 4, 3.5, shade(hc, 1.15)); }
  if (s.hat === 'beret') { ctx.fillStyle = hc; ctx.beginPath(); ctx.ellipse(-1.5, hy - 8, R + 3.5, 9.5, -0.18, 0, Math.PI * 2); ctx.fill(); dot(ctx, -1, hy - 17, 2, shade(hc, 0.9)); }
  if (s.hat === 'band') rr(ctx, -R - 1, hy - 7, 2 * R + 2, 3.5, 1.5, hc);
  if (s.hat === 'bucket') { rr(ctx, -R + 1, hy - 17, 2 * R - 2, 11, 3, hc); poly(ctx, [[-R - 5, hy - 3], [R + 5, hy - 3], [R - 1, hy - 7], [-R + 1, hy - 7]], shade(hc, 0.85)); }
  if (s.hat === 'tophat') { rr(ctx, -R - 3, hy - 8, 2 * R + 6, 3.5, 1.5, hc); rr(ctx, -R + 3, hy - 27, 2 * R - 6, 20, 2, hc); rr(ctx, -R + 3, hy - 11, 2 * R - 6, 3, 1, shade(hc, 0.7)); }
  if (s.hat === 'wizard') {
    poly(ctx, [[-R + 2, hy - 7], [R - 2, hy - 7], [-4 * ex, hy - 32]], hc);
    dot(ctx, -4 * ex, hy - 32, 1.8, hc);
    rr(ctx, -R - 5, hy - 9, 2 * R + 10, 3.5, 1.5, shade(hc, 0.8));
    dot(ctx, -3, hy - 15, 1.3, '#e0a526'); dot(ctx, 2 - ex, hy - 22, 1, '#e0a526'); // 별
  }
  if (s.hat === 'crown') { poly(ctx, [[-10, hy - 6], [-10, hy - 17], [-5, hy - 11], [0, hy - 19], [5, hy - 11], [10, hy - 17], [10, hy - 6]], '#e0a526'); dot(ctx, 0, hy - 9, 1.8, '#c0504d'); }
  // 서브에이전트 안전모 (모자 위)
  if (o.hardHat) { ctx.fillStyle = '#3b6fd6'; ctx.beginPath(); ctx.arc(0, hy - 4, 15, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, -17, hy - 5, 34, 3, 1.5, '#3b6fd6'); }
  ctx.restore();
}
