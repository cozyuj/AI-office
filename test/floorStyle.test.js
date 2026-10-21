'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const styleP = import('../public/js/scene/floorStyle.js');
const mapP = import('../public/js/scene/map.js');

const HEX = /^#[0-9a-f]{6}$/;
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const floorsOf = (n, prefix = '/Users/me/proj') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, name: `proj-${i}`, no: i + 1 }));

test('모든 프리셋이 ROOMS 전부 + 복도 + 강조색을 제공한다 (라이트·다크)', async () => {
  const { PRESETS, palette, ROOM_IDS } = await styleP;
  const { ROOMS } = await mapP;
  assert.ok(PRESETS.length >= 4 && PRESETS.length <= 6, '프리셋 4~6개');
  assert.deepEqual([...ROOM_IDS].sort(), ROOMS.map((r) => r.id).sort(), 'floorStyle.ROOM_IDS 와 map.ROOMS 가 같은 방 목록');
  for (const p of PRESETS) {
    for (const theme of ['light', 'dark']) {
      const pal = palette(p.id, theme);
      for (const r of ROOMS) {
        const c = pal.rooms[r.id];
        assert.ok(c && HEX.test(c.floor), `${p.id}/${theme}: ${r.id} 바닥색`);
        assert.ok(HEX.test(c.alt), `${p.id}/${theme}: ${r.id} alt`);
        if (r.id === 'library') assert.equal(c.trim, null, '자료실(우드)은 격자선 없음');
        else assert.ok(HEX.test(c.trim), `${p.id}/${theme}: ${r.id} trim`);
      }
      assert.ok(HEX.test(pal.corridor.floor) && HEX.test(pal.corridor.trim), `${p.id}/${theme}: 복도`);
      assert.equal(pal.accent.leaf.length, 4);
      for (const k of ['sofa', 'parasol', 'wood', 'text']) assert.ok(HEX.test(pal.accent[k]), `${p.id}: accent.${k}`);
      assert.ok(pal.label.text && pal.label.bg && pal.label.border);
    }
  }
});

test('다크 팔레트는 라이트보다 어둡고 프리셋마다 색이 다르다', async () => {
  const { PRESETS, palette, hexToHsl, toDark } = await styleP;
  for (const p of PRESETS) {
    const L = palette(p.id, 'light'), D = palette(p.id, 'dark');
    for (const id of Object.keys(L.rooms)) {
      assert.ok(hexToHsl(D.rooms[id].floor).l < hexToHsl(L.rooms[id].floor).l - 0.3, `${p.id}: ${id} 다크가 충분히 어둡다`);
      assert.ok(hexToHsl(D.rooms[id].floor).l > 0.1 && hexToHsl(D.rooms[id].floor).l < 0.4, `${p.id}: ${id} 다크 밝기 범위`);
    }
  }
  assert.equal(toDark('#ffffff'), toDark('#ffffff'), '결정적');
  const devs = new Set(PRESETS.map((p) => palette(p.id, 'light').rooms.dev.floor));
  assert.equal(devs.size, PRESETS.length, '개발실 바닥색이 프리셋마다 다르다');
  const sofas = new Set(PRESETS.map((p) => palette(p.id).accent.sofa));
  assert.equal(sofas.size, PRESETS.length, '소파 강조색이 프리셋마다 다르다');
});

test('층 → 프리셋 배정: 결정적이고, 이웃 층끼리 안 겹치고, 데모 층은 파스텔 고정', async () => {
  const { assignPresets, autoPresetFor, AUTO_PRESETS, DEMO_PRESET, PRESET_IDS } = await styleP;
  const floors = floorsOf(30);
  const a = assignPresets(floors), b = assignPresets([...floors].reverse());
  assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort(), '입력 순서와 무관하게 같은 결과');
  for (const f of floors) assert.ok(AUTO_PRESETS.includes(a.get(f.id)), `${f.id} 는 자동 후보 중 하나`);
  for (let i = 1; i < floors.length; i++) assert.notEqual(a.get(floors[i].id), a.get(floors[i - 1].id), `${i}F 와 ${i + 1}F 가 다른 프리셋`);
  assert.ok(new Set(a.values()).size >= 3, '프리셋이 여러 개 쓰인다');
  // 같은 층은 다른 층 목록에서도 같은 프리셋 (이웃 충돌 보정만 예외)
  assert.equal(autoPresetFor(floors[3], floors), a.get(floors[3].id));
  assert.equal(autoPresetFor(floors[3], [floors[3]]), autoPresetFor(floors[3], [floors[3]]));
  // 데모
  const demo = [{ id: '/demo/a', name: 'a (데모)', no: 1 }, { id: '/demo/b', name: 'b (데모)', no: 2 }, floors[0]];
  const d = assignPresets(demo);
  assert.equal(d.get('/demo/a'), DEMO_PRESET); assert.equal(d.get('/demo/b'), DEMO_PRESET);
  assert.ok(PRESET_IDS.includes(DEMO_PRESET) && !AUTO_PRESETS.includes(DEMO_PRESET), '파스텔은 자동 배정 후보가 아니다');
});

