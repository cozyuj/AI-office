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
    assert.notEqual(s.top.color, 'auto');
    if (s.gender === 'f') assert.notEqual(s.hair.style, 'bald');
    if (s.gender === 'm') assert.notEqual(s.bottom.style, 'skirt');
  }
});

test('normalizeAvatar: 깨진 값은 기본값으로, 유효한 값은 유지', async () => {
  const { normalizeAvatar, DEFAULTS } = await avatarP;
  const n = normalizeAvatar({ gender: 'x', skin: 'red', hair: { style: 'pony', color: 'nope' }, top: { style: 'suit', color: 'auto' } }, DEFAULTS.claude);
  assert.equal(n.gender, 'n');
  assert.equal(n.skin, DEFAULTS.claude.skin);
  assert.equal(n.hair.style, 'pony');
  assert.equal(n.hair.color, DEFAULTS.claude.hair.color);
  assert.equal(n.top.style, 'suit');
  assert.equal(n.top.color, 'auto');
  assert.deepEqual(n.bottom, DEFAULTS.claude.bottom);
  assert.deepEqual(normalizeAvatar(null, DEFAULTS.me), DEFAULTS.me);
});

test('drawAvatar: 모든 스타일 조합이 가짜 ctx 로 그려진다 (예외 없음)', async () => {
  const { drawAvatar, OPTIONS, DEFAULTS } = await avatarP;
  const calls = { fillRect: 0 };
  const fake = new Proxy({}, { get: (_, k) => (k === 'fillRect' ? () => calls.fillRect++ : () => fake) });
  for (const [g] of OPTIONS.gender) for (const [h] of OPTIONS.hair.styles) for (const [t] of OPTIONS.top.styles) for (const [b] of OPTIONS.bottom.styles) {
    const spec = { ...DEFAULTS.claude, gender: g, hair: { style: h, color: '#000' }, top: { style: t, color: 'auto' }, bottom: { style: b, color: '#111' }, shoes: { color: '#222' } };
    drawAvatar(fake, 0, 0, spec, { walking: true, walkT: 1, activity: 'think', faceRight: false });
  }
  assert.ok(calls.fillRect > 100);
});
