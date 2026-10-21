// 치비 캐릭터: 피부·머리·상의·하의·신발 + 안경·모자·소품을 코드로 그린다 (플랫 벡터 스타일).
// spec = { skin, hair:{style,color}, top:{style,color}, bottom:{style,color}, shoes, glasses, hat, hatColor, extra }
// 색은 프리셋 또는 임의의 #rrggbb. top.color 'auto' 는 세션 색.
import { shade } from './sprites.js';

export const OPTIONS = {
  skin: ['#fbe3cf', '#f6d7bf', '#eec4a3', '#d8a97f', '#b6865c', '#8d5a3b', '#5c3a24'],
  hair: { styles: [['short', '짧은'], ['bangs', '앞머리'], ['bob', '단발'], ['long', '긴 머리'], ['pony', '포니테일'], ['bun', '똥머리'], ['curly', '곱슬'], ['bald', '민머리']],
    colors: ['#2b2320', '#4a3528', '#7a5236', '#a86b3b', '#d9a24a', '#e8d8b8', '#c0504d', '#3b6fd6', '#7a4fa3', '#2fa36b'] },
  top: { styles: [['tee', '티셔츠'], ['hoodie', '후드'], ['shirt', '셔츠'], ['suit', '정장'], ['dress', '원피스']],
    colors: ['auto', '#e8683a', '#3b6fd6', '#2fa36b', '#9b59b6', '#e0a526', '#1fa2b5', '#d9507a', '#f4f4f4', '#2f3542'] },
  bottom: { styles: [['pants', '바지'], ['shorts', '반바지'], ['skirt', '치마']],
    colors: ['#3a3f4b', '#2f4a7a', '#6b4e3d', '#8a8f99', '#d8cfc0', '#1f2430', '#b85c5c'] },
  shoes: { colors: ['#2b2f3a', '#6b4e3d', '#f4f4f4', '#c0504d', '#3b6fd6', '#e8683a'] },
  glasses: [['none', '없음'], ['round', '둥근 안경'], ['square', '네모 안경'], ['sun', '선글라스']],
  hat: [['none', '없음'], ['cap', '캡'], ['beanie', '비니'], ['beret', '베레모'], ['band', '머리띠']],
  extra: [['none', '없음'], ['headphones', '헤드폰'], ['scarf', '스카프'], ['badge', '사원증'], ['earring', '귀걸이']],
};

export const DEFAULTS = {
  claude: { skin: '#f6d7bf', hair: { style: 'short', color: '#4a3528' }, top: { style: 'tee', color: 'auto' }, bottom: { style: 'pants', color: '#3a3f4b' }, shoes: '#2b2f3a', glasses: 'none', hat: 'none', hatColor: '#2f3542', extra: 'none' },
  sub: { skin: '#eec4a3', hair: { style: 'curly', color: '#2b2320' }, top: { style: 'hoodie', color: '#3b6fd6' }, bottom: { style: 'pants', color: '#2f4a7a' }, shoes: '#f4f4f4', glasses: 'none', hat: 'none', hatColor: '#2f3542', extra: 'badge' },
  me: { skin: '#f6d7bf', hair: { style: 'bangs', color: '#2b2320' }, top: { style: 'shirt', color: '#f4f4f4' }, bottom: { style: 'pants', color: '#1f2430' }, shoes: '#2b2f3a', glasses: 'none', hat: 'none', hatColor: '#2f3542', extra: 'none' },
};

const HEX = /^#[0-9a-f]{6}$/i;
const isColor = (v) => typeof v === 'string' && HEX.test(v);
const hasKey = (list, v) => list.some((o) => (Array.isArray(o) ? o[0] : o) === v);

