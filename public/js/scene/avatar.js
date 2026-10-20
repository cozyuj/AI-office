// 캐릭터 외형: 성별(실루엣)·피부·머리·상의·하의·신발 파츠를 코드로 그린다.
// spec = { gender:'f'|'m'|'n', skin, hair:{style,color}, top:{style,color}, bottom:{style,color}, shoes:{color} }
// top.color 가 'auto' 면 세션 색을 쓴다.
import { roundRect } from './render.js';
import { shade } from './sprites.js';

export const OPTIONS = {
  gender: [['f', '여성'], ['m', '남성'], ['n', '중성']],
  skin: ['#fbe3cf', '#f3c9a6', '#e0ac82', '#c68a5a', '#8d5a3b', '#5c3a24'],
  hair: {
    styles: [['short', '짧은 머리'], ['long', '긴 머리'], ['pony', '포니테일'], ['bob', '단발'], ['curly', '곱슬'], ['bald', '민머리']],
    colors: ['#2b2320', '#5a3b2a', '#a86b3b', '#d9a24a', '#e8e0d0', '#c0504d', '#3b6fd6', '#7a4fa3'],
  },
  top: {
    styles: [['tee', '티셔츠'], ['shirt', '셔츠'], ['hoodie', '후드'], ['suit', '정장']],
    colors: ['auto', '#e8683a', '#3b6fd6', '#2fa36b', '#9b59b6', '#e0a526', '#1fa2b5', '#d9507a', '#f4f4f4', '#2f3542'],
  },
  bottom: {
    styles: [['pants', '바지'], ['skirt', '치마'], ['shorts', '반바지']],
    colors: ['#3a3f4b', '#2f4a7a', '#6b4e3d', '#8a8f99', '#d8cfc0', '#1f2430', '#b85c5c'],
  },
  shoes: { colors: ['#2b2f3a', '#6b4e3d', '#f4f4f4', '#c0504d', '#3b6fd6'] },
};

export const DEFAULTS = {
  claude: { gender: 'n', skin: '#f3c9a6', hair: { style: 'short', color: '#5a3b2a' }, top: { style: 'tee', color: 'auto' }, bottom: { style: 'pants', color: '#3a3f4b' }, shoes: { color: '#2b2f3a' } },
  sub: { gender: 'n', skin: '#e0ac82', hair: { style: 'curly', color: '#2b2320' }, top: { style: 'hoodie', color: '#3b6fd6' }, bottom: { style: 'pants', color: '#2f4a7a' }, shoes: { color: '#f4f4f4' } },
  me: { gender: 'm', skin: '#f3c9a6', hair: { style: 'short', color: '#2b2320' }, top: { style: 'shirt', color: '#f4f4f4' }, bottom: { style: 'pants', color: '#1f2430' }, shoes: { color: '#6b4e3d' } },
};

const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

export function randomAvatar(seed = Math.random()) {
  let x = Math.floor(seed * 2 ** 31) || 1;
  const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
  const gender = pick(OPTIONS.gender, r)[0];
  const hairStyles = OPTIONS.hair.styles.filter(([s]) => gender === 'f' ? s !== 'bald' : true);
  const bottomStyles = OPTIONS.bottom.styles.filter(([s]) => gender === 'm' ? s !== 'skirt' : true);
  return {
    gender,
    skin: pick(OPTIONS.skin, r),
    hair: { style: pick(hairStyles, r)[0], color: pick(OPTIONS.hair.colors, r) },
    top: { style: pick(OPTIONS.top.styles, r)[0], color: pick(OPTIONS.top.colors.filter((c) => c !== 'auto'), r) },
    bottom: { style: pick(bottomStyles, r)[0], color: pick(OPTIONS.bottom.colors, r) },
    shoes: { color: pick(OPTIONS.shoes.colors, r) },
  };
}

/** 깨진/옛 spec 을 기본값으로 채운다 */
export function normalizeAvatar(spec, base = DEFAULTS.claude) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const has = (list, v) => list.some((o) => (Array.isArray(o) ? o[0] : o) === v);
  return {
    gender: has(OPTIONS.gender, s.gender) ? s.gender : base.gender,
    skin: has(OPTIONS.skin, s.skin) ? s.skin : base.skin,
    hair: { style: has(OPTIONS.hair.styles, s.hair?.style) ? s.hair.style : base.hair.style, color: has(OPTIONS.hair.colors, s.hair?.color) ? s.hair.color : base.hair.color },
    top: { style: has(OPTIONS.top.styles, s.top?.style) ? s.top.style : base.top.style, color: has(OPTIONS.top.colors, s.top?.color) ? s.top.color : base.top.color },
    bottom: { style: has(OPTIONS.bottom.styles, s.bottom?.style) ? s.bottom.style : base.bottom.style, color: has(OPTIONS.bottom.colors, s.bottom?.color) ? s.bottom.color : base.bottom.color },
    shoes: { color: has(OPTIONS.shoes.colors, s.shoes?.color) ? s.shoes.color : base.shoes.color },
  };
}

