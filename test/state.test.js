'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createState, SUBAGENT_LEAVE_MS, SESSION_LEAVE_MS, SESSION_TTL_MS, AWAY_MS, GONE_CHECK_MS, GONE_MS, STAT_INTERVAL_MS } = require('../lib/state');
const { describeTool } = require('../lib/normalize');

const CWD = '/Users/me/proj/nccx';
const base = (extra) => ({ session_id: 's1', cwd: CWD, transcript_path: '/x', ...extra });
const pre = (tool_name, tool_input, extra = {}) => base({ hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: 'tu', ...extra });
const post = (tool_name, extra = {}) => base({ hook_event_name: 'PostToolUse', tool_name, tool_input: {}, tool_response: 'x'.repeat(5000), ...extra });

function fresh() {
  // transcript 는 항상 살아 있는 것으로 본다 (퇴근 감지 테스트는 statFile 을 따로 준다)
  const st = createState({ me: 'tester', statFile: () => ({ mtimeMs: Number.MAX_SAFE_INTEGER }) });
  const updates = [];
  const removes = [];
  st.on('update', (u) => updates.push(u));
  st.on('remove', (r) => removes.push(r));
  return { st, updates, removes, main: () => st.get('s1').agents.main, s: () => st.get('s1') };
}

test('SessionStart: 층은 cwd basename, main 은 내 자리에서 출근', () => {
  const { st, main, updates } = fresh();
  st.apply(base({ hook_event_name: 'SessionStart', source: 'startup' }), 1000);
  const snap = st.snapshot();
  assert.equal(snap.floors[0].name, 'nccx');
  assert.equal(snap.floors[0].no, 1);
  assert.equal(main().room, 'mydesk');
  assert.equal(main().activity, 'wait');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].log.text, '출근했습니다');
});

test('UserPromptSubmit: 제목은 프롬프트 앞 40자, 고민 중', () => {
  const { st, main, s } = fresh();
  st.apply(base({ hook_event_name: 'UserPromptSubmit', prompt: '이것은 아주 긴 요청문입니다 '.repeat(5) }), 1000);
  assert.equal(main().activity, 'think');
  assert.equal(main().bubble, '고민 중…');
  assert.equal(s().status, 'thinking');
  assert.ok(s().title.length <= 40);
});

test('도구별 방 매핑', () => {
  const cases = [
    [pre('Read', { file_path: '/a/b/server.js' }), 'library', 'read', 'server.js 읽는 중'],
    [pre('Grep', { pattern: 'TODO' }), 'library', 'search', '"TODO" 검색 중'],
    [pre('Glob', { pattern: '**/*.ts' }), 'library', 'search', '**/*.ts 찾는 중'],
    [pre('Bash', { command: 'npm test', description: 'Run test suite' }), 'server', 'run', 'Run test suite'],
    [pre('Bash', { command: 'ls -la /very/long/path/that/goes/on' }), 'server', 'run', 'ls -la /very/long/path/that/g… 실행 중'],
    [pre('Edit', { file_path: '/a/app.js' }), 'dev', 'edit', 'app.js 수정 중'],
    [pre('Write', { file_path: '/a/README.md' }), 'dev', 'edit', 'README.md 작성 중'],
    [pre('WebSearch', { query: 'tauri vs electron' }), 'research', 'web', '"tauri vs electron" 검색 중'],
    [pre('WebFetch', { url: 'https://docs.claude.com/en/hooks' }), 'research', 'web', 'docs.claude.com 읽는 중'],
    [pre('mcp__atlassian__searchJiraIssuesUsingJql', {}), 'research', 'web', 'atlassian: searchJiraIssuesUsingJql 조회 중'],
    [pre('Agent', { description: 'Find API endpoints', prompt: '...', subagent_type: 'Explore' }), 'meeting', 'delegate', 'Find API endpoints 맡기는 중'],
    [pre('TodoWrite', {}), 'meeting', 'plan', '할 일 정리 중'],
    [pre('AskUserQuestion', {}), 'mydesk', 'ask', '질문 있어요'],
    [pre('SomethingNew', {}), 'dev', 'work', 'SomethingNew 사용 중'],
  ];
  for (const [payload, room, activity, bubble] of cases) {
    const { st, main } = fresh();
    st.apply(payload, 1000);
    assert.equal(main().room, room, payload.tool_name);
    assert.equal(main().activity, activity, payload.tool_name);
    assert.equal(main().bubble, bubble, payload.tool_name);
    assert.equal(main().tool.name, payload.tool_name);
  }
});

