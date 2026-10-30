// 오늘의 근무 기록 (FE-72): 일별 집계 · 자정 넘김 · 데모 제외 · 재시작 이어쓰기 · 보관 기간
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDailyStats, dayKey, addDays } = require('../lib/dailyStats');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-stats-'));
const at = (y, m, d, h, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();
const MIN = 60 * 1000;
const sess = (status, extra = {}) => ({ id: 's1', status, floorId: '/Users/me/proj/alpha', cwd: '/Users/me/proj/alpha', title: '첫 요청', branch: 'main', ...extra });

test('상태가 머문 시간을 일한 시간(thinking+working)·답 기다린 시간으로 더한다', () => {
  const d = createDailyStats({ dir: tmp(), enabled: false });
  const t0 = at(2026, 10, 30, 10);
  d.observe(sess('idle'), t0);
  d.observe(sess('thinking'), t0 + 1 * MIN);   // idle 1분은 세지 않는다
  d.observe(sess('working'), t0 + 3 * MIN);    // thinking 2분
  d.observe(sess('waiting'), t0 + 8 * MIN);    // working 5분
  d.observe(sess('thinking'), t0 + 11 * MIN);  // waiting 3분
  d.sync([sess('thinking')], t0 + 12 * MIN);   // thinking 1분 (sweep 이 지금까지 맞춘다)
  const sum = d.summary('2026-10-30');
  assert.equal(sum.totals.thinkMs, 3 * MIN);
  assert.equal(sum.totals.workMs, 8 * MIN, '일한 시간 = thinking 3분 + working 5분');
  assert.equal(sum.totals.waitMs, 3 * MIN);
  assert.equal(sum.sessions[0].title, '첫 요청');
  assert.equal(sum.projects[0].name, 'alpha');
});

test('훅으로 요청·도구(종류별)·고친 파일(중복 제외)·서브에이전트를 센다', () => {
  const d = createDailyStats({ dir: tmp(), enabled: false });
  const t = at(2026, 10, 30, 9);
  const s = sess('thinking');
  d.hook({ hook_event_name: 'UserPromptSubmit', prompt: '고쳐줘' }, s, t);
  d.hook({ hook_event_name: 'UserPromptSubmit', prompt: '<task-notification>끝</task-notification>' }, s, t); // 시스템 알림은 요청 아님
  d.hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/a.js' } }, s, t);
  d.hook({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/a.js' } }, s, t);
  d.hook({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/a.js' } }, s, t);
  d.hook({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '/b.js' } }, s, t);
  d.hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: '/b.js' } }, s, t); // Post 는 세지 않는다
  d.hook({ hook_event_name: 'SubagentStart', agent_id: 'ag1', agent_type: 'Explore' }, s, t);
  const sum = d.summary('2026-10-30');
  assert.equal(sum.totals.prompts, 1);
  assert.equal(sum.totals.tools, 4);
  assert.deepEqual(sum.totals.toolsByName, { Read: 1, Edit: 2, Write: 1 });
  assert.equal(sum.totals.files, 2, '같은 파일을 여러 번 고쳐도 1개');
  assert.equal(sum.totals.subagents, 1);
});

test('자정을 넘긴 시간은 날짜별로 나눠 쌓는다', () => {
  const d = createDailyStats({ dir: tmp(), enabled: false });
  d.observe(sess('working'), at(2026, 10, 29, 23, 50));
  d.observe(sess('idle'), at(2026, 10, 30, 0, 20));
  assert.equal(d.summary('2026-10-29').totals.workMs, 10 * MIN);
  assert.equal(d.summary('2026-10-30').totals.workMs, 20 * MIN);
});

test('데모 세션(/demo/)은 집계하지 않는다', () => {
  const d = createDailyStats({ dir: tmp(), enabled: false });
  const demo = sess('working', { id: 'demo-1', floorId: '/demo/nccx', cwd: '/demo/nccx' });
  const t = at(2026, 10, 30, 10);
  d.observe(demo, t);
  d.hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {} }, demo, t + MIN);
  d.sync([demo], t + 5 * MIN);
  assert.equal(d.summary('2026-10-30').totals.sessions, 0);
});

test('재시작해도 파일에서 이어서 쌓는다 (같은 날 기록을 덮어쓰지 않는다)', () => {
  const dir = tmp();
  const t = at(2026, 10, 30, 10);
  const a = createDailyStats({ dir, clock: () => t });
  a.observe(sess('working'), t);
  a.hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }, sess('working'), t + MIN);
  a.observe(sess('idle'), t + 2 * MIN);
  a.close();
  assert.ok(fs.existsSync(path.join(dir, '2026-10-30.json')));

  const b = createDailyStats({ dir, clock: () => t + 10 * MIN });
  b.observe(sess('working'), t + 10 * MIN);
  b.hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }, sess('working'), t + 11 * MIN);
  b.observe(sess('idle'), t + 13 * MIN);
  b.flush(t + 13 * MIN);
  const sum = b.summary('2026-10-30');
  assert.equal(sum.totals.workMs, 5 * MIN, '2분 + 3분');
  assert.equal(sum.totals.toolsByName.Bash, 2);
  // 서버를 한 번 더 켜면 파일에서 그대로 읽힌다
  assert.equal(createDailyStats({ dir }).summary('2026-10-30').totals.workMs, 5 * MIN);
});

test('보관 기간이 지난 파일은 지우고, 날짜 목록·잘못된 날짜를 다룬다', () => {
  const dir = tmp();
  const now = at(2026, 10, 30, 12);
  for (const k of ['2026-09-01', '2026-09-30', '2026-10-01', '2026-10-29']) fs.writeFileSync(path.join(dir, `${k}.json`), JSON.stringify({ date: k, sessions: {} }));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  const d = createDailyStats({ dir, keepDays: 30, clock: () => now });
  assert.equal(d.prune(now), 2, '30일(10/01~10/30)보다 오래된 09/01·09/30 삭제');
  assert.deepEqual(d.dates(), ['2026-10-01', '2026-10-29']);
  assert.ok(fs.existsSync(path.join(dir, 'notes.txt')), '다른 파일은 건드리지 않는다');
  assert.equal(d.summary('../etc/passwd'), null);
  assert.equal(d.summary('2026-10-30').today, true);
});

test('dayKey · addDays 는 로컬 날짜 기준', () => {
  assert.equal(dayKey(at(2026, 1, 1, 0, 0, 1)), '2026-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
