'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const lpcP = import('../public/js/scene/lpc.js');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'lpc', 'manifest.json'), 'utf8'));

test('recolorPixels: 램프 색만 정확히 치환, 투명 픽셀은 건너뜀', async () => {
  const { recolorPixels } = await lpcP;
  const from = ['#271920', '#99423c', '#cc8665'], to = ['#000000', '#112233', '#ffffff'];
  const data = new Uint8ClampedArray([0x27, 0x19, 0x20, 255, 0x99, 0x42, 0x3c, 255, 0xcc, 0x86, 0x65, 0, 0x12, 0x34, 0x56, 255]);
  const changed = recolorPixels(data, from, to);
  assert.equal(changed, 2);
  assert.deepEqual([...data.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...data.slice(4, 8)], [0x11, 0x22, 0x33, 255]);
  assert.deepEqual([...data.slice(8, 12)], [0xcc, 0x86, 0x65, 0], '투명 픽셀 유지');
  assert.deepEqual([...data.slice(12, 16)], [0x12, 0x34, 0x56, 255], '램프 밖 색 유지');
});

test('manifest: 몸/머리 base 와 파츠·팔레트가 있고 파일이 실제로 존재한다', () => {
  const root = path.join(__dirname, '..', 'public', 'assets', 'lpc', 'sheets');
  for (const bt of manifest.bodyTypes) {
    for (const k of ['body', 'head']) {
      const b = manifest.base[k][bt];
      assert.ok(b.anims.includes('walk'), `${k}/${bt} walk`);
      assert.ok(fs.existsSync(path.join(root, b.path, 'walk.png')));
    }
  }
  for (const cat of ['hair', 'top', 'bottom', 'shoes']) {
    assert.ok(manifest.items[cat].length >= 4, cat);
    for (const it of manifest.items[cat]) for (const l of it.layers) for (const p of Object.values(l.paths)) {
      for (const a of p.anims) assert.ok(fs.existsSync(path.join(root, p.path, `${a}.png`)), `${it.id} ${p.path}${a}`);
    }
  }
  for (const [m, p] of Object.entries(manifest.palettes)) assert.ok(p.ramps[p.base], `${m} base ramp`);
  assert.ok(fs.existsSync(path.join(root, '..', 'CREDITS.csv')));
});

test('createLpc: normalize/randomSpec 이 manifest 범위 안의 값만 낸다 (document 없이)', async () => {
  const { createLpc } = await lpcP;
  const lpc = createLpc(manifest);
  const n = lpc.normalize({ body: 'x', skin: 'nope', hair: { id: 'bob', color: 'zzz' }, top: { id: 'tshirt', color: 'auto' } });
  assert.equal(n.body, 'male');
  assert.equal(n.skin, lpc.defaults.claude.skin);
  assert.equal(n.hair.id, 'bob');
  assert.equal(n.hair.color, lpc.defaults.claude.hair.color);
  assert.equal(n.top.color, 'auto');
  for (let i = 0; i < 30; i++) {
    const s = lpc.randomSpec(i / 30 + 0.01);
    assert.deepEqual(lpc.normalize(s), s, '랜덤 결과는 이미 정규화됨');
    assert.notEqual(s.top.color, 'auto');
  }
  assert.equal(lpc.rampForSession('#3b6fd6'), 'blue');
  assert.equal(lpc.rampForSession('#123456'), 'orange');
});