test('PostToolUse: 그 자리에서 고민 중, 로그 없음, 큰 응답은 저장 안 함', () => {
  const { st, main, updates } = fresh();
  st.apply(pre('Read', { file_path: '/a/x.js' }), 1000);
  st.apply(post('Read', { duration_ms: 12 }), 1100);
  assert.equal(main().room, 'library');
  assert.equal(main().activity, 'think');
  assert.equal(main().tool, null);
  assert.equal(updates[1].log, null);
  assert.ok(JSON.stringify(st.snapshot()).length < 3000);
});

test('PostToolUseFailure: 실패 로그', () => {
  const { st, main, updates } = fresh();
  st.apply(pre('Bash', { command: 'npm test' }), 1000);
  st.apply(base({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: {}, error: 'Exit code 1\nError: boom' }), 1100);
  assert.equal(main().icon, '❌');
  assert.match(updates[1].log.text, /Bash 실패: Exit code 1 Error: boom/);
});

test('AskUserQuestion 후 PostToolUse 가 와도 ask 상태 유지 (답을 기다리는 중)', () => {
  const { st, main, s } = fresh();
  st.apply(pre('AskUserQuestion', {}), 1000);
  st.apply(post('AskUserQuestion'), 1100);
  assert.equal(main().activity, 'ask');
  assert.equal(s().status, 'waiting');
});

test('서브에이전트: Agent 설명이 이름이 되고, 엘리베이터로 출퇴근, agent_id 로 도구 호출 구분', () => {
  const { st, s, main, updates } = fresh();
  st.apply(pre('Agent', { description: 'Find API endpoints', subagent_type: 'Explore' }), 1000);
  assert.equal(main().room, 'meeting');
  st.apply(base({ hook_event_name: 'SubagentStart', agent_id: 'agent-1', agent_type: 'Explore' }), 1100);
  const sub = s().agents['agent-1'];
  assert.equal(sub.kind, 'sub');
  assert.equal(sub.name, 'Find API endpoints');
  assert.equal(sub.type, 'Explore');
  assert.equal(sub.room, 'meeting');
  assert.equal(sub.activity, 'arrive');

  st.apply(pre('Read', { file_path: '/a/routes.js' }, { agent_id: 'agent-1', agent_type: 'Explore' }), 1200);
  assert.equal(s().agents['agent-1'].room, 'library');
  assert.equal(s().agents['agent-1'].bubble, 'routes.js 읽는 중');
  assert.equal(main().room, 'meeting', 'main 은 그대로 회의실');

  st.apply(base({ hook_event_name: 'SubagentStop', agent_id: 'agent-1', agent_type: 'Explore', last_assistant_message: 'Found 3 endpoints' }), 2000);
  assert.equal(s().agents['agent-1'].room, 'elevator');
  assert.equal(s().agents['agent-1'].activity, 'leave');
  assert.match(updates.at(-1).log.text, /Find API endpoints 퇴근: Found 3 endpoints/);

  st.sweep(2000 + SUBAGENT_LEAVE_MS - 1);
  assert.ok(s().agents['agent-1'], '아직 걸어가는 중');
  st.sweep(2000 + SUBAGENT_LEAVE_MS);
  assert.equal(s().agents['agent-1'], undefined, '엘리베이터 타고 사라짐');
  assert.ok(main(), 'main 은 남아 있음');
});

test('SubagentStart 없이 agent_id 도구 호출이 오면 agent_type 이름으로 생성', () => {
  const { st, s } = fresh();
  st.apply(pre('Grep', { pattern: 'x' }, { agent_id: 'a9', agent_type: 'general-purpose' }), 1000);
  assert.equal(s().agents.a9.name, 'general-purpose');
  assert.equal(s().agents.a9.room, 'library');
});

