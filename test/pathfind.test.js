'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const mapP = import('../public/js/scene/map.js');
const pfP = import('../public/js/scene/pathfind.js');

test('모든 방의 서 있는 자리는 통행 가능 타일이고 가구와 겹치지 않는다', async () => {
  const { SLOTS, isWalkable, roomAt } = await mapP;
  for (const [room, list] of Object.entries(SLOTS)) {
    for (const [x, y] of list) {
      assert.ok(isWalkable(x, y), `${room} slot ${x},${y} 통행 불가`);
      assert.equal(roomAt(x, y)?.id, room, `${room} slot ${x},${y} 가 다른 방에 있음`);
    }
  }
});

test('엘리베이터 앞에서 모든 자리까지 길이 있다 (벽 문 구멍 검증)', async () => {
  const { SLOTS, SPAWN } = await mapP;
  const { findPath } = await pfP;
  for (const [room, list] of Object.entries(SLOTS)) {
    for (const [x, y] of list) {
      const p = findPath(SPAWN.x, SPAWN.y, x, y);
      assert.ok(p, `${room} ${x},${y} 까지 경로 없음`);
      if (x === SPAWN.x && y === SPAWN.y) assert.equal(p.length, 0);
      else assert.deepEqual(p[p.length - 1], [x, y]);
    }
  }
});

test('사용자 자리에서 내 자리 slot 까지 짧은 경로', async () => {
  const { USER_SEAT, SLOTS } = await mapP;
  const { findPath } = await pfP;
  const [x, y] = SLOTS.mydesk[0];
  const p = findPath(USER_SEAT.x, USER_SEAT.y, x, y);
  assert.ok(p.length <= 6, `너무 멀다: ${p.length}`);
});

test('벽을 통과하지 않는다: 자료실 → 회의실은 복도 문을 거친다', async () => {
  const { edgeBlocked } = await mapP;
  const { findPath } = await pfP;
  const p = findPath(2, 2, 2, 12);
  assert.ok(p, '경로 없음');
  let prev = [2, 2];
  for (const [x, y] of p) {
    assert.ok(!edgeBlocked(prev[0], prev[1], x, y), `벽 통과: ${prev} → ${x},${y}`);
    assert.equal(Math.abs(x - prev[0]) + Math.abs(y - prev[1]), 1, '대각선/점프 이동');
    prev = [x, y];
  }
});

test('가구 타일이 목적지면 null, 같은 자리면 빈 배열', async () => {
  const { FURNITURE } = await mapP;
  const { findPath, nearestWalkable } = await pfP;
  const rack = FURNITURE.find((f) => f.type === 'rack');
  assert.equal(findPath(20, 12, rack.x, rack.y), null);
  assert.deepEqual(findPath(5, 5, 5, 5), []);
  const nw = nearestWalkable(rack.x, rack.y);
  assert.ok(Math.abs(nw[0] - rack.x) + Math.abs(nw[1] - rack.y) <= 2);
});
