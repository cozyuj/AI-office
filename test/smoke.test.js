// 프런트 스모크 테스트 (FE-40): 브라우저 없이, 의존성 없이.
// 가짜 2D 컨텍스트(메서드 호출만 기록, NaN 인자 감지)와 최소 DOM 흉내로 캔버스·패널 코드를 Node 에서 끝까지 실행한다.
// 목적은 "런타임 에러·NaN 없이 그려지는가" 이지 픽셀 검증이 아니다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createState } = require('../lib/state');

// ---------- 가짜 브라우저 ----------
const log = { calls: 0, nan: [] };
function fakeClassList() {
  const set = new Set();
  return { add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)), toggle: (c, v) => { if (v === undefined) v = !set.has(c); v ? set.add(c) : set.delete(c); return v; }, contains: (c) => set.has(c) };
}
function fakeCtx() {
  const target = { canvas: { width: 1600, height: 900 } };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'createPattern') return () => ({});
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h });
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === 'isPointInPath') return () => false;
      return (...args) => {
        log.calls++;
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) { log.nan.push(String(k)); break; }
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function fakeEl(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(), innerHTML: '', textContent: '', value: '', title: '', className: '', id: '', hidden: false, disabled: false,
    style: {}, dataset: {}, children: [], classList: fakeClassList(), scrollTop: 0, scrollHeight: 0, clientHeight: 0, clientWidth: 0, offsetWidth: 120, offsetHeight: 40,
    querySelector: () => fakeEl(), querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, appendChild(c) { el.children.push(c); return c; }, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, focus() {}, blur() {}, click() {}, closest: () => null, contains: () => false, insertAdjacentHTML() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1600, bottom: 900, width: 1600, height: 900, x: 0, y: 0 }),
  };
  if (tag === 'canvas') { el.width = 0; el.height = 0; el.getContext = () => fakeCtx(); el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.toDataURL = () => 'data:,'; }
  return el;
}
const els = new Map();
const storage = new Map();
const fakeLocalStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k), clear: () => storage.clear() };
try { Object.defineProperty(globalThis, 'localStorage', { value: fakeLocalStorage, configurable: true, writable: true }); } catch { globalThis.localStorage = fakeLocalStorage; }
globalThis.document = {
  createElement: (tag) => fakeEl(tag),
  getElementById: (id) => { if (!els.has(id)) { const e = fakeEl(); e.id = id; els.set(id, e); } return els.get(id); },
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  body: fakeEl('body'), documentElement: Object.assign(fakeEl('html'), { dataset: {} }), activeElement: null, hidden: false,
};
globalThis.window = Object.assign(globalThis, { devicePixelRatio: 1, innerWidth: 1600, innerHeight: 900, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) });
globalThis.location = { search: '', href: 'http://localhost/' };
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
const fakeCamera = { cam: { x: 0, y: 0, zoom: 1, w: 1600, h: 900 }, worldToScreen: (x, y) => ({ x, y }), screenToWorld: (x, y) => ({ x, y }) };
function resetLog() { log.calls = 0; log.nan = []; }
function assertClean(what) {
  assert.ok(log.calls > 0, `${what}: 캔버스 호출이 없음`);
  assert.deepEqual([...new Set(log.nan)], [], `${what}: NaN 인자로 호출된 메서드 ${[...new Set(log.nan)].join(', ')}`);
}

