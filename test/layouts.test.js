'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const layoutsP = import('../public/js/scene/layouts.js');
const mapP = import('../public/js/scene/map.js');
const pfP = import('../public/js/scene/pathfind.js');
const styleP = import('../public/js/scene/floorStyle.js');

const inRoom = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

test('레이아웃 5개: 업무 방 9개가 전부 있고, 방은 격자 안에서 서로 겹치지 않으며, 휴식 방 별칭(cafe/terrace)이 실제 방을 가리킨다', async () => {
  const { LAYOUT_IDS, buildLayout, CORE_ROOMS, GRID } = await layoutsP;
  assert.ok(LAYOUT_IDS.length >= 5);
  for (const id of LAYOUT_IDS) {
    const L = buildLayout(id);
    const ids = L.rooms.map((r) => r.id);
    for (const c of CORE_ROOMS) assert.ok(ids.includes(c), `${id}: ${c} 없음`);
    assert.equal(new Set(ids).size, ids.length, `${id}: 방 id 중복`);
    for (const r of L.rooms) {
      assert.ok(r.x0 >= GRID.x0 && r.x1 <= GRID.x1 && r.y0 >= GRID.y0 && r.y1 <= GRID.y1, `${id}: ${r.id} 격자 밖`);
      for (const o of L.rooms) if (o !== r) assert.ok(r.x1 < o.x0 || o.x1 < r.x0 || r.y1 < o.y0 || o.y1 < r.y0, `${id}: ${r.id} 와 ${o.id} 겹침`);
    }
    for (const alias of ['cafe', 'terrace']) assert.ok(ids.includes(L.rest[alias]), `${id}: ${alias} → ${L.rest[alias]} 방이 없다`);
    assert.ok(L.userSeat && L.spawn, `${id}: 사용자 자리/등장 지점`);
  }
  // 레이아웃마다 업무 방 배치가 다르다
  const sig = LAYOUT_IDS.map((id) => buildLayout(id).rooms.filter((r) => CORE_ROOMS.includes(r.id)).map((r) => `${r.id}@${r.x0},${r.y0}`).sort().join('|'));
  assert.equal(new Set(sig).size, LAYOUT_IDS.length, '업무 방 배치가 같은 레이아웃이 있다');
});

test('모든 레이아웃: 가구는 자기 방 안, 슬롯·명소·자율 행동 자리는 통행 가능, 슬롯은 그 방 안, 방마다 문이 있다', async () => {
  const { LAYOUT_IDS, buildLayout, resolveRoom } = await layoutsP;
  const M = await mapP;
  for (const id of LAYOUT_IDS) {
    M.setLayout(id);
    const L = buildLayout(id);
    for (const f of M.FURNITURE) {
      const r = M.roomAt(f.x, f.y);
      assert.ok(r, `${id}: 가구 ${f.type}(${f.x},${f.y}) 가 방 밖`);
      assert.ok(inRoom(r, f.x + (f.w || 1) - 1, f.y + (f.d || 1) - 1), `${id}: 가구 ${f.type}(${f.x},${f.y}) 가 방 ${r.id} 를 벗어남`);
    }
    for (const r of M.ROOMS) {
      const list = M.SLOTS[r.id];
      assert.ok(list && list.length >= 4, `${id}: ${r.id} 슬롯이 너무 적다`);
      for (const [x, y] of list) {
        assert.ok(M.isWalkable(x, y), `${id}: ${r.id} 슬롯 ${x},${y} 통행 불가`);
        assert.equal(M.roomAt(x, y)?.id, r.id, `${id}: ${r.id} 슬롯 ${x},${y} 가 다른 방`);
      }
      assert.ok(M.DOORS.some((d) => (d.y === r.y0 || d.y === r.y1 + 1) && d.x >= r.x0 && d.x <= r.x1), `${id}: ${r.id} 에 문이 없다`);
    }
    for (const alias of ['cafe', 'terrace']) assert.equal(M.SLOTS[alias], M.SLOTS[resolveRoom(L, alias)], `${id}: ${alias} 슬롯 별칭`);
    for (const s of M.AMBIENT_SPOTS) assert.ok(M.isWalkable(s.tile[0], s.tile[1]), `${id}: 자율 행동 자리 ${s.tile} 통행 불가`);
    assert.ok(M.AMBIENT_SPOTS.length >= 8, `${id}: 자율 행동 자리가 너무 적다 (${M.AMBIENT_SPOTS.length})`);
    assert.ok(M.isWalkable(M.SPAWN.x, M.SPAWN.y) && M.roomAt(M.SPAWN.x, M.SPAWN.y)?.id === 'elevator', `${id}: 등장 지점`);
    assert.ok(M.isWalkable(M.USER_SEAT.x, M.USER_SEAT.y) && M.roomAt(M.USER_SEAT.x, M.USER_SEAT.y)?.id === 'mydesk', `${id}: 사용자 자리`);
  }
  M.setLayout('classic');
});

test('모든 레이아웃: 엘리베이터 앞에서 모든 슬롯까지 길이 있고, 야외 방은 난간·조명이 있다', async () => {
  const { LAYOUT_IDS } = await layoutsP;
  const M = await mapP;
  const { findPath } = await pfP;
  for (const id of LAYOUT_IDS) {
    M.setLayout(id);
    for (const [room, list] of Object.entries(M.SLOTS)) {
      for (const [x, y] of list) {
        const p = findPath(M.SPAWN.x, M.SPAWN.y, x, y);
        assert.ok(p, `${id}: ${room} ${x},${y} 까지 경로 없음`);
      }
    }
    const outdoor = M.ROOMS.filter((r) => r.outdoor);
    if (outdoor.length) { assert.ok(M.WALLS.some((w) => w.rail), `${id}: 난간 없음`); assert.ok(M.LAMPS.length >= 3, `${id}: 조명 점`); }
    else assert.equal(M.LAMPS.length, 0, `${id}: 야외 방이 없는데 조명 점이 있다`);
  }
  M.setLayout('classic');
});

test('map.setLayout / setFloorStyle: 프리셋이 레이아웃을 정하고, 바뀐 정도(0·1·2)를 돌려주며, 같은 참조가 유지된다', async () => {
  const M = await mapP;
  const { PRESETS } = await styleP;
  const rooms = M.ROOMS, slots = M.SLOTS, furn = M.FURNITURE;
  M.setTheme('light'); M.setFloorStyle('warm');
  assert.equal(M.LAYOUT, 'classic');
  assert.equal(M.setFloorStyle('warm'), 0);
  assert.equal(M.setFloorStyle('pastel'), 1, '파스텔은 classic 레이아웃이라 색만');
  assert.equal(M.setFloorStyle('mint'), 2, '민트는 fitness 레이아웃');
  assert.equal(M.LAYOUT, 'fitness');
  assert.ok(rooms === M.ROOMS && slots === M.SLOTS && furn === M.FURNITURE, 'live 컨테이너 참조 유지');
  assert.ok(M.ROOMS.some((r) => r.id === 'gym') && M.ROOMS.some((r) => r.id === 'garden'));
  assert.equal(M.resolveRoom('cafe'), 'gym'); assert.equal(M.roomLabel('terrace'), '옥상정원'); assert.equal(M.roomLabel('dev'), '개발실');
  for (const p of PRESETS) assert.ok(M.layoutOfPreset(p.id), `${p.id} 레이아웃`);
  assert.equal(new Set(PRESETS.map((p) => M.layoutOfPreset(p.id))).size, 5, '프리셋 6개가 레이아웃 5개를 쓴다');
  M.setFloorStyle('warm');
  assert.equal(M.LAYOUT, 'classic');
});
