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
