'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const charsP = import('../public/js/scene/characters.js');

test('시트: 12명 모두 webp 가 있고, 크기가 SHEET 의 행·열과 맞는다', async () => {
  const { CHARACTERS, SHEET } = await charsP;
  assert.equal(CHARACTERS.length, 12);
  const cols = Math.max(...SHEET.ROWS.map((r) => r.frames));
  let total = 0;
  for (const name of CHARACTERS) {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'characters', `${name}.webp`));
    total += buf.length;
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
    // VP8X(확장, 알파) 헤더: 너비-1, 높이-1 이 24비트 리틀엔디언
    assert.equal(buf.toString('ascii', 12, 16), 'VP8X', `${name}: 알파가 있는 확장 webp`);
    const w = buf.readUIntLE(24, 3) + 1, h = buf.readUIntLE(27, 3) + 1;
    assert.deepEqual([w, h], [SHEET.W * cols, SHEET.H * SHEET.ROWS.length], name);
  }
  assert.ok(total < 1.5 * 1024 * 1024, `12장 합 ${(total / 1024).toFixed(0)} KB`);
});

test('resolveCharacter: 이름은 그대로, auto 는 키 해시로 늘 같은 캐릭터, 여러 키에 고루 퍼진다', async () => {
  const { CHARACTERS, resolveCharacter, normalizeCharacter } = await charsP;
  assert.equal(resolveCharacter('female-d', 'x'), 'female-d');
  const a = resolveCharacter('auto', 'sess-1/main');
  assert.equal(resolveCharacter('auto', 'sess-1/main'), a);
  assert.ok(CHARACTERS.includes(a));
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(resolveCharacter('auto', `${(i * 2654435761 >>> 0).toString(16)}-session/main`));
  assert.ok(seen.size >= 10, `200개 세션에 ${seen.size}명`);
  assert.equal(normalizeCharacter('robot', 'auto'), 'auto', '모르는 값은 기본값');
  assert.equal(normalizeCharacter({ body: 'human' }, 'male-c'), 'male-c', 'v1 파츠 저장값은 기본값');
  assert.equal(normalizeCharacter('male-a'), 'male-a');
});

test('frameOf: 걷기 > 앉기 > 타이핑 > 끄덕임 > 서기, 칸은 행의 프레임 수 안', async () => {
  const { frameOf, SHEET } = await charsP;
  const id = (o) => SHEET.ROWS[frameOf(o).row].id;
  assert.equal(id({}), 'idle');
  assert.equal(id({ walking: true, sitting: true, typing: true }), 'walk');
  assert.equal(id({ sitting: true, typing: true }), 'sit');
  assert.equal(id({ typing: true, nod: true }), 'type');
  assert.equal(id({ nod: true }), 'nod');
  for (let t = 0; t < 5000; t += 37) for (const o of [{ now: t }, { walking: true, walkT: t / 1000 }, { typing: true, now: t, seed: 3.3 }, { nod: true, now: t }]) {
    const f = frameOf(o);
    assert.ok(f.col >= 0 && f.col < SHEET.ROWS[f.row].frames, JSON.stringify(o));
  }
});

test('avatarStore: 대상별 저장·기본값, 층 설정 우선, 나는 auto 불가', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const { createAvatarStore } = await import('../public/js/avatarStore.js');
  const { CHARACTERS } = await charsP;
  const s = createAvatarStore();
  assert.equal(s.get('me'), 'male-a');
  assert.equal(s.get('claude'), 'auto');
  s.set('me', 'auto');
  assert.equal(s.get('me'), 'male-a', '나는 자동이 없다');
  s.set('claude', 'female-b');
  const claude = { key: 's1/main', kind: 'main' };
  assert.equal(s.forActor(claude, 'f1'), 'female-b');
  s.set('floor:f1', 'auto');
  const onFloor = s.forActor(claude, 'f1');
  assert.ok(CHARACTERS.includes(onFloor), '층 설정이 auto 면 세션마다');
  assert.equal(s.forActor(claude, 'f2'), 'female-b', '다른 층은 Claude 기본');
  assert.ok(CHARACTERS.includes(s.forActor({ key: 's1/agent-1', kind: 'sub' }, 'f1')));
  assert.equal(s.forActor({ user: true }, 'f1'), 'male-a');
  const again = createAvatarStore();
  assert.equal(again.get('claude'), 'female-b', 'localStorage 에 남는다');
  again.reset('claude');
  assert.equal(again.get('claude'), 'auto');
});

test('커스텀 값(FE-56): custom:<id> 는 정규화·해결에서 그대로, 자동은 Kenney 12명 중에서만', async () => {
  const { CHARACTERS, isCustomCharacter, normalizeCharacter, resolveCharacter } = await charsP;
  assert.equal(isCustomCharacter('custom:abc123'), true);
  for (const bad of ['custom:', 'custom:ABC', 'custom:a/b', 'custom:<x>', 'male-a', 'auto', null, 42]) assert.equal(isCustomCharacter(bad), false, String(bad));
  assert.equal(normalizeCharacter('custom:abc123', 'auto'), 'custom:abc123');
  assert.equal(normalizeCharacter('custom:"><img>', 'male-a'), 'male-a', '이상한 값은 기본값');
  assert.equal(resolveCharacter('custom:abc123', 'sess/main'), 'custom:abc123');
  for (let i = 0; i < 100; i++) assert.ok(CHARACTERS.includes(resolveCharacter('auto', `k${i}`)), '자동은 Kenney 만');
});