// ---------- 상태 머신으로 현실적인 스냅샷 만들기 ----------
function buildSnapshot() {
  const st = createState({ me: 'tester', statFile: () => ({ mtimeMs: Number.MAX_SAFE_INTEGER }) });
  const t0 = Date.now() - 60000;
  const ev = (sid, cwd, extra, t) => st.apply({ session_id: sid, cwd, transcript_path: '/x', ...extra }, t);
  // 세션 A: 자료실 읽기 → 서브에이전트 출근 → 명령 실행
  ev('sa', '/tmp/smoke/proj-a', { hook_event_name: 'SessionStart', source: 'startup' }, t0);
  ev('sa', '/tmp/smoke/proj-a', { hook_event_name: 'UserPromptSubmit', prompt: '스모크 테스트용 요청입니다' }, t0 + 100);
  ev('sa', '/tmp/smoke/proj-a', { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/tmp/smoke/proj-a/a.js' }, tool_use_id: 't1' }, t0 + 200);
  ev('sa', '/tmp/smoke/proj-a', { hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: {}, tool_response: 'ok', tool_use_id: 't1' }, t0 + 300);
  ev('sa', '/tmp/smoke/proj-a', { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: '코드 탐색', prompt: '...', subagent_type: 'Explore' }, tool_use_id: 't2' }, t0 + 400);
  ev('sa', '/tmp/smoke/proj-a', { hook_event_name: 'SubagentStart', agent_id: 'ag1', agent_type: 'Explore' }, t0 + 500);
  ev('sa', '/tmp/smoke/proj-a', { hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'TODO' }, tool_use_id: 't3', agent_id: 'ag1' }, t0 + 600);
  ev('sa', '/tmp/smoke/proj-a', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_use_id: 't4' }, t0 + 700);
  // 세션 B(같은 층): 질문 중(대기)
  ev('sb', '/tmp/smoke/proj-a', { hook_event_name: 'SessionStart', source: 'startup' }, t0 + 800);
  ev('sb', '/tmp/smoke/proj-a', { hook_event_name: 'UserPromptSubmit', prompt: '두 번째 세션' }, t0 + 900);
  ev('sb', '/tmp/smoke/proj-a', { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: '어느 쪽?' }] }, tool_use_id: 't5' }, t0 + 1000);
  // 세션 C(다른 층): 휴식
  ev('sc', '/tmp/smoke/proj-b', { hook_event_name: 'SessionStart', source: 'startup' }, t0 + 1100);
  ev('sc', '/tmp/smoke/proj-b', { hook_event_name: 'UserPromptSubmit', prompt: '세 번째' }, t0 + 1200);
  ev('sc', '/tmp/smoke/proj-b', { hook_event_name: 'Stop', stop_hook_active: false }, t0 + 1300);
  const snap = st.snapshot();
  return { ...snap, serverPort: 1, hookPort: 1, version: 'smoke', demo: false, journal: null };
}

// ---------- 테스트 ----------
test('scene: 모든 인테리어 프리셋 × 테마 × 시간대에서 바닥·가구·벽·이름표·조명을 그린다', async () => {
  const R = await import('../public/js/scene/render.js');
  const { PRESET_IDS } = await import('../public/js/scene/floorStyle.js');
  const { MODES } = await import('../public/js/scene/daylight.js');
  R.setCacheEnabled(true);
  let combos = 0;
  for (const preset of PRESET_IDS) {
    R.setFloorStyle(preset);
    for (const theme of ['light', 'dark']) {
      R.setTheme(theme);
      for (const mode of MODES.filter((m) => m !== 'auto')) {
        R.setDaylight(mode);
        resetLog();
        const ctx = fakeCtx();
        R.drawFloorRaw(ctx);
        R.drawFloor(ctx, 1);
        R.drawEntities(ctx, 0, [], 1);
        R.drawDaylightFloor(ctx);
        R.drawDaylightLamps(ctx);
        R.drawLabels(ctx, fakeCamera);
        R.drawDaylightTint(ctx, 1600, 900);
        assertClean(`${preset}/${theme}/${mode}`);
        combos++;
      }
    }
  }
  assert.ok(combos >= 5 * 2 * 5, `조합 ${combos}개`);
  assert.ok(R.sharedSpriteCount() > 0, '공유 스프라이트 캐시가 채워져야 한다');
  // 캐시 없이도(직접 그리기) 같은 코드가 돈다
  R.setCacheEnabled(false); resetLog(); R.drawEntities(fakeCtx(), 0, [], 2); assertClean('no-cache'); R.setCacheEnabled(true);
  R.setFloorStyle(PRESET_IDS[0]); R.setTheme('light'); R.setDaylight('off');
});

