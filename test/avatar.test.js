'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const avatarP = import('../public/js/scene/avatar.js');

test('randomAvatar: 같은 seed 면 같은 결과, 옵션 안의 값만 쓴다', async () => {
  const { randomAvatar, OPTIONS } = await avatarP;
  const a = randomAvatar(0.42), b = randomAvatar(0.42), c = randomAvatar(0.43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (let i = 0; i < 50; i++) {
    const s = randomAvatar(i / 50 + 0.001);
    assert.ok(OPTIONS.skin.includes(s.skin));
    assert.ok(OPTIONS.hair.styles.some(([k]) => k === s.hair.style));
    assert.ok(OPTIONS.top.styles.some(([k]) => k === s.top.style));
    assert.ok(OPTIONS.glasses.some(([k]) => k === s.glasses));
    assert.ok(OPTIONS.hat.some(([k]) => k === s.hat));
    assert.ok(OPTIONS.extra.some(([k]) => k === s.extra));
    assert.notEqual(s.top.color, 'auto');
  }
});

test('normalizeAvatar: 깨진 값은 기본값으로, 임의의 #rrggbb 색은 허용', async () => {
  const { normalizeAvatar, DEFAULTS } = await avatarP;
  const n = normalizeAvatar({ skin: 'red', hair: { style: 'pony', color: '#ff7ab6' }, top: { style: 'suit', color: 'auto' }, shoes: '#123456', glasses: 'laser', hat: 'beret', extra: 'badge' }, DEFAULTS.claude);
  assert.equal(n.skin, DEFAULTS.claude.skin, '잘못된 색은 기본값');
  assert.equal(n.hair.style, 'pony');
  assert.equal(n.hair.color, '#ff7ab6', '프리셋이 아니어도 hex 면 허용');
  assert.equal(n.top.style, 'suit');
  assert.equal(n.top.color, 'auto');
  assert.equal(n.shoes, '#123456');
  assert.equal(n.glasses, 'none');
  assert.equal(n.hat, 'beret');
  assert.equal(n.extra, 'badge');
  assert.deepEqual(normalizeAvatar(null, DEFAULTS.me), DEFAULTS.me);
  // 옛(v1) 형식의 shoes:{color} 도 받는다
  assert.equal(normalizeAvatar({ shoes: { color: '#abcdef' } }, DEFAULTS.me).shoes, '#abcdef');
});

test('drawAvatar: 모든 스타일·악세사리 조합이 가짜 ctx 로 그려진다 (예외 없음)', async () => {
  const { drawAvatar, OPTIONS, DEFAULTS } = await avatarP;
  const calls = { fillRect: 0 };
  const fake = new Proxy({}, { get: (_, k) => (k === 'fillRect' ? () => calls.fillRect++ : () => fake) });
  for (const [h] of OPTIONS.hair.styles) for (const [t] of OPTIONS.top.styles) for (const [b] of OPTIONS.bottom.styles) for (const [g] of OPTIONS.glasses) for (const [hat] of OPTIONS.hat) for (const [x] of OPTIONS.extra) {
    const spec = { ...DEFAULTS.claude, hair: { style: h, color: '#000000' }, top: { style: t, color: 'auto' }, bottom: { style: b, color: '#111111' }, glasses: g, hat, extra: x };
    drawAvatar(fake, 0, 0, spec, { walking: true, walkT: 1, thinking: true, faceRight: false, hardHat: true });
  }
  assert.ok(calls.fillRect > 100);
});
