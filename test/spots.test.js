'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const mapP = import('../public/js/scene/map.js');
const pfP = import('../public/js/scene/pathfind.js');
const spotsP = import('../public/js/scene/spots.js');
const layoutsP = import('../public/js/scene/layouts.js');

const REST_ROOMS = ['lounge', 'cafe', 'terrace']; // 서버(lib/state.js REST_ROOMS)와 같아야 한다

test('모든 레이아웃: 서버 휴식 방(휴게실·카페·테라스)마다 명소가 8개 이상 있고, 별칭 방의 명소를 가리킨다', async () => {
  const { REST_SPOTS } = await spotsP;
  const M = await mapP;
  const { LAYOUT_IDS, buildLayout, resolveRoom } = await layoutsP;
  for (const id of LAYOUT_IDS) {
    M.setLayout(id);
    const L = buildLayout(id);
    for (const room of REST_ROOMS) {
      assert.ok(REST_SPOTS[room] && REST_SPOTS[room].length >= 8, `${id}: ${room} 명소가 너무 적다: ${(REST_SPOTS[room] || []).length}`);
      assert.equal(REST_SPOTS[room], REST_SPOTS[resolveRoom(L, room)], `${id}: ${room} 은 ${resolveRoom(L, room)} 의 명소`);
    }
  }
  M.setLayout('classic');
});

test('모든 레이아웃: 명소는 그 방 안의 통행 가능 타일이고 서로 겹치지 않으며, 머무는 시간은 10~30초', async () => {
  const M = await mapP;
  const { REST_SPOTS } = await spotsP;
  const { LAYOUT_IDS, buildLayout, resolveRoom } = await layoutsP;
  for (const id of LAYOUT_IDS) {
    M.setLayout(id);
    const L = buildLayout(id);
    for (const room of REST_ROOMS) {
      const real = resolveRoom(L, room);
      const seen = new Set();
      for (const s of REST_SPOTS[room]) {
        const [x, y] = s.tile;
        assert.ok(M.isWalkable(x, y), `${id}/${real}: 명소 ${x},${y} 통행 불가`);
        assert.equal(M.roomAt(x, y)?.id, real, `${id}/${real}: 명소 ${x},${y} 가 다른 방에 있음`);
        assert.ok(!seen.has(`${x},${y}`), `${id}/${real}: 명소 ${x},${y} 중복`);
        seen.add(`${x},${y}`);
        assert.ok(s.icon && s.bubble, `${id}/${real}: 명소 ${x},${y} 말풍선 없음`);
        assert.ok(s.stay[0] >= 10000 && s.stay[1] <= 30000 && s.stay[0] <= s.stay[1], `${id}/${real}: 명소 ${x},${y} 머무는 시간은 10~30초`);
      }
    }
  }
  M.setLayout('classic');
});

test('모든 레이아웃: 방의 서 있는 자리에서 모든 명소까지 방 안에서만 길이 있다', async () => {
  const M = await mapP;
  const { findPath } = await pfP;
  const { REST_SPOTS } = await spotsP;
  const { LAYOUT_IDS, buildLayout, resolveRoom } = await layoutsP;
  for (const id of LAYOUT_IDS) {
    M.setLayout(id);
    const L = buildLayout(id);
    for (const room of REST_ROOMS) {
      const real = resolveRoom(L, room);
      const [sx, sy] = M.SLOTS[room][0];
      for (const s of REST_SPOTS[room]) {
        const [x, y] = s.tile;
        const p = findPath(sx, sy, x, y);
        assert.ok(p, `${id}/${real}: ${sx},${sy} → ${x},${y} 경로 없음`);
        let prev = [sx, sy];
        for (const t of p) {
          assert.ok(!M.edgeBlocked(prev[0], prev[1], t[0], t[1]), `${id}/${real}: 벽 통과 ${prev}→${t}`);
          assert.equal(M.roomAt(t[0], t[1])?.id, real, `${id}/${real}: 방 안 배회가 방을 벗어남 (${t})`);
          prev = t;
        }
      }
    }
  }
  M.setLayout('classic');
});