test('avatar: 프리셋·몸 종류·모든 파츠 옵션·랜덤 조합을 drawAvatar 로 그린다', async () => {
  const A = await import('../public/js/scene/avatar.js');
  resetLog();
  const ctx = fakeCtx();
  let drawn = 0;
  const draw = (spec, extra = {}) => { A.drawAvatar(ctx, 0, 0, A.normalizeAvatar(spec), { scale: 1, ...extra }); drawn++; };
  for (const p of A.PRESETS) { draw(p.spec); draw(p.spec, { blink: true }); draw(p.spec, { typing: true, faceRight: false }); }
  const fresh = () => JSON.parse(JSON.stringify(A.DEFAULTS.claude));
  const id = (opt) => (Array.isArray(opt) ? opt[0] : opt);
  for (const [key, list] of Object.entries(A.OPTIONS)) {
    if (key === 'bodySkins') { for (const [body, colors] of Object.entries(list)) for (const c of colors) { const b = fresh(); b.body = body; b.skin = c; draw(b); } continue; }
    if (Array.isArray(list)) { for (const opt of list) { const b = fresh(); b[key] = id(opt); draw(b); } continue; }
    for (const st of list.styles || []) { const b = fresh(); b[key] = { ...b[key], style: id(st) }; draw(b); }
    for (const c of list.colors || []) { const b = fresh(); b[key] = { ...b[key], color: c }; draw(b); }
  }
  // 몸 종류 × 머리 모양 × 모자 조합 (몸 종류마다 그리기 분기가 다르다)
  for (const body of A.OPTIONS.body) for (const st of A.OPTIONS.hair.styles) for (const hat of A.OPTIONS.hat) { const b = fresh(); b.body = id(body); b.hair.style = id(st); b.hat = id(hat); draw(b, { walking: true, walkT: 0.3 }); }
  for (let i = 0; i < 30; i++) draw(A.randomAvatar(i / 30));
  for (const role of Object.keys(A.DEFAULTS)) draw(A.DEFAULTS[role]);
  assertClean('avatar');
  assert.ok(drawn > 40, `그린 아바타 ${drawn}개`);
});

test('actors + scene: 상태 머신 스냅샷으로 캐릭터를 만들고 수백 프레임 동안 걷기·말풍선·자율 행동을 돌린다', async () => {
  const { store } = await import('../public/js/store.js');
  const { createScene } = await import('../public/js/scene/index.js');
  const { createActors } = await import('../public/js/scene/actors.js');
  const { createAvatarStore } = await import('../public/js/avatarStore.js');
  const snap = buildSnapshot();
  assert.equal(snap.floors.length, 2);
  store.applySnapshot(snap);
  store.selectFloor(snap.floors.find((f) => f.name.includes('proj-a')).id);
  const canvas = fakeEl('canvas');
  const scene = createScene(canvas, store);
  const actors = createActors(store, scene, createAvatarStore());
  actors.sync(true);
  store.setAmbient(true);
  store.emit('snapshot');
  resetLog();
  let now = performance.now();
  let maxEntities = 0;
  for (let i = 0; i < 400; i++) {
    now += 50;
    scene.frame(now);                 // 바닥 → 엔티티(캐릭터 포함) → 이름표 → 오버레이(말풍선)
    const ents = actors.tick(now);
    maxEntities = Math.max(maxEntities, ents.length);
    for (const e of ents) { e.draw(fakeCtx(), now); if (e.overlay) e.overlay(fakeCtx(), scene.camera, now); }
    if (i === 100) { store.selectSession('sb'); store.setBubbleMode('selected'); }
    if (i === 200) { store.setFollowCamera(true); scene.zoomBy(1.5); }
    if (i === 300) { // 세션 A 가 퇴근 → 캐릭터가 엘리베이터로 걸어가 사라진다
      store.applyRemove({ sessionId: 'sa', floorId: store.selectedFloorId, floorRemoved: false });
    }
  }
  assertClean('actors');
  assert.ok(maxEntities >= 4, `캐릭터 엔티티 ${maxEntities}개 (main 2 + 서브 1 + 나)`);
  assert.ok([...actors.actors.values()].every((a) => Number.isFinite(a.x) && Number.isFinite(a.y)), '캐릭터 좌표가 NaN');
  assert.ok(actors.anyMoving() === true || actors.anyMoving() === false);
  // 클릭 판정·호버가 예외 없이 돈다
  actors.hoverAt({ tx: 5, ty: 20 }); actors.hoverAt(null);
  const pick = actors.pick({ tile: { x: 5, y: 20 }, tx: 5.5, ty: 20.5, world: { x: 0, y: 0 }, screen: { x: 0, y: 0 } });
  assert.ok(pick === undefined || pick === null || typeof pick === 'object');
});