test('직접 선택 저장: localStorage aiOffice.floorStyle.<floorId>, 빈 값이면 자동으로 복귀, 모르는 값은 무시', async () => {
  const { createFloorStyleBook, STORAGE_PREFIX, DEFAULT_PRESET } = await styleP;
  const st = memStorage();
  const book = createFloorStyleBook(st);
  const floors = floorsOf(3);
  const auto = book.auto(floors[1], floors);
  assert.equal(book.get(floors[1].id), null);
  assert.equal(book.resolve(floors[1], floors), auto);
  book.set(floors[1].id, 'lavender');
  assert.equal(st.getItem(`${STORAGE_PREFIX}${floors[1].id}`), 'lavender');
  assert.equal(book.resolve(floors[1], floors), 'lavender');
  assert.equal(createFloorStyleBook(st).resolve(floors[1], floors), 'lavender', '다시 열어도 유지');
  book.set(floors[1].id, null);
  assert.equal(st.getItem(`${STORAGE_PREFIX}${floors[1].id}`), null);
  assert.equal(book.resolve(floors[1], floors), auto);
  st.setItem(`${STORAGE_PREFIX}${floors[2].id}`, 'nope');
  assert.equal(book.get(floors[2].id), null, '모르는 프리셋 id 는 무시');
  assert.equal(book.resolve(null, floors), DEFAULT_PRESET);
});

test('map.setFloorStyle 이 ROOMS/CORRIDOR/ACCENT 를 바꾸고, 테마를 바꿔도 프리셋이 유지된다. 레이아웃은 그대로', async () => {
  const M = await mapP;
  const { palette } = await styleP;
  const layout = M.ROOMS.map((r) => [r.id, r.x0, r.y0, r.x1, r.y1, r.pattern]);
  M.setTheme('light'); M.setFloorStyle('warm');
  const warmDev = M.ROOMS.find((r) => r.id === 'dev').floor;
  assert.equal(M.setFloorStyle('warm'), false, '같은 프리셋이면 false');
  assert.equal(M.setFloorStyle('mint'), true);
  assert.equal(M.STYLE, 'mint');
  assert.equal(M.ROOMS.find((r) => r.id === 'dev').floor, palette('mint', 'light').rooms.dev.floor);
  assert.notEqual(M.ROOMS.find((r) => r.id === 'dev').floor, warmDev);
  assert.equal(M.CORRIDOR.floor, palette('mint', 'light').corridor.floor);
  assert.equal(M.ACCENT.sofa, palette('mint').accent.sofa);
  assert.equal(M.ROOMS.find((r) => r.id === 'lounge').alt, palette('mint', 'light').rooms.lounge.alt, '체커 alt');
  M.setTheme('dark');
  assert.equal(M.STYLE, 'mint', '테마 전환 후에도 프리셋 유지');
  assert.equal(M.ROOMS.find((r) => r.id === 'dev').floor, palette('mint', 'dark').rooms.dev.floor);
  assert.equal(M.LABEL.text, '#c9cfd8');
  assert.equal(M.setFloorStyle('unknown'), true, '모르는 id 는 기본 프리셋으로');
  assert.equal(M.STYLE, 'warm');
  M.setTheme('light');
  assert.deepEqual(M.ROOMS.map((r) => [r.id, r.x0, r.y0, r.x1, r.y1, r.pattern]), layout, '방 위치·패턴은 안 바뀐다');
});
