'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJournal, slim } = require('../lib/journal');
const { createState } = require('../lib/state');

const CWD = '/Users/me/proj/nccx';
const ev = (extra) => ({ session_id: 's1', cwd: CWD, transcript_path: '/t.jsonl', ...extra });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-journal-'));

function stripTimers(snap) { return JSON.parse(JSON.stringify({ floors: snap.floors, sessions: snap.sessions })); }

test('기록 → 새 state 에 재생하면 같은 상태', () => {
  const dir = tmp();
  const j = createJournal({ dir });
  const a = createState({ me: 'x' });
  const t0 = 1_000_000;
  const events = [
    [t0, ev({ hook_event_name: 'SessionStart', source: 'startup' })],
    [t0 + 100, ev({ hook_event_name: 'UserPromptSubmit', prompt: '훅 서버 만들어줘' })],
    [t0 + 200, ev({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/a/b/server.js', content: 'x'.repeat(5000) }, tool_use_id: 'tu1' })],
    [t0 + 300, ev({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'API 찾기', subagent_type: 'Explore', prompt: 'y'.repeat(3000) }, tool_use_id: 'tu2' })],
    [t0 + 400, ev({ hook_event_name: 'SubagentStart', agent_id: 'ag1', agent_type: 'Explore' })],
    [t0 + 500, ev({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test', description: '테스트' }, tool_use_id: 'tu3', agent_id: 'ag1', agent_type: 'Explore' })],
  ];
  for (const [t, p] of events) { a.apply(p, t); j.append(t, p); }
  j.close();
  const raw = fs.readFileSync(j.file, 'utf8');
  assert.equal(raw.trim().split('\n').length, 6);
  assert.ok(raw.length < 3000, `큰 필드가 잘려야 한다: ${raw.length}`);

  const b = createState({ me: 'x' });
  const j2 = createJournal({ dir });
  const n = j2.replay((p, t) => b.apply(p, t), t0 + 1000);
  assert.equal(n, 6);
  assert.deepEqual(stripTimers(b.snapshot()), stripTimers(a.snapshot()));
  assert.equal(b.get('s1').agents.ag1.room, 'server');
  assert.equal(b.get('s1').agents.ag1.name, 'API 찾기');
});

test('maxAge 보다 오래된 이벤트는 재생하지 않고 파일에서도 지워진다', () => {
  const dir = tmp();
  const j = createJournal({ dir, maxAge: 1000 });
  j.append(0, ev({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'old' }));
  j.append(5000, ev({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'new' }));
  j.close();
  const st = createState();
  const n = j.replay((p, t) => st.apply(p, t), 5500);
  assert.equal(n, 1);
  assert.ok(st.get('new'));
  assert.equal(st.get('old'), undefined);
  assert.equal(fs.readFileSync(j.file, 'utf8').trim().split('\n').length, 1);
});

test('깨진 줄은 건너뛴다, 파일이 없으면 0건', () => {
  const dir = tmp();
  const j = createJournal({ dir });
  assert.equal(j.replay(() => {}, 1), 0);
  fs.writeFileSync(j.file, '{"t":1,"p":{"session_id":"a","hook_event_name":"Stop"}}\nnot json\n\n{"t":2}\n');
  const seen = [];
  assert.equal(j.replay((p, t) => seen.push(t), 10), 1);
  assert.deepEqual(seen, [1]);
});

test('enabled=false 면 아무것도 쓰지 않는다', () => {
  const dir = tmp();
  const j = createJournal({ dir, enabled: false });
  j.append(1, ev({ hook_event_name: 'Stop' }));
  j.close();
  assert.ok(!fs.existsSync(j.file));
  assert.equal(j.replay(() => {}, 1), 0);
});

test('slim: 필요한 키만 남기고 긴 문자열은 200자', () => {
  const s = slim({ session_id: 's', cwd: '/c', hook_event_name: 'PostToolUse', tool_name: 'Read', tool_response: 'x'.repeat(9000), tool_input: { file_path: '/f', content: 'y'.repeat(9000) }, prompt: 'z'.repeat(500), extra: 1 });
  assert.equal(s.tool_response, undefined);
  assert.equal(s.extra, undefined);
  assert.equal(s.tool_input.content, undefined);
  assert.equal(s.tool_input.file_path, '/f');
  assert.equal(s.prompt.length, 200);
});
