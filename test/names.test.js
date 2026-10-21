'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const namesP = import('../public/js/names.js');

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };

test('자동 별명: 처음 본 순서대로 서로 다른 이름, 같은 세션은 항상 같은 이름, 저장소에 남아 다시 열어도 같다', async () => {
  const { createNameBook, NAME_POOL } = await namesP;
  const st = memStorage();
  const book = createNameBook(st);
  const got = [];
  for (let i = 0; i < NAME_POOL.length; i++) got.push(book.nameOf(`s${i}`));
  assert.equal(new Set(got).size, NAME_POOL.length, '풀 크기만큼은 겹치지 않는다');
  assert.equal(book.nameOf('s3'), got[3]);
  assert.ok(NAME_POOL.includes(book.nameOf('s999')), '풀을 다 쓰면 덜 쓰인 이름부터 다시');
  const again = createNameBook(st);
  assert.equal(again.nameOf('s3'), got[3], '새로 열어도 같은 별명');
  assert.equal(again.isCustom('s3'), false);
});

test('직접 지은 이름이 우선, 빈 값이면 자동 별명으로 복귀, 🎲 는 다른 별명', async () => {
  const { createNameBook, NAME_MAX } = await namesP;
  const st = memStorage();
  const book = createNameBook(st);
  const auto = book.nameOf('a');
  assert.equal(book.set('a', '  코딩요정  '), '코딩요정');
  assert.equal(book.nameOf('a'), '코딩요정');
  assert.equal(book.isCustom('a'), true);
  assert.equal(createNameBook(st).nameOf('a'), '코딩요정', '저장됨');
  assert.equal(book.set('a', '   '), auto, '비우면 원래 자동 별명');
  assert.equal(book.isCustom('a'), false);
  const r = book.reroll('a');
  assert.notEqual(r, auto);
  assert.equal(book.nameOf('a'), r);
  assert.equal(book.set('a', 'x'.repeat(40)).length, NAME_MAX, '길이 제한');
  book.set('a', '친구'); book.reroll('a'); assert.equal(book.isCustom('a'), false, '🎲 는 직접 지은 이름도 지운다');
});

test('깨진 저장값·저장소 없음도 동작', async () => {
  const { createNameBook, NAME_POOL } = await namesP;
  const st = memStorage(); st.setItem('aiOffice.names.v1', '{"custom":5,"auto":"x"');
  assert.ok(NAME_POOL.includes(createNameBook(st).nameOf('z')));
  const st2 = memStorage(); st2.setItem('aiOffice.names.v1', '{"custom":5,"auto":"x"}');
  assert.ok(NAME_POOL.includes(createNameBook(st2).nameOf('z')));
  assert.ok(NAME_POOL.includes(createNameBook(null).nameOf('z')));
});

test('풀에 없는 옛 자동 별명(한글 풀)은 새 풀의 이름으로 다시 배정된다', async () => {
  const { createNameBook, NAME_POOL } = await namesP;
  const st = memStorage(); st.setItem('aiOffice.names.v1', JSON.stringify({ custom: { b: '하늘' }, auto: { a: '하늘', c: 'Mia' } }));
  const book = createNameBook(st);
  assert.ok(NAME_POOL.includes(book.nameOf('a')));
  assert.equal(book.nameOf('b'), '하늘', '직접 지은 이름은 그대로');
  assert.equal(book.nameOf('c'), 'Mia');
});
