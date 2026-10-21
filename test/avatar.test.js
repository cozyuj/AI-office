'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const avatarP = import('../public/js/scene/avatar.js');

test('randomAvatar: 같은 seed 면 같은 결과, 옵션 안의 값만 쓴다', async () => {
  const { randomAvatar, OPTIONS } = await avatarP;
  const a = randomAvatar(0.42), b = randomAvatar(0.42), c = randomAvatar(0.43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const bodies = new Set();
  for (let i = 0; i < 80; i++) {
    const s = randomAvatar(i / 80 + 0.001);
    bodies.add(s.body);
    assert.ok(OPTIONS.body.some(([k]) => k === s.body));
    assert.ok(OPTIONS.bodySkins[s.body].includes(s.skin), '몸 종류에 맞는 피부·털·금속 색');
    assert.ok(OPTIONS.hair.styles.some(([k]) => k === s.hair.style));
    assert.ok(OPTIONS.top.styles.some(([k]) => k === s.top.style));
    assert.ok(OPTIONS.glasses.some(([k]) => k === s.glasses));
    assert.ok(OPTIONS.hat.some(([k]) => k === s.hat));
    assert.ok(OPTIONS.extra.some(([k]) => k === s.extra));
    assert.notEqual(s.top.color, 'auto');
  }
  assert.ok(bodies.has('human') && bodies.size > 1, '사람이 대부분이지만 다른 몸도 나온다');
});

test('normalizeAvatar: 깨진 값은 기본값으로, 임의의 #rrggbb 색은 허용, body 없는 옛 저장값은 사람', async () => {
  const { normalizeAvatar, DEFAULTS } = await avatarP;
  const n = normalizeAvatar({ body: 'dragon', skin: 'red', hair: { style: 'pony', color: '#ff7ab6' }, top: { style: 'suit', color: 'auto' }, shoes: '#123456', glasses: 'laser', hat: 'beret', extra: 'badge' }, DEFAULTS.claude);
  assert.equal(n.body, 'human', '모르는 몸 종류는 사람');
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
  // v2 (body 없음) 저장값 → 사람
  const old = { skin: '#eec4a3', hair: { style: 'bob', color: '#2b2320' }, top: { style: 'tee', color: '#3b6fd6' }, bottom: { style: 'skirt', color: '#1f2430' }, shoes: '#2b2f3a', glasses: 'round', hat: 'none', hatColor: '#2f3542', extra: 'none' };
  assert.deepEqual(normalizeAvatar(old, DEFAULTS.me), { body: 'human', ...old });
  // 새 몸 종류·파츠는 그대로
  const robo = normalizeAvatar({ body: 'robot', skin: '#c9d1d9', hair: { style: 'mohawk', color: '#2fa36b' }, top: { style: 'labcoat', color: '#1fa2b5' }, glasses: 'goggles', hat: 'tophat', extra: 'cape' }, DEFAULTS.claude);
  assert.equal(robo.body, 'robot'); assert.equal(robo.hair.style, 'mohawk'); assert.equal(robo.top.style, 'labcoat');
  assert.equal(robo.glasses, 'goggles'); assert.equal(robo.hat, 'tophat'); assert.equal(robo.extra, 'cape');
});

test('PRESETS: 모두 유효한 spec 이고 id 가 겹치지 않는다', async () => {
  const { PRESETS, normalizeAvatar, DEFAULTS, OPTIONS } = await avatarP;
  assert.ok(PRESETS.length >= 8);
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
  for (const p of PRESETS) {
    assert.ok(p.label);
    assert.deepEqual(normalizeAvatar(p.spec, DEFAULTS.claude), p.spec, `${p.id} 프리셋이 normalize 로 바뀌면 안 됨`);
    assert.ok(OPTIONS.bodySkins[p.spec.body].includes(p.spec.skin), `${p.id} 피부색은 몸 팔레트 안`);
  }
  assert.ok(['robot', 'cat', 'bear'].every((b) => PRESETS.some((p) => p.spec.body === b)), '사람이 아닌 몸 프리셋이 있다');
});

test('drawAvatar: 모든 몸·스타일·악세사리 조합이 가짜 ctx 로 그려진다 (예외 없음)', async () => {
  const { drawAvatar, OPTIONS, DEFAULTS } = await avatarP;
  const calls = { fillRect: 0, n: 0 };
  const fake = new Proxy({}, { get: (_, k) => (k === 'fillRect' ? () => calls.fillRect++ : () => { calls.n++; return fake; }) });
  const opts = [{ walking: true, walkT: 1, thinking: true, faceRight: false, hardHat: true }, { blink: true, typing: true, now: 123, faceRight: true }];
  const base = (body) => ({ ...DEFAULTS.claude, body, hair: { style: 'short', color: '#000000' }, top: { style: 'tee', color: 'auto' }, bottom: { style: 'pants', color: '#111111' } });
  for (const [body] of OPTIONS.body) {
    // 몸 × 머리 × 상의 × 하의
    for (const [h] of OPTIONS.hair.styles) for (const [t] of OPTIONS.top.styles) for (const [b] of OPTIONS.bottom.styles) {
      const spec = { ...base(body), hair: { style: h, color: '#000000' }, top: { style: t, color: 'auto' }, bottom: { style: b, color: '#111111' } };
      for (const o of opts) drawAvatar(fake, 0, 0, spec, o);
    }
    // 몸 × 안경 × 모자 × 소품
    for (const [g] of OPTIONS.glasses) for (const [hat] of OPTIONS.hat) for (const [x] of OPTIONS.extra) {
      const spec = { ...base(body), glasses: g, hat, extra: x };
      for (const o of opts) drawAvatar(fake, 0, 0, spec, o);
    }
  }
  assert.ok(calls.fillRect > 100);
  assert.ok(calls.n > 1000);
});
