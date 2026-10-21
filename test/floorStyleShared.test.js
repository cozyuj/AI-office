'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const FS = require('../lib/floorStyle');

const styleP = import('../public/js/scene/floorStyle.js');
const layoutsP = import('../public/js/scene/layouts.js');

test('서버 lib/floorStyle 과 클라이언트 floorStyle.js·layouts.js 가 같은 프리셋·레이아웃·휴식 방 별칭·라벨을 쓴다', async () => {
  const C = await styleP;
  const L = await layoutsP;
  assert.deepEqual(FS.PRESET_IDS, C.PRESET_IDS);
  assert.equal(FS.DEMO_PRESET, C.DEMO_PRESET);
  assert.deepEqual(FS.AUTO_PRESETS, C.AUTO_PRESETS);
  for (const p of C.PRESETS) assert.equal(FS.PRESET_LAYOUT[p.id], p.layout, `${p.id} 레이아웃`);
  for (const id of L.LAYOUT_IDS) assert.deepEqual(FS.LAYOUT_REST[id], L.LAYOUTS[id].rest, `${id} 휴식 방 별칭`);
  for (const [id, info] of Object.entries(FS.ROOM_REST)) {
    const def = L.ROOM_DEFS[id];
    assert.ok(def && def.rest, `${id} 는 클라이언트 휴식 방`);
    assert.equal(info.label, def.label, `${id} 라벨`);
    assert.equal(info.icon, def.rest.icon, `${id} 아이콘`);
    assert.equal(info.bubble, def.rest.bubble, `${id} 말풍선`);
  }
  for (const id of L.LAYOUT_IDS) for (const room of ['cafe', 'terrace']) assert.ok(FS.ROOM_REST[L.LAYOUTS[id].rest[room]], `${id}/${room} 라벨 표에 있다`);
});

test('층 → 프리셋 배정이 서버와 클라이언트에서 똑같다 (실제 층 + 데모 층)', async () => {
  const C = await styleP;
  const floors = [];
  for (let i = 0; i < 40; i++) floors.push({ id: i % 3 ? `/Users/me/proj-${i}` : `/demo/p${i}`, no: i + 1 });
  const a = FS.assignPresets(floors), b = C.assignPresets(floors);
  assert.deepEqual([...a.entries()], [...b.entries()]);
  for (const f of floors) assert.equal(FS.hashStr(f.id), C.hashStr(f.id));
});

test('restInfo: 프리셋 층에서 서버 휴식 방 cafe/terrace 는 편의시설 라벨, lounge 는 휴게실, 모르는 프리셋은 기본(카페·테라스)', () => {
  assert.deepEqual(FS.restInfo('mint', 'cafe'), { label: '헬스장', icon: '🏃', bubble: '운동 중' });
  assert.equal(FS.restInfo('mint', 'terrace').label, '옥상정원');
  assert.equal(FS.restInfo('sand', 'cafe').label, '구내식당');
  assert.equal(FS.restInfo('cool', 'terrace').label, '세미나실');
  assert.equal(FS.restInfo('lavender', 'cafe').label, '북 라운지');
  assert.equal(FS.restInfo('warm', 'cafe').label, '카페');
  assert.equal(FS.restInfo(undefined, 'terrace').label, '테라스');
  assert.equal(FS.restInfo('mint', 'lounge').label, '휴게실');
  assert.equal(FS.restRoomIn('mint', 'mydesk'), 'mydesk');
});