/**
 * 발 위치 (fx, fy) 에 캐릭터를 그린다. 1배 크기: 키 약 48px.
 * o: { sessionColor, walking, walkT, now, activity, faceRight, scale }
 */
export function drawAvatar(ctx, fx, fy, spec, o = {}) {
  const sc = o.scale || 1;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(sc, sc);
  const g = spec.gender;
  const bw = g === 'f' ? 16 : g === 'm' ? 19 : 17;     // 어깨 폭
  const hw = bw / 2;
  const topColor = spec.top.color === 'auto' ? (o.sessionColor || '#e8683a') : spec.top.color;
  const topDark = shade(topColor, 0.75);
  const skin = spec.skin;
  const legSwing = o.walking ? Math.sin((o.walkT || 0) * 9) * 3 : 0;
  const legW = 5, legGap = 1.5;
  const legY = -12; // 다리 윗부분
  const faceRight = o.faceRight !== false;

  // ---- 다리 + 하의 ----
  const leftTop = legY + Math.max(0, legSwing), rightTop = legY + Math.max(0, -legSwing);
  const drawLeg = (x, top, color, len) => { ctx.fillStyle = color; ctx.fillRect(x, top, legW, len); };
  if (spec.bottom.style === 'pants') {
    drawLeg(-legW - legGap / 2, leftTop, spec.bottom.color, -leftTop - 2);
    drawLeg(legGap / 2, rightTop, spec.bottom.color, -rightTop - 2);
  } else if (spec.bottom.style === 'shorts') {
    drawLeg(-legW - legGap / 2, leftTop, skin, -leftTop - 2);
    drawLeg(legGap / 2, rightTop, skin, -rightTop - 2);
    drawLeg(-legW - legGap / 2, leftTop, spec.bottom.color, 6);
    drawLeg(legGap / 2, rightTop, spec.bottom.color, 6);
  } else { // skirt
    drawLeg(-legW - legGap / 2, leftTop, skin, -leftTop - 2);
    drawLeg(legGap / 2, rightTop, skin, -rightTop - 2);
    ctx.fillStyle = spec.bottom.color;
    ctx.beginPath(); ctx.moveTo(-hw + 1, legY - 2); ctx.lineTo(hw - 1, legY - 2); ctx.lineTo(hw + 2, legY + 7); ctx.lineTo(-hw - 2, legY + 7); ctx.closePath(); ctx.fill();
  }
  // ---- 신발 ----
  ctx.fillStyle = spec.shoes.color;
  ctx.fillRect(-legW - legGap / 2 - 1, -3 + Math.max(0, legSwing) * 0.3, legW + 2, 3);
  ctx.fillRect(legGap / 2 - 1, -3 + Math.max(0, -legSwing) * 0.3, legW + 2, 3);

  // ---- 상의 ----
  const bodyTop = -32, bodyH = 21;
  if (spec.top.style === 'hoodie') { // 후드 뒤판
    ctx.fillStyle = topDark;
    ctx.beginPath(); ctx.arc(0, bodyTop - 2, hw + 1, Math.PI, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = spec.top.style === 'suit' ? '#2f3542' : topColor;
  roundRect(ctx, -hw, bodyTop, bw, bodyH, 5); ctx.fill();
  if (g === 'f') { ctx.fillStyle = spec.top.style === 'suit' ? '#2f3542' : topColor; roundRect(ctx, -hw + 1, bodyTop + 10, bw - 2, bodyH - 10, 4); ctx.fill(); }
  // 팔 (소매)
  const armRaise = o.activity === 'think' ? -4 : 0;
  const sleeveColor = spec.top.style === 'suit' ? '#2f3542' : topColor;
  ctx.fillStyle = sleeveColor;
  roundRect(ctx, -hw - 4, bodyTop + 3, 4, spec.top.style === 'tee' ? 7 : 13 + armRaise, 2); ctx.fill();
  roundRect(ctx, hw, bodyTop + 3, 4, spec.top.style === 'tee' ? 7 : 13, 2); ctx.fill();
  if (spec.top.style === 'tee') { // 반팔 아래 맨팔
    ctx.fillStyle = skin;
    roundRect(ctx, -hw - 4, bodyTop + 10, 4, 7 + armRaise, 2); ctx.fill();
    roundRect(ctx, hw, bodyTop + 10, 4, 7, 2); ctx.fill();
  }
  // 손
  ctx.fillStyle = skin;
  ctx.fillRect(-hw - 4, bodyTop + 17 + armRaise, 4, 3);
  ctx.fillRect(hw, bodyTop + 17, 4, 3);
  // 디테일
  if (spec.top.style === 'shirt') {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-4, bodyTop); ctx.lineTo(0, bodyTop + 5); ctx.lineTo(4, bodyTop); ctx.closePath(); ctx.fill();
    ctx.fillStyle = topDark;
    for (let i = 0; i < 3; i++) ctx.fillRect(-0.7, bodyTop + 7 + i * 4, 1.4, 1.4);
  } else if (spec.top.style === 'hoodie') {
    ctx.fillStyle = topDark;
    ctx.fillRect(-5, bodyTop + 13, 10, 5);
    ctx.fillStyle = '#fff'; ctx.fillRect(-2, bodyTop + 2, 1, 6); ctx.fillRect(1, bodyTop + 2, 1, 6);
  } else if (spec.top.style === 'suit') {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-5, bodyTop); ctx.lineTo(0, bodyTop + 9); ctx.lineTo(5, bodyTop); ctx.closePath(); ctx.fill();
    ctx.fillStyle = topColor === '#2f3542' ? '#c0504d' : topColor;
    ctx.beginPath(); ctx.moveTo(-1.5, bodyTop + 2); ctx.lineTo(1.5, bodyTop + 2); ctx.lineTo(1, bodyTop + 11); ctx.lineTo(-1, bodyTop + 11); ctx.closePath(); ctx.fill();
  }
  // 벨트 라인
  ctx.fillStyle = shade(spec.bottom.color, 0.8);
  ctx.fillRect(-hw + 1, bodyTop + bodyH - 2, bw - 2, 2);

  // ---- 머리 ----
  const headY = -40, headR = 9;
  const hair = spec.hair, hc = hair.color;
  // 뒤쪽 머리 (머리 뒤에 먼저)
  if (hair.style === 'long') { ctx.fillStyle = hc; roundRect(ctx, -headR - 1, headY - 4, headR * 2 + 2, 22, 5); ctx.fill(); }
  if (hair.style === 'bob') { ctx.fillStyle = hc; roundRect(ctx, -headR - 1.5, headY - 4, headR * 2 + 3, 15, 5); ctx.fill(); }
  if (hair.style === 'pony') { ctx.fillStyle = hc; roundRect(ctx, faceRight ? -headR - 4 : headR - 1, headY - 2, 5, 16, 2.5); ctx.fill(); }
  // 얼굴
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();
  // 앞머리
  ctx.fillStyle = hc;
  if (hair.style === 'bald') {
    ctx.fillStyle = shade(skin, 0.95);
    ctx.beginPath(); ctx.arc(0, headY - 1, headR, Math.PI * 1.15, Math.PI * 1.85); ctx.fill();
  } else if (hair.style === 'curly') {
    for (const [dx, dy, r] of [[-7, -5, 4], [-3, -8, 4.5], [2, -9, 4.5], [7, -5, 4], [-9, 0, 3], [9, 0, 3]]) { ctx.beginPath(); ctx.arc(dx, headY + dy, r, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.beginPath(); ctx.arc(0, headY - 2, headR, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-headR, headY - 2, headR * 2, hair.style === 'short' ? 2.5 : 4);
    if (hair.style === 'long' || hair.style === 'bob') { ctx.fillRect(-headR, headY - 2, 2.5, 9); ctx.fillRect(headR - 2.5, headY - 2, 2.5, 9); }
  }
  // 눈
  ctx.fillStyle = '#2b2f3a';
  const ex = faceRight ? 3 : -3;
  ctx.fillRect(ex - 1, headY + 1, 2, 2);
  ctx.fillRect(ex + (faceRight ? -5 : 5) - 1, headY + 1, 2, 2);
  // 입/볼
  ctx.fillStyle = 'rgba(224,82,82,0.35)';
  ctx.fillRect(ex - 3, headY + 4, 2, 1.2);
  ctx.restore();
}
