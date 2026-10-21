'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const mapP = import('../public/js/scene/map.js');
const pfP = import('../public/js/scene/pathfind.js');
const spotsP = import('../public/js/scene/spots.js');

const REST_ROOMS = ['lounge', 'cafe', 'terrace'];

test('휴식 방(휴게실·카페·테라스)마다 명소가 있고 서버의 휴식 방 목록과 일치한다', async () => {
  const { REST_SPOTS, REST_SPOTS_ALL } = await spotsP;
  assert.deepEqual(Object.keys(REST_SPOTS_ALL).sort(), [...REST_ROOMS].sort());
  for (const room of REST_ROOMS) {
    assert.ok(REST_SPOTS_ALL[room].length >= 8, `${room} 명소가 너무 적다: ${REST_SPOTS_ALL[room].length}`);
    assert.equal(REST_SPOTS[room].length, REST_SPOTS_ALL[room].length, `${room}: 걸러진 명소가 있다 (가구와 겹치거나 방 밖)`);
  }
});

test('모든 명소는 그 방 안의 통행 가능 타일이고 서로 겹치지 않는다', async () => {
  const { isWalkable, roomAt } = await mapP;
  const { REST_SPOTS_ALL } = await spotsP;
  for (const [room, list] of Object.entries(REST_SPOTS_ALL)) {
    const seen = new Set();
    for (const s of list) {
      const [x, y] = s.tile;
      assert.ok(isWalkable(x, y), `${room} 명소 ${x},${y} 통행 불가`);
      assert.equal(roomAt(x, y)?.id, room, `${room} 명소 ${x},${y} 가 다른 방에 있음`);
      assert.ok(!seen.has(`${x},${y}`), `${room} 명소 ${x},${y} 중복`);
      seen.add(`${x},${y}`);
      assert.ok(s.icon && s.bubble, `${room} 명소 ${x},${y} 말풍선 없음`);
      assert.ok(s.stay[0] >= 10000 && s.stay[1] <= 30000 && s.stay[0] <= s.stay[1], `${room} 명소 ${x},${y} 머무는 시간은 10~30초`);
    }
  }
});

test('방의 서 있는 자리에서 모든 명소까지 문을 통해 길이 있다', async () => {
  const { SLOTS, roomAt, edgeBlocked } = await mapP;
  const { findPath } = await pfP;
  const { REST_SPOTS_ALL } = await spotsP;
  for (const [room, list] of Object.entries(REST_SPOTS_ALL)) {
    const [sx, sy] = SLOTS[room][0];
    for (const s of list) {
      const [x, y] = s.tile;
      const p = findPath(sx, sy, x, y);
      assert.ok(p, `${room} ${sx},${sy} → ${x},${y} 경로 없음`);
      let prev = [sx, sy];
      for (const t of p) {
        assert.ok(!edgeBlocked(prev[0], prev[1], t[0], t[1]), `${room}: 벽 통과 ${prev}→${t}`);
        assert.equal(roomAt(t[0], t[1])?.id, room, `${room}: 방 안 배회가 방을 벗어남 (${t})`);
        prev = t;
      }
    }
  }
});
