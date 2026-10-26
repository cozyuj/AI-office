'use strict';
// 묶음 폴더(git 저장소 아님)에서 연 세션은 실제로 작업하는 저장소 층으로 옮긴다 (BE-22)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createState } = require('../lib/state');

// ws/ (git 아님) 아래에 저장소 a, b
const WS = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-follow-'));
for (const r of ['a', 'b']) {
  fs.mkdirSync(path.join(WS, r, '.git'), { recursive: true });
  fs.writeFileSync(path.join(WS, r, '.git', 'HEAD'), `ref: refs/heads/main-${r}\n`);
}
const A = path.join(WS, 'a');
const B = path.join(WS, 'b');
test.after(() => fs.rmSync(WS, { recursive: true, force: true }));

function fresh(cwd = WS) {
  const st = createState({ me: 'tester', statFile: () => ({ mtimeMs: Number.MAX_SAFE_INTEGER }) });
  const updates = [], removes = [], floorsEv = [];
  st.on('update', (u) => updates.push(u));
  st.on('remove', (r) => removes.push(r));
  st.on('floor', (f) => floorsEv.push(f));
  let t = 1000;
  const send = (extra) => st.apply({ session_id: 's1', cwd, transcript_path: '/x', ...extra }, t += 10);
  const tool = (tool_name, tool_input) => send({ hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: 'tu' });
  send({ hook_event_name: 'SessionStart', source: 'startup' });
  return { st, updates, removes, floorsEv, send, tool, s: () => st.get('s1'), floorIds: () => st.snapshot().floors.map((f) => f.id) };
}

test('묶음 폴더 세션: 저장소를 건드리기 전엔 연 폴더 층, 읽으면 그 저장소 층으로', () => {
  const { tool, s, floorIds, updates, removes } = fresh();
  assert.equal(s().floorId, WS);
  tool('TodoWrite', {});
  assert.equal(s().floorId, WS);
  tool('Read', { file_path: path.join(A, 'src', 'x.js') });
  assert.equal(s().floorId, A);
  assert.deepEqual(floorIds(), [A], '비게 된 묶음 폴더 층은 지운다');
  assert.equal(s().branch, 'main-a');
  assert.equal(s().cwd, WS, '이어가기 위치는 처음 연 폴더 그대로');
  assert.ok(removes.some((r) => r.sessionId === null && r.floorId === WS && r.floorRemoved));
  const moveLog = updates.find((u) => u.log && /이동$/.test(u.log.text));
  assert.equal(moveLog.log.text, 'a 층으로 이동');
  assert.equal(moveLog.log.icon, '🛗');
  assert.equal(moveLog.floor.id, A);
  // 새 층 update 가 빈 층 제거보다 먼저 (화면이 선택을 옮긴 뒤 층이 사라지게)
  const last = updates[updates.length - 1];
  assert.equal(last.floor.id, A);
  assert.equal(last.log.text, 'x.js 읽는 중', '도구 로그는 새 층에 남는다');
});

test('동점이면 지금 층 유지, 확실히 많아질 때만 옮긴다', () => {
  const { tool, s } = fresh();
  tool('Read', { file_path: path.join(A, 'x.js') });
  tool('Read', { file_path: path.join(B, 'y.js') });
  assert.equal(s().floorId, A, 'a 1 : b 1 → 그대로');
  tool('Grep', { pattern: 'foo', path: B });
  assert.equal(s().floorId, B, 'a 1 : b 2 → b');
});

test('고친 파일이 읽은 횟수보다 우선', () => {
  const { tool, s } = fresh();
  for (let i = 0; i < 5; i++) tool('Read', { file_path: path.join(A, `f${i}.js`) });
  tool('Edit', { file_path: path.join(B, 'z.js') });
  assert.equal(s().floorId, B, 'b 를 한 번이라도 고치면 b');
  for (let i = 0; i < 5; i++) tool('Read', { file_path: path.join(A, `g${i}.js`) });
  assert.equal(s().floorId, B, '읽기만으로는 고친 저장소를 못 이긴다');
  tool('Edit', { file_path: path.join(B, 'z2.js') });
  tool('Write', { file_path: path.join(A, 'new', 'n.js') });
  assert.equal(s().floorId, B, '고침 b 2 : a 1 → 그대로');
  tool('Edit', { file_path: path.join(A, 'f0.js') });
  assert.equal(s().floorId, A, '고침 2 : 2 동점이면 많이 본 a');
});

test('Bash 의 앞머리 cd, 상대 경로, 저장소 밖 경로', () => {
  const { tool, s } = fresh();
  tool('Bash', { command: 'git status' });
  assert.equal(s().floorId, WS, 'cd 없는 명령은 경로로 치지 않는다');
  tool('Read', { file_path: path.join(os.tmpdir(), 'not-a-repo-file.txt') });
  assert.equal(s().floorId, WS, '저장소 밖 경로는 세지 않는다');
  tool('Bash', { command: `cd "${B}" && npm test` });
  assert.equal(s().floorId, B);
  tool('Glob', { pattern: '*.js', path: 'a' });
  tool('Read', { file_path: 'a/x.js' });
  assert.equal(s().floorId, A, '상대 경로는 연 폴더 기준');
});

test('저장소 안에서 연 세션은 다른 저장소를 고쳐도 층을 옮기지 않는다', () => {
  const { tool, s, floorIds } = fresh(A);
  for (let i = 0; i < 3; i++) tool('Edit', { file_path: path.join(B, `z${i}.js`) });
  assert.equal(s().floorId, A);
  assert.deepEqual(floorIds(), [A]);
});

test('다른 세션이 남아 있는 층은 지우지 않고 갱신만', () => {
  const { st, tool, s, floorsEv } = fresh();
  st.apply({ session_id: 's2', cwd: WS, hook_event_name: 'SessionStart', source: 'startup' }, 1005);
  tool('Read', { file_path: path.join(A, 'x.js') });
  assert.equal(s().floorId, A);
  const ws = st.snapshot().floors.find((f) => f.id === WS);
  assert.deepEqual(ws.sessionIds, ['s2']);
  assert.ok(floorsEv.some((f) => f.id === WS && f.sessionIds.length === 1));
});

test('서브에이전트의 도구도 세고, 세션을 치우면 기록도 지운다', () => {
  const { st, send, s } = fresh();
  send({ hook_event_name: 'PreToolUse', agent_id: 'ag1', agent_type: 'Explore', tool_name: 'Read', tool_input: { file_path: path.join(B, 'q.js') }, tool_use_id: 't' });
  assert.equal(s().floorId, B);
  st.remove('s1');
  assert.equal(st.get('s1'), undefined);
  assert.deepEqual(st.snapshot().floors, []);
});

test('데모 세션은 옮기지 않는다', () => {
  const { tool, s } = fresh('/demo/shop');
  tool('Read', { file_path: path.join(A, 'x.js') });
  assert.equal(s().floorId, '/demo/shop');
});
