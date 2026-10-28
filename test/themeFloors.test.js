'use strict';
// 테마 층 (FE-60): 할로윈 · 크리스마스 · 여름휴가 — 스타일 키, 날짜 자동, 소품 배치, 서버 직접 선택
const test = require('node:test');
const assert = require('node:assert/strict');
const FS = require('../lib/floorStyle');

const styleP = import('../public/js/scene/floorStyle.js');
const mapP = import('../public/js/scene/map.js');
const pathP = import('../public/js/scene/pathfind.js');
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('스타일 키: 테마/구조 나누기, 날짜 → 철 테마, 팔레트는 테마 색·바닥 무늬·벽', async () => {
  const C = await styleP;
  assert.deepEqual(C.splitStyle('halloween/cool'), { look: 'halloween', base: 'cool', theme: 'halloween' });
  assert.deepEqual(C.splitStyle('warm'), { look: 'warm', base: 'warm', theme: null });
  assert.equal(C.splitStyle('christmas').base, C.DEFAULT_PRESET, '구조가 없으면 기본 구조');
  for (const bad of ['', 'nope', 'warm/cool', 'halloween/nope', 'halloween/warm/x', null]) assert.equal(C.splitStyle(bad), null, String(bad));
  const d = (m, day) => C.seasonTheme(new Date(2026, m - 1, day));
  assert.equal(d(10, 14), null); assert.equal(d(10, 15), 'halloween'); assert.equal(d(11, 1), 'halloween'); assert.equal(d(11, 2), null);
  assert.equal(d(12, 1), 'christmas'); assert.equal(d(12, 26), 'christmas'); assert.equal(d(12, 27), null);
  assert.equal(d(7, 15), 'summer'); assert.equal(d(8, 31), 'summer'); assert.equal(d(9, 1), null); assert.equal(d(3, 3), null);
  for (const t of C.THEMES) for (const theme of ['light', 'dark']) {
    const p = C.palette(`${t.id}/mint`, theme);
    assert.equal(p.id, t.id);
    assert.ok(p.floorPattern && p.wall && p.wall.face, `${t.id} ${theme}`);
  }
  assert.equal(C.palette('mint').floorPattern, null, '프리셋은 바닥 무늬를 바꾸지 않는다');
  assert.ok(!C.AUTO_PRESETS.some(C.isTheme) && !C.PRESET_IDS.some(C.isTheme), '테마는 자동 배정에 섞이지 않는다');
});

test('resolve: 테마를 고른 층은 테마/자동 구조, 날짜 자동은 직접 고르지 않은 층에만', async () => {
  const C = await styleP;
  const book = C.createFloorStyleBook(memStorage());
  const f = { id: '/x/a', no: 1, style: 'cool', styleAuto: 'cool', styleOverride: null };
  assert.equal(book.resolve(f, [f]), 'cool');
  assert.equal(book.resolve(f, [f], 'halloween'), 'halloween/cool', '날짜 자동');
  const picked = { ...f, style: 'christmas', styleOverride: 'christmas' };
  assert.equal(book.resolve(picked, [picked]), 'christmas/cool', '구조는 자동 프리셋');
  assert.equal(book.resolve(picked, [picked], 'halloween'), 'christmas/cool', '직접 고른 테마가 우선');
  const mint = { ...f, style: 'mint', styleOverride: 'mint' };
  assert.equal(book.resolve(mint, [mint], 'summer'), 'mint', '직접 고른 프리셋은 날짜 자동이 덮지 않는다');
});

test('소품 배치: 모든 구조 × 테마에서 방 안 · 자리·명소·문 앞을 비우고, 막는 소품이 있어도 모든 자리에 길이 남는다', async () => {
  const C = await styleP;
  const M = await mapP;
  const { findPath } = await pathP;
  for (const preset of C.PRESET_IDS) for (const t of C.THEME_IDS) {
    M.setFloorStyle(`${t}/${preset}`);
    assert.equal(M.SKIN, t);
    assert.ok(M.DECOR.length >= 10, `${t}/${preset}: 소품 ${M.DECOR.length}`);
    const slotTiles = new Set(Object.values(M.SLOTS).flat().map(([x, y]) => `${x},${y}`));
    for (const it of M.DECOR) {
      assert.ok(M.inGrid(it.x, it.y), `${t}/${preset} ${it.type} 격자 안`);
      if (it.kind !== 'floor') continue;
      for (let x = it.x; x < it.x + (it.w || 1); x++) for (let y = it.y; y < it.y + (it.d || 1); y++) {
        assert.ok(!slotTiles.has(`${x},${y}`), `${t}/${preset} ${it.type} 가 자리 (${x},${y}) 를 막지 않는다`);
        assert.ok(M.roomAt(x, y), `${t}/${preset} ${it.type} 방 안`);
      }
    }
    for (const [x, y] of Object.values(M.SLOTS).flat()) {
      const p = findPath(M.SPAWN.x, M.SPAWN.y, x, y);
      assert.ok(p !== null, `${t}/${preset}: 엘리베이터 → (${x},${y}) 길`);
    }
    assert.ok(M.DECOR.some((it) => it.solid), `${t}/${preset}: 막는 큰 소품이 하나는 있다`);
  }
  M.setFloorStyle('warm');
  assert.equal(M.SKIN, null); assert.equal(M.DECOR.length, 0, '테마가 아니면 소품 없음');
});

test('서버: 테마를 직접 고를 수 있고, 휴식 방 이름은 그 층의 원래 구조(자동 프리셋)를 따른다', () => {
  assert.deepEqual(FS.THEME_IDS, ['halloween', 'christmas', 'summer']);
  assert.ok(FS.isChoice('christmas') && FS.isChoice('mint') && !FS.isChoice('nope'));
  assert.equal(FS.baseOf({ style: 'halloween', styleAuto: 'mint' }), 'mint');
  assert.equal(FS.baseOf({ style: 'sand', styleAuto: 'mint' }), 'sand');
  const { createState } = require('../lib/state');
  const st = createState({ me: 'me' });
  const cwd = '/Users/me/proj/theme';
  st.apply({ session_id: 's1', cwd, transcript_path: '/x', hook_event_name: 'SessionStart', source: 'startup' }, 1000);
  const auto = st.snapshot().floors[0].styleAuto;
  const f = st.setFloorStyle(cwd, 'christmas');
  assert.equal(f.style, 'christmas'); assert.equal(f.styleOverride, 'christmas'); assert.equal(f.styleAuto, auto);
  st.apply({ session_id: 's1', cwd, transcript_path: '/x', hook_event_name: 'Stop', last_assistant_message: 'ok' }, 2000);
  const a = st.snapshot().sessions[0].agents.main;
  assert.equal(a.bubble, FS.restInfo(auto, a.room).bubble, '휴식 말풍선은 자동 프리셋 구조 기준');
});

test('서버·클라이언트 테마 id 가 같다', async () => {
  const C = await styleP;
  assert.deepEqual(FS.THEME_IDS, C.THEME_IDS);
});
