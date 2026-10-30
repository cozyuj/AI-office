'use strict';
// 백그라운드 훅의 도착 순서 보정 (FE-66)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createReorder } = require('../lib/reorder');

test('reorder: 시작 시각 순으로 적용하고, 기다린 시간이 지나야 내보낸다', () => {
  const out = [];
  const r = createReorder((p, now) => out.push([p, now]), { delay: 300 });
  r.push('post', 1010, 1050); // Pre 보다 먼저 도착
  r.push('pre', 1000, 1060);
  assert.deepEqual(out, [], '아직 기다리는 중');
  r.flush(1300);
  assert.deepEqual(out.map((x) => x[0]), ['pre'], '300ms 지난 것만');
  r.flush(1310);
  assert.deepEqual(out.map((x) => x[0]), ['pre', 'post']);
  assert.equal(r.size, 0);
});

test('reorder: 시각이 없거나 크게 어긋나면 쌓인 것을 먼저 내보내고 바로 적용한다', () => {
  const out = [];
  const r = createReorder((p) => out.push(p), { delay: 300 });
  r.push('a', 1000, 1010);
  r.push('dismiss', NaN, 1020);
  assert.deepEqual(out, ['a', 'dismiss']);
  r.push('skewed', 1, 1030);
  assert.deepEqual(out, ['a', 'dismiss', 'skewed']);
});

test('reorder: 늦게 도착한 것은 바로 적용하고, 적용 오류가 대기열을 막지 않는다', () => {
  const out = [];
  const r = createReorder((p) => { if (p === 'bad') throw new Error('x'); out.push(p); }, { delay: 300 });
  const err = console.error; console.error = () => {};
  try {
    r.push('bad', 1000, 1010);
    r.push('ok', 1001, 1020);
    r.push('late', 1002, 2000);
  } finally { console.error = err; }
  assert.deepEqual(out, ['ok', 'late']);
  r.push('x', 3000, 3000);
  r.drain(3000);
  assert.deepEqual(out, ['ok', 'late', 'x'], 'drain 은 기다리지 않는다');
});

test('reorder: 타이머로 스스로 내보낸다', async () => {
  const out = [];
  const r = createReorder((p) => out.push(p), { delay: 30 });
  const now = Date.now();
  r.push('b', now + 1);
  r.push('a', now);
  await new Promise((res) => setTimeout(res, 80));
  assert.deepEqual(out, ['a', 'b']);
});
