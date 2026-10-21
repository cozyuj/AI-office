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

test('방 사이 이동은 반드시 문 타일을 지난다 (자료실→개발실, 자료실→회의실, 서버실→내 자리)', async () => {
  const { DOORS, isDoorEdge, roomAt, edgeBlocked } = await mapP;
  const { findPath } = await pfP;
  const roomChanges = (from, p) => {
    let prev = from, changes = [];
    for (const t of p) {
      const a = roomAt(prev[0], prev[1])?.id || 'corridor', b = roomAt(t[0], t[1])?.id || 'corridor';
      if (a !== b) changes.push({ from: prev, to: t, a, b, door: isDoorEdge(prev[0], prev[1], t[0], t[1]) });
      assert.ok(!edgeBlocked(prev[0], prev[1], t[0], t[1]), `벽 통과 ${prev}→${t}`);
      prev = t;
    }
    return changes;
  };
  const cases = [[[2, 2], [13, 3]], [[2, 2], [2, 12]], [[20, 12], [6, 19]], [[21, 2], [24, 19]]];
  for (const [from, to] of cases) {
    const p = findPath(from[0], from[1], to[0], to[1]);
    assert.ok(p, `${from}→${to} 경로 없음`);
    const ch = roomChanges(from, p);
    for (const c of ch) {
      // 방 ↔ 복도 경계를 넘는 걸음은 모두 문이어야 한다
      assert.ok(c.door, `${from}→${to}: ${c.a}→${c.b} 를 문 없이 넘음 (${c.from}→${c.to})`);
    }
    assert.ok(ch.length >= 2, `${from}→${to}: 방을 나갔다 들어와야 한다`);
  }
  assert.equal(DOORS.length, 24, '문 2타일 × 12개 벽');
});

test('방의 네 변은 문을 제외하고 모두 막혀 있다', async () => {
  const { ROOMS, GRID, edgeBlocked, isDoorEdge } = await mapP;
  for (const r of ROOMS) {
    for (let x = r.x0; x <= r.x1; x++) {
      for (const [y, ny] of [[r.y0, r.y0 - 1], [r.y1, r.y1 + 1]]) {
        if (ny < GRID.y0 || ny > GRID.y1) continue;
        assert.ok(edgeBlocked(x, y, x, ny) || isDoorEdge(x, y, x, ny), `${r.id} (${x},${y})→(${x},${ny}) 열림`);
      }
    }
    for (let y = r.y0; y <= r.y1; y++) {
      for (const [x, nx] of [[r.x0, r.x0 - 1], [r.x1, r.x1 + 1]]) {
        if (nx < GRID.x0 || nx > GRID.x1) continue;
        assert.ok(edgeBlocked(x, y, nx, y), `${r.id} (${x},${y})→(${nx},${y}) 열림`);
      }
    }
  }
});