test('panels: 층별 안내·사람·로그·헤더·범례 템플릿이 스냅샷으로 렌더된다', async () => {
  const { store } = await import('../public/js/store.js');
  const P = await import('../public/js/panels.js');
  const snap = buildSnapshot();
  store.applySnapshot(snap);
  store.selectFloor(snap.floors.find((f) => f.name.includes('proj-a')).id);
  P.renderAll();
  P.renderLegend();
  P.renderBanner();
  const floors = document.getElementById('floors').innerHTML;
  const people = document.getElementById('people').innerHTML;
  const logHtml = document.getElementById('log').innerHTML;
  assert.match(floors, /proj-a|proj-b/, '층 이름이 층별 안내에 없음');
  assert.match(floors, /세션 \d+개/, '세션 수가 없음');
  assert.ok(people.includes('person') || people.includes('아무도'), '사람 패널이 비어 있음');
  assert.match(logHtml, /log-item/, '로그 항목이 없음');
  assert.ok(!/undefined|NaN|\[object Object\]/.test(floors + people + logHtml), '템플릿에 undefined/NaN/[object Object] 가 섞임');
  store.setLogFilter({ q: '스모크' }); P.renderLog();
  assert.match(document.getElementById('log').innerHTML, /log-item/, '검색어 필터 결과에 항목이 있어야 한다');
  store.setLogFilter({ q: 'zzz-없는-검색어' }); P.renderLog();
  assert.ok(!/log-item/.test(document.getElementById('log').innerHTML), '없는 검색어는 결과가 비어야 한다');
  store.setLogFilter({ q: '' });
});

test('overview: 건물 단면(전체 보기)을 층 수만큼 그리고 층을 클릭으로 고른다', async () => {
  const { store } = await import('../public/js/store.js');
  const { createOverview } = await import('../public/js/overview.js');
  store.applySnapshot(buildSnapshot());
  const canvas = fakeEl('canvas');
  let picked = null;
  const ov = createOverview(canvas, store, { onPick: (f) => { picked = f; } });
  ov.show();
  resetLog();
  ov.frame(performance.now());
  ov.frame(performance.now() + 500);
  ov.setTheme('dark'); ov.frame(performance.now() + 1000);
  assertClean('overview');
  assert.equal(ov.visible, true);
  ov.hide();
  assert.equal(ov.visible, false);
});

test('store: 대기 전이 이벤트, 층 상태, 안정 정렬, 선택 복원이 동작한다', async () => {
  const { store } = await import('../public/js/store.js');
  const snap = buildSnapshot();
  store.applySnapshot(snap);
  const floorA = snap.floors.find((f) => f.name.includes('proj-a'));
  assert.equal(store.floorStatus(floorA.id), 'waiting', '세션 B 가 질문 중이므로 층은 waiting');
  const events = [];
  const off = store.subscribe((k, d) => events.push([k, d]));
  const sc = snap.sessions.find((s) => s.id === 'sc');
  store.applyUpdate({ session: { ...sc, status: 'waiting' }, floor: snap.floors.find((f) => f.id === sc.floorId), log: null });
  assert.ok(events.some(([k]) => k === 'waiting'), '비대기 → 대기 전이에 waiting 이벤트가 나야 한다');
  off();
  const order1 = store.sessionsOfFloorStable(floorA.id).map((s) => s.id);
  const order2 = store.sessionsOfFloorStable(floorA.id).map((s) => s.id);
  assert.deepEqual(order1, order2, '5초 안에는 순서가 고정');
  store.selectFloor(floorA.id); store.selectSession('sb');
  assert.equal(store.selectedSession().id, 'sb');
  assert.equal(typeof store.nameOf(store.selectedSession(), null), 'string');
  assert.ok(store.logOfFloor(floorA.id).length > 0);
});
