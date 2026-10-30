'use strict';
// 답 기다리는 세션 큐 (FE-73): 오래 기다린 순 정렬 · 경과 시간 · N 순환 · 배지/목록 렌더
const test = require('node:test');
const assert = require('node:assert/strict');
const { createState } = require('../lib/state');

// ---------- 최소 DOM (store·waitQueue 가 쓰는 만큼) ----------
function fakeEl(id) {
  const cls = new Set();
  const listeners = {};
  return {
    id, innerHTML: '', textContent: '', title: '', dataset: {},
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, v) => { if (v === undefined) v = !cls.has(c); v ? cls.add(c) : cls.delete(c); return v; } },
    addEventListener: (k, fn) => { listeners[k] = fn; }, fire: (k, e) => listeners[k] && listeners[k](e),
    querySelectorAll: () => [], contains: () => false,
  };
}
const els = new Map();
const storage = new Map();
try { Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) }, configurable: true, writable: true }); } catch {}
globalThis.document = { getElementById: (id) => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); }, addEventListener() {} };
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0; // 1초 갱신 타이머가 테스트 프로세스를 붙잡지 않게
test.after(() => { globalThis.setInterval = realSetInterval; });

// 세 층에 세 세션이 시간차로 기다린다: c(가장 먼저) → a → b, d 는 일하는 중
function snapshot(t0) {
  const st = createState({ me: 'tester', statFile: () => ({ mtimeMs: Number.MAX_SAFE_INTEGER }) });
  const ev = (sid, cwd, extra, t) => st.apply({ session_id: sid, cwd, transcript_path: '/x', ...extra }, t);
  for (const [sid, cwd] of [['a', '/tmp/wq/one'], ['b', '/tmp/wq/two'], ['c', '/tmp/wq/three'], ['d', '/tmp/wq/one']]) ev(sid, cwd, { hook_event_name: 'UserPromptSubmit', prompt: `세션 ${sid}` }, t0);
  ev('c', '/tmp/wq/three', { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Bash' }, t0 + 1000);
  ev('a', '/tmp/wq/one', { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [] }, tool_use_id: 'q1' }, t0 + 5000);
  ev('b', '/tmp/wq/two', { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Edit' }, t0 + 9000);
  // c 는 기다리는 중에 다른 훅이 와도 처음 시각을 유지한다 → 여전히 맨 앞
  ev('c', '/tmp/wq/three', { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Bash' }, t0 + 12000);
  ev('d', '/tmp/wq/one', { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/tmp/wq/one/x.js' }, tool_use_id: 'r1' }, t0 + 13000);
  return { ...st.snapshot(), serverPort: 1, hookPort: 1, version: 'test', demo: false };
}

test('waitingQueue: 마지막 활동이 아니라 기다리기 시작한 순서로, 일하는 세션은 빼고', async () => {
  const { store } = await import('../public/js/store.js');
  const t0 = Date.now() - 60000;
  store.applySnapshot(snapshot(t0));
  assert.deepEqual(store.waitingQueue().map((s) => s.id), ['c', 'a', 'b']);
  assert.deepEqual(store.waitingSessions().map((s) => s.id), ['c', 'b', 'a'], '최근 활동 순(기존)과는 다르다');
});

test('nextWaiting (단축키 N): 대기 목록 밖이면 가장 오래 기다린 세션, 그다음은 차례로, 끝이면 처음으로', async () => {
  const { store } = await import('../public/js/store.js');
  store.applySnapshot(snapshot(Date.now() - 60000));
  store.selectSession('d');
  const seen = [];
  for (let i = 0; i < 4; i++) { const s = store.nextWaiting(); seen.push(s.id); store.selectSession(s.id); }
  assert.deepEqual(seen, ['c', 'a', 'b', 'c']);
  // 답을 받으면 목록에서 빠진다
  const a = store.sessions.get('a');
  store.applyUpdate({ session: { ...a, status: 'thinking', waitingSince: null, waitingFor: null }, floor: store.floors.get(a.floorId), log: null });
  store.selectSession('c');
  assert.equal(store.nextWaiting().id, 'b');
  for (const s of [...store.sessions.values()]) if (s.status === 'waiting') store.applyUpdate({ session: { ...s, status: 'idle', waitingSince: null }, floor: store.floors.get(s.floorId), log: null });
  assert.equal(store.nextWaiting(), null, '기다리는 세션이 없으면 null');
});

test('waitingQueue: waitingSince 가 없는 예전 서버 세션은 마지막 활동 시각으로 정렬', async () => {
  const { store } = await import('../public/js/store.js');
  const snap = snapshot(Date.now() - 60000);
  for (const s of snap.sessions) delete s.waitingSince;
  store.applySnapshot(snap);
  assert.deepEqual(store.waitingQueue().map((s) => s.id), ['a', 'b', 'c']);
});

test('queueRows · 배지: 층 · 제목 · 허락/질문 · 경과 시간, 항목·N 으로 고르면 onPick', async () => {
  const { store } = await import('../public/js/store.js');
  const W = await import('../public/js/waitQueue.js');
  const t0 = Date.now() - 600000;
  store.applySnapshot(snapshot(t0));
  const now = t0 + 1000 + 192000; // c 가 3분 12초 기다림
  const rows = W.queueRows(now);
  assert.deepEqual(rows.map((r) => [r.id, r.waitFor, r.elapsed]), [['c', '🔐 허락', '3분 12초'], ['a', '❓ 질문', '3분 8초'], ['b', '🔐 허락', '3분 4초']]);
  assert.match(rows[0].floor, /^\dF three$/);
  assert.equal(rows[0].title, '세션 c');

  const picked = [];
  for (const id of ['wait-wrap', 'wait-menu']) document.getElementById(id).classList.add('hidden'); // index.html 처음 상태
  const q = W.createWaitQueue({ onPick: (id) => picked.push(id) });
  const $ = (id) => document.getElementById(id);
  assert.equal($('wait-wrap').classList.contains('hidden'), false, '기다리는 세션이 있으면 배지가 보인다');
  assert.equal($('wait-count').textContent, 3);
  assert.equal(q.isOpen(), false);
  $('wait-btn').fire('click', { stopPropagation() {} });
  assert.equal(q.isOpen(), true);
  const html = $('wait-list').innerHTML;
  assert.ok(html.indexOf('data-session="c"') < html.indexOf('data-session="a"') && html.indexOf('data-session="a"') < html.indexOf('data-session="b"'), '오래 기다린 순');
  assert.match(html, /🔐 허락/); assert.match(html, /❓ 질문/);
  $('wait-list').fire('click', { target: { closest: () => ({ dataset: { session: 'a' } }) } });
  assert.deepEqual(picked, ['a']);
  assert.equal(q.isOpen(), false, '고르면 목록을 닫는다');
  store.selectSession('a');
  assert.equal(q.next().id, 'b');
  assert.deepEqual(picked, ['a', 'b']);

  for (const s of [...store.sessions.values()]) if (s.status === 'waiting') store.applyUpdate({ session: { ...s, status: 'idle', waitingSince: null }, floor: store.floors.get(s.floorId), log: null });
  assert.equal($('wait-wrap').classList.contains('hidden'), true, '아무도 안 기다리면 배지를 숨긴다');
  assert.equal(q.next(), null);
});