export function randomAvatar(seed = Math.random()) {
  let x = Math.floor(seed * 2 ** 31) || 1;
  const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
  const p = (arr) => arr[Math.floor(r() * arr.length)];
  return {
    skin: p(OPTIONS.skin),
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

/** 깨진/옛 spec 을 기본값으로 채운다. 색은 프리셋이 아니어도 #rrggbb 면 허용 */
export function normalizeAvatar(spec, base = DEFAULTS.claude) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const color = (v, fallback, allowAuto = false) => (isColor(v) || (allowAuto && v === 'auto')) ? v : fallback;
  return {
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

/**
 * 발 위치 (fx, fy) 에 치비를 그린다. 키 약 58px (1배).
 * o: { sessionColor, walking, walkT, now, faceRight, scale, hardHat, sitting }
 */
export function drawAvatar(ctx, fx, fy, s, o = {}) {
  const sc = o.scale || 1;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(sc, sc);
  const top = s.top.color === 'auto' ? (o.sessionColor || '#e8683a') : s.top.color;
  const skin = s.skin, hair = s.hair.color, bot = s.bottom.color;
  const swing = o.walking ? Math.sin((o.walkT || 0) * 9) * 3 : 0;
  const faceRight = o.faceRight !== false;
  const hy = -44, R = 14;
  const hs = s.hair.style;

  // 뒷머리 (몸통 뒤)
  if (hs === 'long') rr(ctx, -R - 1, hy - 4, 2 * R + 2, 24, 6, hair);
  if (hs === 'bob') rr(ctx, -R - 1.5, hy - 4, 2 * R + 3, 17, 6, hair);
  if (hs === 'pony') rr(ctx, faceRight ? -R - 4 : R - 2, hy - 2, 6, 22, 3, hair);
  if (hs === 'bun') { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(0, hy - 14, 6, 0, Math.PI * 2); ctx.fill(); }

  // 다리 + 신발
  const legSkin = s.bottom.style !== 'pants';
  const lTop = -12 + Math.max(0, swing), rTop = -12 + Math.max(0, -swing);
  rr(ctx, -7, lTop, 6, -lTop - 2, 2, legSkin ? skin : bot);
  rr(ctx, 1, rTop, 6, -rTop - 2, 2, legSkin ? skin : bot);
  if (s.bottom.style === 'shorts') { rr(ctx, -7, -12, 6, 5, 2, bot); rr(ctx, 1, -12, 6, 5, 2, bot); }
  rr(ctx, -8, -4 + Math.max(0, swing) * 0.3, 7, 4, 2, s.shoes);
  rr(ctx, 1, -4 + Math.max(0, -swing) * 0.3, 7, 4, 2, s.shoes);

  // 몸통
  const isDress = s.top.style === 'dress';
  const bodyC = s.top.style === 'suit' ? '#2f3542' : top;
  if (s.top.style === 'hoodie') { ctx.fillStyle = shade(top, 0.8); ctx.beginPath(); ctx.arc(0, -31, 11, Math.PI, Math.PI * 2); ctx.fill(); }
  rr(ctx, -10, -30, 20, isDress ? 22 : 20, 7, bodyC);
  if (s.bottom.style === 'skirt' || isDress) {
    ctx.fillStyle = isDress ? bodyC : bot;
    ctx.beginPath(); ctx.moveTo(-9, -14); ctx.lineTo(9, -14); ctx.lineTo(12, -6); ctx.lineTo(-12, -6); ctx.closePath(); ctx.fill();
  }
  // 팔
  const bare = s.top.style === 'tee' || isDress;
  const armRaise = o.thinking ? -4 : (o.typing ? Math.round(Math.sin((o.now || 0) / 90) * 1.5) : 0);
  rr(ctx, -14, -28, 4, 12 + armRaise, 2, bare ? skin : bodyC);
  rr(ctx, 10, -28, 4, 12, 2, bare ? skin : bodyC);
  if (bare) { rr(ctx, -14, -28, 4, 5, 2, bodyC); rr(ctx, 10, -28, 4, 5, 2, bodyC); }
  rr(ctx, -14, -17 + armRaise, 4, 4, 2, skin);
  rr(ctx, 10, -17, 4, 4, 2, skin);
  if (s.top.style === 'shirt') {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-4, -30); ctx.lineTo(0, -25); ctx.lineTo(4, -30); ctx.fill();
    ctx.fillStyle = shade(top, 0.75); for (let i = 0; i < 3; i++) ctx.fillRect(-0.7, -23 + i * 4, 1.4, 1.4);
  }
  if (s.top.style === 'suit') {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-5, -30); ctx.lineTo(0, -21); ctx.lineTo(5, -30); ctx.fill();
    ctx.fillStyle = top === '#2f3542' ? '#c0504d' : top; ctx.fillRect(-1.5, -28, 3, 8);
  }
  if (s.top.style === 'hoodie') { ctx.fillStyle = shade(top, 0.8); ctx.fillRect(-5, -17, 10, 5); ctx.fillStyle = '#fff'; ctx.fillRect(-2, -28, 1, 6); ctx.fillRect(1, -28, 1, 6); }
  if (s.extra === 'scarf') { rr(ctx, -11, -32, 22, 6, 3, '#c0504d'); rr(ctx, 3, -30, 6, 12, 2, '#c0504d'); }
  if (s.extra === 'badge') { rr(ctx, 4, -26, 5, 7, 1, '#fff'); rr(ctx, 4, -26, 5, 2, 1, '#3b6fd6'); ctx.strokeStyle = '#8a919b'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(6.5, -26); ctx.lineTo(6.5, -30); ctx.stroke(); }

  // 머리
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, hy, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hair;
  if (hs === 'bald') {
    ctx.fillStyle = shade(skin, 0.96); ctx.beginPath(); ctx.arc(0, hy - 1, R, Math.PI * 1.15, Math.PI * 1.85); ctx.fill();
  } else if (hs === 'curly') {
    for (const [dx, dy, r] of [[-11, -6, 6], [-5, -12, 6.5], [3, -13, 6.5], [10, -6, 6], [-14, 2, 4.5], [14, 2, 4.5]]) { ctx.beginPath(); ctx.arc(dx, hy + dy, r, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.beginPath(); ctx.arc(0, hy - 2, R + 0.5, Math.PI, Math.PI * 2); ctx.fill();
    rr(ctx, -R - 0.5, hy - 3, 2 * R + 1, 5, 2, hair);
    if (hs === 'bangs' || hs === 'bob' || hs === 'long') {
      ctx.beginPath(); ctx.moveTo(-12, hy + 2);
      for (let i = 0; i < 5; i++) { ctx.lineTo(-12 + i * 6 + 3, hy + 6); ctx.lineTo(-12 + (i + 1) * 6, hy + 2); }
      ctx.lineTo(12, hy - 3); ctx.lineTo(-12, hy - 3); ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(-13, hy + 1); ctx.lineTo(-6, hy - 2); ctx.lineTo(2, hy + 1); ctx.lineTo(9, hy - 2); ctx.lineTo(13, hy + 1); ctx.lineTo(13, hy - 4); ctx.lineTo(-13, hy - 4); ctx.closePath(); ctx.fill();
    }
  }
  // 얼굴
  const ex = faceRight ? 1 : -1;
  ctx.fillStyle = '#2b2f3a';
  if (o.blink) { ctx.fillRect(-7 + ex, hy + 5, 4, 1.4); ctx.fillRect(3 + ex, hy + 5, 4, 1.4); }
  else { ctx.beginPath(); ctx.arc(-5 + ex, hy + 5, 1.8, 0, Math.PI * 2); ctx.arc(5 + ex, hy + 5, 1.8, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(240,120,120,0.35)'; ctx.beginPath(); ctx.arc(-8, hy + 9, 2.5, 0, Math.PI * 2); ctx.arc(8, hy + 9, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b0605a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ex, hy + 9, 2, 0.2, Math.PI - 0.2); ctx.stroke();
  // 안경
  if (s.glasses && s.glasses !== 'none') {
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
  if (s.extra === 'earring') { ctx.fillStyle = '#e0a526'; ctx.beginPath(); ctx.arc(-R + 1, hy + 6, 1.6, 0, Math.PI * 2); ctx.arc(R - 1, hy + 6, 1.6, 0, Math.PI * 2); ctx.fill(); }
  // 모자
  const hc = s.hatColor || '#2f3542';
  if (s.hat === 'cap') { ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(0, hy - 4, R + 1, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, -R - 1, hy - 5, 2 * R + 2, 4, 2, hc); rr(ctx, faceRight ? -2 : -R - 4, hy - 3, R + 6, 3.5, 1.5, shade(hc, 0.8)); }
  if (s.hat === 'beanie') { ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(0, hy - 3, R + 2, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, -R - 2, hy - 5, 2 * R + 4, 5, 2, shade(hc, 0.85)); ctx.beginPath(); ctx.arc(0, hy - R - 4, 3.5, 0, Math.PI * 2); ctx.fillStyle = shade(hc, 1.15); ctx.fill(); }
  if (s.hat === 'beret') { ctx.fillStyle = hc; ctx.beginPath(); ctx.ellipse(-1.5, hy - 8, R + 3.5, 9.5, -0.18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade(hc, 0.9); ctx.beginPath(); ctx.arc(-1, hy - 17, 2, 0, Math.PI * 2); ctx.fill(); }
  if (s.hat === 'band') rr(ctx, -R - 1, hy - 7, 2 * R + 2, 3.5, 1.5, hc);
  // 서브에이전트 안전모 (모자 위)
  if (o.hardHat) { ctx.fillStyle = '#3b6fd6'; ctx.beginPath(); ctx.arc(0, hy - 4, 15, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, -17, hy - 5, 34, 3, 1.5, '#3b6fd6'); }
  ctx.restore();
}
