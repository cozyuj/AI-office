'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// render.js 는 canvas 없이도 import 가능 (그리기는 함수 안에서만 일어난다)
const renderP = import('../public/js/scene/render.js');

const box = (x0, y0, x1, y1, z1 = 1) => ({ x0, y0, x1, y1, z0: 0, z1 });

test('큰 테이블(3..7 × 12..14) 주변 의자: 북·서는 뒤, 남·동은 앞', async () => {
  const { makeEntity, compare } = await renderP;
  const table = makeEntity(box(3.05, 12.05, 6.95, 13.95, 0.75), () => {});
  const north = makeEntity(box(3.2, 11.2, 3.8, 11.8, 0.8), () => {});
  const west = makeEntity(box(2.2, 12.2, 2.8, 12.8, 0.8), () => {});
  const south = makeEntity(box(3.2, 14.2, 3.8, 14.8, 0.8), () => {});
  const east = makeEntity(box(7.2, 12.2, 7.8, 12.8, 0.8), () => {});
  assert.equal(compare(north, table), -1, '북쪽 의자가 먼저');
  assert.equal(compare(west, table), -1, '서쪽 의자가 먼저');
  assert.equal(compare(south, table), 1, '남쪽 의자가 나중 (앞)');
  assert.equal(compare(east, table), 1, '동쪽 의자가 나중 (앞)');
});

test('캐릭터와 긴 벽: 벽 북쪽이면 캐릭터가 뒤, 남쪽이면 앞', async () => {
  const { makeEntity, compare } = await renderP;
  const wall = makeEntity(box(3, 9.93, 4, 10.07, 0.9), () => {}); // h 벽 조각, y=10 윗변
  const behind = makeEntity(box(3.25, 9.25, 3.75, 9.75, 1.7), () => {});
  const front = makeEntity(box(3.25, 10.25, 3.75, 10.75, 1.7), () => {});
  assert.equal(compare(behind, wall), -1);
  assert.equal(compare(front, wall), 1);
});

test('화면에서 겹치지 않으면 관계 없음(0)', async () => {
  const { makeEntity, compare } = await renderP;
  const a = makeEntity(box(1, 1, 2, 2), () => {});
  const b = makeEntity(box(20, 20, 21, 21), () => {});
  assert.equal(compare(a, b), 0);
});

test('sortEntities: 소파 앞 캐릭터는 소파 다음, 책장 앞 캐릭터는 책장 다음, 책장 뒤(벽쪽)는 없음', async () => {
  const { makeEntity, sortEntities } = await renderP;
  const actor = makeEntity(box(12.25, 12.25, 12.75, 12.75, 1.7), () => {}, { label: 'actor' });
  const order = sortEntities([actor]);
  const idx = (pred) => order.findIndex(pred);
  const sofa = idx((e) => e.label === 'sofa');
  const me = idx((e) => e.label === 'actor');
  assert.ok(sofa >= 0 && me > sofa, `소파(${sofa}) 다음에 캐릭터(${me})`);
  // 회의실 남쪽 의자(3,14) 는 테이블 다음
  const table = idx((e) => e.label === 'table' && e.box.x0 > 3 && e.box.y0 > 12);
  const southChair = idx((e) => e.label === 'chair' && Math.floor(e.box.x0) === 3 && Math.floor(e.box.y0) === 14);
  const northChair = idx((e) => e.label === 'chair' && Math.floor(e.box.x0) === 3 && Math.floor(e.box.y0) === 11);
  assert.ok(northChair < table && table < southChair, `북의자 ${northChair} < 테이블 ${table} < 남의자 ${southChair}`);
  // 자료실 책장(x=4,y=1) 앞 타일(4,2)의 캐릭터는 책장 다음
  const reader = makeEntity(box(4.25, 2.25, 4.75, 2.75, 1.7), () => {}, { label: 'reader' });
  const order2 = sortEntities([reader]);
  const shelf = order2.findIndex((e) => e.label === 'shelf' && Math.floor(e.box.x0) === 4 && Math.floor(e.box.y0) === 1);
  const r = order2.findIndex((e) => e.label === 'reader');
  assert.ok(shelf < r, `책장 ${shelf} < 독서중 ${r}`);
  // 전체 개수 보존
  assert.equal(order.length, order2.length);
});
