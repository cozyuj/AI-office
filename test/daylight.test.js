'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// daylight.js 는 순수 계산 모듈 (canvas 없이 import 가능)
const daylightP = import('../public/js/scene/daylight.js');
const renderP = import('../public/js/scene/render.js');

const at = (h, m = 0) => new Date(2026, 9, 21, h, m);

test('시간대 경계: 아침 06~10 · 낮 10~17 · 저녁 17~20 · 밤 20~06', async () => {
  const { periodOf } = await daylightP;
  assert.equal(periodOf(5), 'night');
  assert.equal(periodOf(6), 'morning');
  assert.equal(periodOf(9), 'morning');
  assert.equal(periodOf(10), 'day');
  assert.equal(periodOf(16), 'day');
  assert.equal(periodOf(17), 'evening');
  assert.equal(periodOf(19), 'evening');
  assert.equal(periodOf(20), 'night');
  assert.equal(periodOf(23), 'night');
  assert.equal(periodOf(0), 'night');
});

test('resolve: auto 는 실제 시각, off 는 낮(중립), 강제 모드는 그대로', async () => {
  const { resolve, PERIODS, MODES } = await daylightP;
  assert.equal(resolve('auto', at(7)), 'morning');
  assert.equal(resolve('auto', at(13)), 'day');
  assert.equal(resolve('auto', at(18, 30)), 'evening');
  assert.equal(resolve('auto', at(22)), 'night');
  assert.equal(resolve('off', at(22)), 'day');
  for (const p of PERIODS) assert.equal(resolve(p, at(13)), p);
  assert.equal(resolve('garbage', at(22)), 'night'); // 모르는 값은 자동
  assert.deepEqual(MODES, ['auto', 'off', 'morning', 'day', 'evening', 'night']);
});

test('팔레트: 네 시간대 모두 유리 색이 있고, 낮은 중립(틴트·조명 없음), 밤은 별·조명·틴트', async () => {
  const { PALETTE, PERIODS, LAMPS } = await daylightP;
  for (const p of PERIODS) {
    assert.ok(Array.isArray(PALETTE[p].sky) && PALETTE[p].sky.length >= 2, `${p} sky`);
    assert.ok(PALETTE[p].glare > 0 && PALETTE[p].glare <= 1, `${p} glare`);
  }
  assert.equal(PALETTE.day.terrace, null);
  assert.equal(PALETTE.day.scene, null);
  assert.equal(PALETTE.day.lamp, 0);
  assert.equal(PALETTE.night.stars, true);
  assert.equal(PALETTE.night.lamp, 1);
  assert.match(PALETTE.night.scene, /^rgba\(.*0\.06\)$/);
  assert.match(PALETTE.evening.scene, /^rgba\(.*0\.04\)$/);
  assert.ok(LAMPS.length >= 5);
  for (const l of LAMPS) assert.ok(l.x >= 28 && l.y >= 10 && l.z > 0, '조명 점은 테라스 영역');
});

test('setPeriod: 바뀔 때만 true, 모르는 값은 낮', async () => {
  const { setPeriod, getPeriod } = await daylightP;
  assert.equal(getPeriod(), 'day');
  assert.equal(setPeriod('day'), false);
  assert.equal(setPeriod('night'), true);
  assert.equal(getPeriod(), 'night');
  assert.equal(setPeriod('night'), false);
  assert.equal(setPeriod('nope'), true);
  assert.equal(getPeriod(), 'day');
});

test('render.setDaylight: 시간대가 바뀔 때만 창문 벽 조각의 스프라이트 캐시를 비운다', async () => {
  const { setDaylight, STATIC } = await renderP;
  const wins = STATIC.filter((e) => e.win);
  const others = STATIC.filter((e) => !e.win);
  assert.equal(wins.length, 6, '카페 북쪽 유리창 6칸');
  for (const e of STATIC) e._sprite = { fake: true };
  assert.equal(setDaylight('day'), 'day');
  assert.ok(wins.every((e) => e._sprite), '같은 시간대면 그대로');
  assert.equal(setDaylight('auto', at(21)), 'night');
  assert.ok(wins.every((e) => e._sprite === null), '창문만 무효화');
  assert.ok(others.every((e) => e._sprite), '다른 스프라이트는 유지');
  setDaylight('day');
});