test('alphaBounds · fitSize: 투명 여백 잘라내기와 긴 변 줄이기', async () => {
  const { alphaBounds, fitSize } = await import('../public/js/customCharacters.js');
  const w = 10, h = 8, data = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, a) => { data[(y * w + x) * 4 + 3] = a; };
  assert.equal(alphaBounds(data, w, h), null, '전부 투명');
  put(3, 2, 255); put(6, 5, 200); put(9, 7, 8); // 마지막은 거의 투명이라 무시
  assert.deepEqual(alphaBounds(data, w, h), { x: 3, y: 2, w: 4, h: 4, opaque: false });
  assert.equal(alphaBounds(new Uint8ClampedArray(4 * 4 * 4).fill(255), 4, 4).opaque, true, '투명 픽셀이 없으면 opaque');
  assert.deepEqual(fitSize(1000, 500), { w: 256, h: 128 });
  assert.deepEqual(fitSize(90, 120), { w: 90, h: 120 }, '작은 그림은 그대로');
  assert.deepEqual(fitSize(3000, 2), { w: 256, h: 1 }, '한 변이 0 이 되지 않는다');
});

test('커스텀 저장소: 더하기·지우기, 지운 그림을 가리키던 설정은 기본값, 용량·개수 한도, 저장 실패 되돌리기', async () => {
  const mem = new Map();
  let full = false;
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); mem.set(k, String(v)); }, removeItem: (k) => mem.delete(k) };
  const { createAvatarStore } = await import('../public/js/avatarStore.js');
  const { createCustomCharacters, LIMITS } = await import('../public/js/customCharacters.js');
  const { CHARACTERS, isCustomCharacter } = await charsP;
  const png = (n = 100) => ({ src: 'data:image/png;base64,' + 'A'.repeat(n), w: 40, h: 64, name: '고양이' });

  const s = createAvatarStore();
  const a = s.customs.add(png());
  assert.ok(isCustomCharacter(a.value), JSON.stringify(a));
  const b = s.customs.add(png());
  assert.notEqual(a.value, b.value, 'id 가 겹치지 않는다');
  assert.equal(s.customs.list().length, 2);
  assert.equal(s.customs.list()[0].name, '고양이');
  s.set('claude', a.value); s.set('me', b.value); s.set('sub', a.value);
  assert.equal(s.forActor({ key: 's1/main', kind: 'main' }, 'f1'), a.value, 'Claude 에 커스텀');
  assert.equal(s.forActor({ user: true }, 'f1'), b.value, '나에게도 커스텀');
  assert.equal(s.forActor({ key: 's1/agent-1', kind: 'sub' }, 'f1'), a.value, '서브에도 커스텀');

  // 새로 만들어도(새로 고침) 그림과 설정이 남는다
  const again = createAvatarStore();
  assert.equal(again.get('claude'), a.value);
  assert.equal(again.customs.list().length, 2);

  let notified = 0; again.subscribe(() => notified++);
  again.customs.remove(a.value);
  assert.ok(notified > 0, '지우면 구독자에게 알린다');
  assert.equal(again.customs.has(a.value), false);
  assert.equal(again.get('claude'), 'auto', '지운 그림을 쓰던 Claude 는 기본값(자동)');
  assert.ok(CHARACTERS.includes(again.forActor({ key: 's1/main', kind: 'main' }, 'f1')));
  assert.equal(again.get('sub'), 'auto');
  assert.equal(again.get('me'), b.value, '남은 그림은 그대로');

  // 한도: 한 장이 너무 크면 / 개수가 넘으면 / localStorage 가 꽉 차면
  const c = createCustomCharacters();
  assert.deepEqual(c.add(png(LIMITS.srcChars + 1)), { error: 'quota' });
  assert.deepEqual(c.add({ src: 'javascript:alert(1)' }), { error: 'decode' }, 'dataURL 그림만');
  full = true;
  const before = c.list().length;
  assert.deepEqual(c.add(png()), { error: 'quota' }, 'QuotaExceeded');
  assert.equal(c.list().length, before, '저장 실패면 목록도 그대로');
  full = false;
  while (c.list().length < LIMITS.count) assert.ok(c.add(png()).value);
  assert.deepEqual(c.add(png()), { error: 'too-many' });

  // 깨진 저장값은 무시
  mem.set('aiOffice.customCharacters.v1', '[{"id":"BAD","src":"data:image/png;base64,A"},{"id":"ok1","src":"http://x/y.png"},{"id":"ok2","src":"data:image/png;base64,A"}]');
  assert.deepEqual(createCustomCharacters().list().map((x) => x.id), ['ok2']);
  mem.set('aiOffice.customCharacters.v1', 'not json');
  assert.deepEqual(createCustomCharacters().list(), []);
});