test('Notification: permission_prompt → 내 자리 ask, idle_prompt → 휴게실', () => {
  const { st, main, s } = fresh();
  st.apply(base({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission' }), 1000);
  assert.equal(main().room, 'mydesk');
  assert.equal(main().activity, 'ask');
  assert.equal(s().status, 'waiting');
  st.apply(base({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'waiting' }), 2000);
  assert.equal(main().room, 'lounge');
  assert.equal(s().status, 'idle');
});

test('Stop: 휴게실에서 휴식, 마지막 메시지 로그', () => {
  const { st, main, s, updates } = fresh();
  st.apply(base({ hook_event_name: 'Stop', last_assistant_message: 'I have completed the refactoring.' }), 1000);
  assert.equal(main().room, 'lounge');
  assert.equal(main().activity, 'rest');
  assert.equal(s().status, 'idle');
  assert.equal(updates[0].log.text, 'I have completed the refactoring.');
});

test('PreCompact: 자리 유지, 기억 정리 중', () => {
  const { st, main } = fresh();
  st.apply(pre('Edit', { file_path: '/a/x.js' }), 1000);
  st.apply(base({ hook_event_name: 'PreCompact', trigger: 'auto', custom_instructions: null }), 1100);
  assert.equal(main().room, 'dev');
  assert.equal(main().activity, 'compact');
});

test('SessionEnd: 모두 퇴근, 10초 뒤 세션 제거, 빈 층도 제거', () => {
  const { st, removes, s } = fresh();
  st.apply(base({ hook_event_name: 'SessionStart', source: 'startup' }), 1000);
  st.apply(base({ hook_event_name: 'SessionEnd', reason: 'other' }), 2000);
  assert.equal(s().status, 'ended');
  assert.equal(s().agents.main.room, 'elevator');
  st.sweep(2000 + SESSION_LEAVE_MS);
  assert.equal(st.get('s1'), undefined);
  assert.equal(removes.length, 1);
  assert.equal(removes[0].floorRemoved, true);
  assert.equal(st.snapshot().floors.length, 0);
});

test('2시간 무활동 세션은 퇴근 처리 후 10초 뒤 제거', () => {
  const { st } = fresh();
  st.apply(base({ hook_event_name: 'SessionStart', source: 'startup' }), 1000);
  st.sweep(1000 + SESSION_TTL_MS);
  assert.equal(st.get('s1').status, 'ended');
  st.sweep(1000 + SESSION_TTL_MS + SESSION_LEAVE_MS);
  assert.equal(st.get('s1'), undefined);
});

test('층 번호는 프로젝트 출현 순서, 같은 cwd 의 세션은 같은 층', () => {
  const { st } = fresh();
  st.apply(base({ hook_event_name: 'SessionStart', source: 'startup' }), 1000);
  st.apply({ session_id: 's2', cwd: '/Users/me/proj/mcp-hub', hook_event_name: 'SessionStart', source: 'startup' }, 1001);
  st.apply({ session_id: 's3', cwd: CWD, hook_event_name: 'SessionStart', source: 'startup' }, 1002);
  const floors = st.snapshot().floors;
  assert.deepEqual(floors.map((f) => [f.no, f.name, f.sessionIds.length]), [[1, 'nccx', 2], [2, 'mcp-hub', 1]]);
});

test('describeTool: 입력이 없어도 깨지지 않는다', () => {
  assert.equal(describeTool('Read').bubble, '파일 읽는 중');
  assert.equal(describeTool('Bash', null).bubble, '명령 실행 중');
  assert.equal(describeTool('', undefined).room, 'dev');
});

test('UserPromptSubmit: <task-notification> 같은 시스템 메시지는 제목/프롬프트 로그로 쓰지 않는다', () => {
  const { st, main, s, updates } = fresh();
  st.apply(base({ hook_event_name: 'UserPromptSubmit', prompt: '<task-notification>\n<task-id>abc</task-id>\n</task-notification>' }), 1000);
  assert.equal(s().title, '');
  assert.equal(main().bubble, '알림 확인 중');
  assert.match(updates[0].log.text, /알림 수신 \(task-notification\)/);
  st.apply(base({ hook_event_name: 'UserPromptSubmit', prompt: '진짜 요청' }), 1100);
  assert.equal(s().title, '진짜 요청');
});

test('도구 detail 과 세션 firstPrompt/lastPrompt 가 저장된다', () => {
  const { st, main, s } = fresh();
  st.apply(base({ hook_event_name: 'UserPromptSubmit', prompt: '첫 요청' }), 1000);
  st.apply(base({ hook_event_name: 'UserPromptSubmit', prompt: '둘째 요청' }), 1100);
  assert.equal(s().firstPrompt, '첫 요청');
  assert.equal(s().lastPrompt, '둘째 요청');
  st.apply(pre('Read', { file_path: '/very/long/path/to/server.js' }), 1200);
  assert.equal(main().tool.detail, '/very/long/path/to/server.js');
  st.apply(pre('Bash', { command: 'npm test -- --watch', description: '테스트' }), 1300);
  assert.equal(main().tool.detail, 'npm test -- --watch');
  st.apply(pre('Grep', { pattern: 'TODO', path: '/src' }), 1400);
  assert.equal(main().tool.detail, 'TODO in /src');
  st.apply(pre('Agent', { description: 'API 찾기', subagent_type: 'Explore', prompt: 'x'.repeat(500) }), 1500);
  assert.ok(main().tool.detail.startsWith('[Explore] xxx'));
  assert.ok(main().tool.detail.length <= 200);
});

test('30분 무활동이면 자리 비움(away), 새 이벤트가 오면 복귀', () => {
  const { st, main, s } = fresh();
  st.apply(base({ hook_event_name: 'Stop', last_assistant_message: 'done' }), 1000);
  st.sweep(1000 + AWAY_MS);
  assert.equal(s().status, 'away');
  assert.equal(main().bubble, '자리 비움');
  st.apply(base({ hook_event_name: 'UserPromptSubmit', prompt: '다시 시작' }), 1000 + AWAY_MS + 5);
  assert.equal(s().status, 'thinking');
});

test('transcript 가 사라졌으면 10분 뒤 퇴근 처리, 갱신 중이면 유지', () => {
  let exists = true;
  let mtime = 0;
  const st = createState({ statFile: () => (exists ? { mtimeMs: mtime } : null) });
  st.apply(base({ hook_event_name: 'SessionStart', source: 'startup', transcript_path: '/t/s1.jsonl' }), 1000);
  mtime = 1500; // 훅 이후에도 transcript 가 갱신됨 → 살아 있음
  st.sweep(1000 + GONE_CHECK_MS);
  assert.equal(st.get('s1').status, 'idle');
  exists = false;
  st.sweep(1000 + GONE_CHECK_MS + STAT_INTERVAL_MS);
  assert.equal(st.get('s1').status, 'ended');
  assert.equal(st.get('s1').agents.main.room, 'elevator');
  st.sweep(1000 + GONE_CHECK_MS + STAT_INTERVAL_MS + SESSION_LEAVE_MS);
  assert.equal(st.get('s1'), undefined);
});

test('transcript 가 마지막 훅 이후 갱신되지 않고 60분 지나면 퇴근, stat 은 1분에 한 번만', () => {
  let calls = 0;
  const st = createState({ statFile: () => { calls++; return { mtimeMs: 900 }; } });
  st.apply(base({ hook_event_name: 'SessionStart', source: 'startup', transcript_path: '/t/s1.jsonl' }), 1000);
  st.sweep(1000 + GONE_CHECK_MS);
  st.sweep(1000 + GONE_CHECK_MS + 1000);
  assert.equal(calls, 1, 'stat 은 1분 간격');
  assert.equal(st.get('s1').status, 'idle');
  st.sweep(1000 + AWAY_MS);
  assert.equal(st.get('s1').status, 'away');
  st.sweep(1000 + GONE_MS);
  assert.equal(st.get('s1').status, 'ended');
});

test('같은 폴더명 프로젝트는 상위 폴더를 붙여 구분하고, 하나가 사라지면 짧은 이름으로 복원', () => {
  const st = createState({ statFile: () => ({ mtimeMs: Number.MAX_SAFE_INTEGER }) });
  const floorEvents = [];
  st.on('floor', (f) => floorEvents.push(f));
  st.apply({ session_id: 'a', cwd: '/Users/me/work/nccx', hook_event_name: 'SessionStart', source: 'startup' }, 1000);
  assert.equal(st.snapshot().floors[0].name, 'nccx');
  st.apply({ session_id: 'b', cwd: '/Users/me/bitbucket/nccx', hook_event_name: 'SessionStart', source: 'startup' }, 1001);
  assert.deepEqual(st.snapshot().floors.map((f) => f.name).sort(), ['bitbucket/nccx', 'work/nccx']);
  assert.equal(floorEvents.length, 1, '기존 층 이름 변경이 floor 이벤트로 나감');
  assert.equal(floorEvents[0].name, 'work/nccx');
  st.apply({ session_id: 'c', cwd: '/Users/me/other/mcp-hub', hook_event_name: 'SessionStart', source: 'startup' }, 1002);
  assert.ok(st.snapshot().floors.some((f) => f.name === 'mcp-hub'), '겹치지 않는 이름은 그대로');
  st.apply({ session_id: 'b', cwd: '/Users/me/bitbucket/nccx', hook_event_name: 'SessionEnd', reason: 'other' }, 2000);
  st.sweep(2000 + SESSION_LEAVE_MS);
  assert.ok(st.snapshot().floors.some((f) => f.name === 'nccx'), '혼자 남으면 다시 짧은 이름');
});
