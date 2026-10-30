'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const FS = require('../lib/floorStyle');
const { createState, restRoomFor, REST_ROOMS, REST_BUBBLE, SUBAGENT_LEAVE_MS, SESSION_LEAVE_MS, SESSION_TTL_MS, AWAY_MS, GONE_CHECK_MS, GONE_MS, STAT_INTERVAL_MS } = require('../lib/state');
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

test('AskUserQuestion 은 답할 때까지 waiting, 답하면(PostToolUse) 다시 고민 중 (FE-64)', () => {
  const { st, main, s } = fresh();
  st.apply(pre('AskUserQuestion', {}), 1000);
  assert.equal(main().activity, 'ask');
  assert.equal(s().status, 'waiting');
  st.apply(post('AskUserQuestion'), 1100);
  assert.equal(main().activity, 'think');
  assert.equal(s().status, 'thinking');
});

test('허락 요청 → 승인해 도구가 끝나면(PostToolUse) waiting 이 풀린다 (FE-64)', () => {
  const { st, s } = fresh();
  st.apply(pre('Bash', { command: 'ls' }), 1000);
  st.apply(base({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Bash' }), 1100);
  assert.equal(s().status, 'waiting');
  st.apply(post('Bash'), 1200);
  assert.equal(s().status, 'thinking');
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

test('Notification: permission_prompt → 내 자리 ask, idle_prompt → 휴식 방', () => {
  const { st, main, s } = fresh();
  st.apply(base({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission' }), 1000);
  assert.equal(main().room, 'mydesk');
  assert.equal(main().activity, 'ask');
  assert.equal(s().status, 'waiting');
  st.apply(base({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'waiting' }), 2000);
  assert.equal(main().room, restRoomFor('s1'));
  assert.equal(main().activity, 'rest');
  assert.equal(main().bubble, '할 일 기다리는 중');
  assert.equal(s().status, 'idle');
});

test('Stop: 휴식 방(휴게실·카페·테라스)에서 휴식, 마지막 메시지 + 간 곳 로그', () => {
  const { st, main, s, updates } = fresh();
  st.apply(base({ hook_event_name: 'Stop', last_assistant_message: 'I have completed the refactoring.' }), 1000);
  assert.ok(REST_ROOMS.includes(main().room), main().room);
  assert.equal(main().activity, 'rest');
  const info = FS.restInfo(st.snapshot().floors[0].style, main().room);
  assert.equal(main().bubble, info.bubble, '말풍선은 층 편의시설 기준');
  assert.equal(main().icon, info.icon);
  assert.equal(s().status, 'idle');
  assert.equal(updates[0].log.text, `I have completed the refactoring. → ${info.icon} ${info.label}`);
});

test('층 프리셋(FE-36): 층마다 style 이 결정적으로 붙고, 직접 선택하면 floor 이벤트 + 휴식 말풍선·로그 문구가 그 층 편의시설로 바뀐다', () => {
  const { st, main, updates } = fresh();
  const floorsEv = [];
  st.on('floor', (f) => floorsEv.push(f));
  st.apply(base({ hook_event_name: 'SessionStart', source: 'startup' }), 1000);
  const f0 = st.snapshot().floors[0];
  assert.ok(FS.AUTO_PRESETS.includes(f0.style) && f0.styleAuto === f0.style && f0.styleOverride === null, JSON.stringify(f0));
  assert.equal(f0.style, FS.assignPresets([{ id: CWD, no: 1 }]).get(CWD), '클라이언트와 같은 해시 배정');
  // 두 번째 층(다른 세션) → 이웃 규칙으로 둘이 다르다
  st.apply({ session_id: 's2', cwd: '/Users/me/proj/other', transcript_path: '/y', hook_event_name: 'SessionStart', source: 'startup' }, 1100);
  const [a, b] = st.snapshot().floors;
  assert.notEqual(a.style, b.style);
  // 직접 선택: mint(헬스장·옥상정원) → 휴식 방 cafe/terrace 가 헬스장/옥상정원으로
  const r = st.setFloorStyle(CWD, 'mint');
  assert.equal(r.style, 'mint'); assert.equal(r.styleOverride, 'mint');
  assert.ok(floorsEv.some((f) => f.id === CWD && f.style === 'mint'), '선택이 floor 이벤트로 전파');
  st.apply(base({ hook_event_name: 'Stop', last_assistant_message: 'done' }), 2000);
  const room = main().room, info = FS.restInfo('mint', room);
  assert.equal(main().bubble, info.bubble);
  assert.equal(main().icon, info.icon);
  assert.equal(updates.at(-1).log.text, `done → ${info.icon} ${info.label}`);
  if (room === 'cafe') assert.equal(info.label, '헬스장');
  if (room === 'terrace') assert.equal(info.label, '옥상정원');
  // 자동으로 되돌리기 · 모르는 프리셋은 무시
  assert.equal(st.setFloorStyle(CWD, null).styleOverride, null);
  assert.equal(st.setFloorStyle(CWD, 'nope').style, f0.styleAuto);
  // 아직 없는 층도 선택은 저장된다 (나중에 층이 생기면 적용)
  assert.equal(st.setFloorStyle('/Users/me/later', 'sand').style, 'sand');
  st.apply({ session_id: 's3', cwd: '/Users/me/later', transcript_path: '/z', hook_event_name: 'SessionStart', source: 'startup' }, 3000);
  assert.equal(st.snapshot().floors.find((f) => f.id === '/Users/me/later').style, 'sand');
});

test('휴식 방은 세션 id 로 정해져 같은 세션은 늘 같은 방, 여러 세션은 세 방에 나뉜다', () => {
  assert.deepEqual(REST_ROOMS, ['lounge', 'cafe', 'terrace']);
  const ids = ['c1948d9b', 'ef13b3cc', '9f0a1c22', 'a77e2d10', 's1', 's2', 's3', 'demo0004', '7e1f0d2a-1b3c-4d5e-8f90-123456789abc'];
  for (const id of ids) {
    assert.ok(REST_ROOMS.includes(restRoomFor(id)), id);
    assert.equal(restRoomFor(id), restRoomFor(id), '같은 id 는 같은 방');
  }
  assert.equal(new Set(ids.map(restRoomFor)).size, 3, '세 방이 모두 쓰인다');
  assert.ok(REST_ROOMS.includes(restRoomFor(undefined)), 'id 가 없어도 깨지지 않는다');

  // 같은 세션은 Stop → idle_prompt → 자리 비움 → 다시 Stop 까지 전부 같은 방 (클라이언트가 방을 옮기지 않는다)
  const { st, main } = fresh();
  st.apply(base({ hook_event_name: 'Stop', last_assistant_message: 'done' }), 1000);
  const room = main().room;
  st.apply(base({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'waiting' }), 2000);
  assert.equal(main().room, room);
  st.sweep(2000 + AWAY_MS);
  assert.equal(main().room, room);
  assert.equal(main().bubble, '자리 비움');
  st.apply(base({ hook_event_name: 'UserPromptSubmit', prompt: '다음 요청' }), 2000 + AWAY_MS + 1);
  st.apply(pre('Edit', { file_path: '/a/x.js' }), 2000 + AWAY_MS + 2);
  assert.equal(main().room, 'dev', '새 이벤트가 오면 그 방으로');
  st.apply(base({ hook_event_name: 'Stop', last_assistant_message: 'done again' }), 2000 + AWAY_MS + 3);
  assert.equal(main().room, room);
  // 다른 세션 두 개는 서로 다른 방을 받는 경우가 있다 (해시가 한 방으로 몰리지 않는다)
  const rooms = new Set();
  for (let i = 0; i < 30; i++) rooms.add(restRoomFor(`sess-${i}`));
  assert.equal(rooms.size, 3);
});

test('PreCompact: 자리 유지, 기억 정리 중', () => {
  const { st, main } = fresh();
  st.apply(pre('Edit', { file_path: '/a/x.js' }), 1000);
  st.apply(base({ hook_event_name: 'PreCompact', trigger: 'auto', custom_instructions: null }), 1100);
  assert.equal(main().room, 'dev');
  assert.equal(main().activity, 'compact');
});

test('PostCompact: 일하는 중 압축이 끝나면 고민 중으로 (FE-65)', () => {
  const { st, main } = fresh();
  st.apply(pre('Edit', { file_path: '/a/x.js' }), 1000);
  st.apply(base({ hook_event_name: 'PreCompact', trigger: 'auto' }), 1100);
  st.apply(base({ hook_event_name: 'PostCompact', trigger: 'auto', compact_summary: '...' }), 1200);
  assert.equal(main().activity, 'think');
});

test('PreCompact: 쉬는 중 자동 압축은 자리에서 일으키지 않는다, 수동은 보이고 끝나면 다시 휴식 (FE-65)', () => {
  const { st, main, s } = fresh();
  st.apply(pre('Edit', { file_path: '/a/x.js' }), 1000);
  st.apply(base({ hook_event_name: 'Stop' }), 1100);
  st.apply(base({ hook_event_name: 'PreCompact', trigger: 'auto' }), 1200);
  assert.equal(main().activity, 'rest');
  assert.equal(s().status, 'idle');
  st.apply(base({ hook_event_name: 'PreCompact', trigger: 'manual' }), 1300);
  assert.equal(main().activity, 'compact');
  st.apply(base({ hook_event_name: 'PostCompact', trigger: 'manual' }), 1400);
  assert.equal(main().activity, 'rest');
});

test('SessionStart(compact): PostCompact 가 없어도 남은 기억 정리 중을 치운다 (FE-65)', () => {
  const { st, main } = fresh();
  st.apply(pre('Edit', { file_path: '/a/x.js' }), 1000);
  st.apply(base({ hook_event_name: 'PreCompact', trigger: 'auto' }), 1100);
  st.apply(base({ hook_event_name: 'SessionStart', source: 'compact' }), 1200);
  assert.equal(main().activity, 'think');
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

test('데모 층은 이름에 (데모) 가 붙고 removeDemo 로 한 번에 제거된다', () => {
  const st = createState({ statFile: () => ({ mtimeMs: Number.MAX_SAFE_INTEGER }) });
  st.apply({ session_id: 'd1', cwd: '/demo/nccx', hook_event_name: 'SessionStart', source: 'startup' }, 1000);
  st.apply({ session_id: 'r1', cwd: '/Users/me/nccx', hook_event_name: 'SessionStart', source: 'startup' }, 1001);
  const names = st.snapshot().floors.map((f) => f.name).sort();
  assert.deepEqual(names, ['nccx', 'nccx (데모)']);
  assert.equal(st.removeDemo(), 1);
  assert.deepEqual(st.snapshot().floors.map((f) => f.name), ['nccx']);
});

// ---------- 세션 제목 (BE-17): 분리된 세션은 부모 제목으로 시작했다가 이름이 바뀐다 ----------
test('제목: 훅의 session_title 이 바뀌면 따라가고, 바뀐 것을 로그로 남긴다', () => {
  const st = createState({ me: 't', statFile: () => null, titleOf: () => null });
  const ev = (extra) => st.apply({ session_id: 'fork', cwd: CWD, transcript_path: '/x', ...extra }, 1000);
  ev({ hook_event_name: 'SessionStart', source: 'resume', session_title: '카카오톡 봇 뉴스 요약' }); // 부모 제목을 물려받아 시작
  assert.equal(st.get('fork').title, '카카오톡 봇 뉴스 요약');
  ev({ hook_event_name: 'UserPromptSubmit', prompt: '레포 올려줘', session_title: 'GitHub 비공개 레포 올리기' });
  assert.equal(st.get('fork').title, 'GitHub 비공개 레포 올리기');
  assert.ok(st.snapshot().log.some((e) => e.text === '제목: GitHub 비공개 레포 올리기'), '제목 변경 로그');
  // 같은 훅 제목이 다시 와도 그대로, 프롬프트로 제목을 덮지 않는다
  ev({ hook_event_name: 'UserPromptSubmit', prompt: '다른 얘기', session_title: 'GitHub 비공개 레포 올리기' });
  assert.equal(st.get('fork').title, 'GitHub 비공개 레포 올리기');
});

test('제목: 훅 없이 이름만 바뀌면 sweep 이 transcript 의 custom-title 로 1분 안에 반영한다', () => {
  let mtime = 1, title = '카카오톡 봇 뉴스 요약', reads = 0;
  const st = createState({ me: 't', statFile: () => ({ mtimeMs: mtime }), titleOf: () => { reads++; return title; } });
  const updates = []; st.on('update', (u) => updates.push(u));
  st.apply({ session_id: 'fork', cwd: CWD, transcript_path: '/x', hook_event_name: 'SessionStart', source: 'resume', session_title: '카카오톡 봇 뉴스 요약' }, 1000);
  st.sweep(2000);
  assert.equal(st.get('fork').title, '카카오톡 봇 뉴스 요약');
  // 파일이 안 바뀌었으면 1분이 지나도 다시 읽지 않는다
  const before = reads; st.sweep(2000 + STAT_INTERVAL_MS); assert.equal(reads, before);
  // 이름이 바뀌어 transcript 가 갱신되면 다음 확인 때 반영
  mtime = 2; title = 'GitHub 비공개 레포 올리기';
  st.sweep(2000 + STAT_INTERVAL_MS / 2); // 아직 1분 전
  assert.equal(st.get('fork').title, '카카오톡 봇 뉴스 요약');
  st.sweep(2000 + 2 * STAT_INTERVAL_MS);
  assert.equal(st.get('fork').title, 'GitHub 비공개 레포 올리기');
  assert.ok(updates.some((u) => u.session.title === 'GitHub 비공개 레포 올리기' && u.log && u.log.icon === '🏷️'));
});

test('제목: 훅과 transcript 중 나중에 바뀐 쪽을 따르고, 오래된 값이 다시 와도 되돌아가지 않는다', () => {
  let mtime = 1, title = 'A';
  const st = createState({ me: 't', statFile: () => ({ mtimeMs: mtime }), titleOf: () => title });
  const ev = (extra, t) => st.apply({ session_id: 's', cwd: CWD, transcript_path: '/x', ...extra }, t);
  ev({ hook_event_name: 'SessionStart', source: 'startup', session_title: 'A' }, 1000);
  mtime = 2; title = 'B'; st.sweep(1000 + STAT_INTERVAL_MS);
  assert.equal(st.get('s').title, 'B');
  ev({ hook_event_name: 'UserPromptSubmit', prompt: 'x', session_title: 'A' }, 1000 + STAT_INTERVAL_MS + 1); // 훅이 같은(옛) 값을 보내도
  assert.equal(st.get('s').title, 'B');
  ev({ hook_event_name: 'UserPromptSubmit', prompt: 'y', session_title: 'C' }, 1000 + STAT_INTERVAL_MS + 2); // 훅 값이 새로 바뀌면
  assert.equal(st.get('s').title, 'C');
});

test('defaultTitle: transcript 끝의 마지막 custom-title 을 읽고, 없거나 깨지면 null', () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { defaultTitle } = require('../lib/state');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-title-'));
  const f = path.join(dir, 't.jsonl');
  const line = (o) => JSON.stringify(o) + '\n';
  fs.writeFileSync(f, line({ type: 'custom-title', customTitle: '카카오톡 봇 뉴스 요약' }) + line({ type: 'user', message: 'x' }).repeat(3) + line({ type: 'custom-title', customTitle: 'GitHub 비공개 레포 올리기' }) + line({ type: 'assistant' }));
  assert.equal(defaultTitle(f), 'GitHub 비공개 레포 올리기');
  fs.writeFileSync(f, line({ type: 'user' }) + '{"type":"custom-title","customTitle":"깨진');
  assert.equal(defaultTitle(f), null);
  assert.equal(defaultTitle(path.join(dir, 'none.jsonl')), null);
  // 64KB 보다 긴 파일도 끝부분만 읽어 찾는다
  fs.writeFileSync(f, line({ type: 'custom-title', customTitle: '옛 제목' }) + 'x'.repeat(200 * 1024) + '\n' + line({ type: 'custom-title', customTitle: '새 제목' }));
  assert.equal(defaultTitle(f), '새 제목');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- 첫 요청 복원 (BE-19) ----------
test('첫 요청: 재생으로 최근 프롬프트가 들어가도 transcript 의 첫 사용자 메시지로 한 번 복원한다', () => {
  let reads = 0;
  const st = createState({ me: 't', statFile: () => ({ mtimeMs: 5 }), titleOf: () => null, firstPromptOf: () => { reads++; return '이거 만들고 싶어'; } });
  st.apply({ session_id: 'old', cwd: CWD, transcript_path: '/x', hook_event_name: 'UserPromptSubmit', prompt: '이 세션 리모트 컨트롤 킬거야' }, 1000);
  assert.equal(st.get('old').firstPrompt, '이 세션 리모트 컨트롤 킬거야');
  st.sweep(2000);
  assert.equal(st.get('old').firstPrompt, '이거 만들고 싶어');
  assert.equal(st.get('old').lastPrompt, '이 세션 리모트 컨트롤 킬거야', '최근 요청은 그대로');
  st.sweep(2000 + 2 * STAT_INTERVAL_MS);
  assert.equal(reads, 1, '세션당 한 번만 읽는다');
});

test('defaultFirstPrompt: isMeta·명령 메시지는 건너뛰고, 이미지로 잘린 첫 줄에서도 텍스트를 꺼낸다', () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { defaultFirstPrompt } = require('../lib/state');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-first-'));
  const f = path.join(dir, 't.jsonl');
  const line = (o) => JSON.stringify(o) + '\n';
  fs.writeFileSync(f, line({ type: 'queue-operation' }) + line({ type: 'user', isMeta: true, message: { content: 'meta' } }) + line({ type: 'user', message: { content: '<command-name>/model</command-name>' } }) + line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } }) + line({ type: 'user', message: { content: '진짜 첫 요청' } }));
  assert.equal(defaultFirstPrompt(f), '진짜 첫 요청');
  // 1MB 를 넘는 첫 줄(이미지): JSON 이 잘려도 앞의 text 를 꺼낸다
  fs.writeFileSync(f, line({ type: 'user', message: { content: [{ type: 'text', text: '사진 보고 만들어 줘' }, { type: 'image', data: 'A'.repeat(1500 * 1024) }] } }));
  assert.equal(defaultFirstPrompt(f), '사진 보고 만들어 줘');
  assert.equal(defaultFirstPrompt(path.join(dir, 'none.jsonl')), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- Esc 중단 (FE-64) ----------
test('Esc 중단: Stop 훅이 없어도 마지막 훅 뒤 transcript 의 중단 기록을 보고 10초 안에 쉬러 간다, 서브에이전트는 퇴근', () => {
  const { ACTIVE_STAT_MS } = require('../lib/state');
  let mtime = 900, interrupted = null, reads = 0;
  const st = createState({ me: 't', statFile: () => ({ mtimeMs: mtime }), titleOf: () => null, firstPromptOf: () => null, interruptedOf: () => { reads++; return interrupted; } });
  st.apply(base({ hook_event_name: 'UserPromptSubmit', prompt: '고쳐줘', transcript_path: '/t/s1.jsonl' }), 1000);
  st.apply(pre('Agent', { description: 'Find', subagent_type: 'Explore' }), 1100);
  st.apply(base({ hook_event_name: 'SubagentStart', agent_id: 'agent-1', agent_type: 'Explore', transcript_path: '/t/s1.jsonl' }), 1200);
  st.apply(pre('Bash', { command: 'ls' }), 1300);
  st.apply(base({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Bash', transcript_path: '/t/s1.jsonl' }), 1400);
  st.sweep(1500);
  assert.equal(reads, 0, 'transcript 가 훅 뒤로 바뀌지 않았으면 읽지 않는다');
  mtime = 5000; // 사용자가 Esc → transcript 에 중단 기록
  interrupted = 4900;
  st.sweep(1500 + ACTIVE_STAT_MS / 2);
  assert.equal(st.get('s1').status, 'waiting', '10초 간격 전에는 그대로');
  st.sweep(1500 + ACTIVE_STAT_MS);
  assert.equal(st.get('s1').status, 'idle');
  assert.ok(REST_ROOMS.includes(st.get('s1').agents.main.room));
  assert.equal(st.get('s1').agents.main.bubble, '중단됨');
  assert.equal(st.get('s1').agents['agent-1'].room, 'elevator');
  st.sweep(1500 + ACTIVE_STAT_MS + SUBAGENT_LEAVE_MS);
  assert.equal(st.get('s1').agents['agent-1'], undefined);
});

test('Esc 중단: 중단 기록이 마지막 훅보다 앞이거나(이미 다시 일함) 쉬는 세션이면 건드리지 않는다', () => {
  let mtime = 900;
  const st = createState({ me: 't', statFile: () => ({ mtimeMs: mtime }), titleOf: () => null, firstPromptOf: () => null, interruptedOf: () => 800 });
  st.apply(base({ hook_event_name: 'UserPromptSubmit', prompt: '고쳐줘', transcript_path: '/t/s1.jsonl' }), 1000);
  mtime = 2000;
  st.sweep(1500);
  assert.equal(st.get('s1').status, 'thinking');
  const st2 = createState({ me: 't', statFile: () => ({ mtimeMs: 9000 }), titleOf: () => null, firstPromptOf: () => null, interruptedOf: () => { throw new Error('쉬는 세션은 읽지 않는다'); } });
  st2.apply(base({ hook_event_name: 'Stop', transcript_path: '/t/s1.jsonl' }), 3000);
  st2.sweep(3000 + STAT_INTERVAL_MS);
  assert.equal(st2.get('s1').status, 'idle');
});

test('defaultInterrupted: 마지막 대화 줄이 중단 기록이면 그 시각, 그 뒤에 대화가 이어졌으면 null', () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { defaultInterrupted } = require('../lib/state');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-int-'));
  const f = path.join(dir, 't.jsonl');
  const line = (o) => JSON.stringify(o) + '\n';
  const asst = line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] }, timestamp: '2026-10-29T00:00:00.000Z' });
  const stop = (t) => line({ type: 'user', message: { content: [{ type: 'text', text: t }] }, timestamp: '2026-10-29T00:00:05.000Z' });
  fs.writeFileSync(f, asst + stop('[Request interrupted by user]') + line({ type: 'file-history-snapshot' }));
  assert.equal(defaultInterrupted(f), Date.parse('2026-10-29T00:00:05.000Z'));
  fs.writeFileSync(f, asst + stop('[Request interrupted by user for tool use]'));
  assert.equal(defaultInterrupted(f), Date.parse('2026-10-29T00:00:05.000Z'));
  fs.writeFileSync(f, stop('[Request interrupted by user]') + line({ type: 'user', message: { content: '다시 해줘' }, timestamp: '2026-10-29T00:01:00.000Z' }));
  assert.equal(defaultInterrupted(f), null);
  fs.writeFileSync(f, asst + stop('중단 얘기: [Request interrupted by user] 를 보면'));
  assert.equal(defaultInterrupted(f), null, '문장 중간은 중단이 아니다');
  assert.equal(defaultInterrupted(path.join(dir, 'none.jsonl')), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('백그라운드 훅: 같은 도구의 Post 가 Pre 보다 먼저 적용되면 늦은 Pre 는 캐릭터를 움직이지 않고 기록만 남긴다 (FE-66)', () => {
  const { st, main } = fresh();
  st.apply(base({ hook_event_name: 'SessionStart', source: 'startup' }), 1000);
  st.apply(base({ hook_event_name: 'UserPromptSubmit', prompt: 'hi' }), 1100);
  st.apply(post('Read', { tool_use_id: 'r1' }), 1200);
  st.apply(pre('Read', { file_path: '/a/b.js' }, { tool_use_id: 'r1' }), 1201);
  assert.equal(main().activity, 'think', '끝난 도구로 되돌아가지 않는다');
  assert.ok(st.snapshot().log.some((e) => /b\.js/.test(e.text)), '기록은 남는다');
  st.apply(pre('Read', { file_path: '/a/c.js' }, { tool_use_id: 'r2' }), 1300);
  assert.equal(main().activity, 'read', '다음 도구는 그대로');
});

test('답 기다린 시각·이유 (FE-73): 처음 기다리기 시작한 시각을 두고, 답을 받거나 쉬면 비운다', () => {
  const { st, s, updates } = fresh();
  st.apply(base({ hook_event_name: 'SessionStart', source: 'startup' }), 1000);
  assert.equal(s().waitingSince, null);
  st.apply(pre('Bash', { command: 'rm -rf build' }), 2000);
  assert.equal(s().waitingSince, null, '도구 실행만으로는 기다리는 게 아니다');
  st.apply(base({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Bash 허락' }), 3000);
  assert.equal(s().waitingSince, 3000);
  assert.equal(s().waitingFor, 'permission');
  assert.equal(updates.at(-1).session.waitingSince, 3000, 'update 로 화면에 보낸다');
  st.apply(base({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: '또' }), 4000);
  assert.equal(s().waitingSince, 3000, '계속 기다리는 동안은 처음 시각');
  st.apply(post('Bash'), 5000);
  assert.equal(s().status, 'thinking');
  assert.equal(s().waitingSince, null);
  assert.equal(s().waitingFor, null);
  st.apply(pre('AskUserQuestion', { questions: [{ question: '어느 쪽?' }] }), 6000);
  assert.equal(s().waitingSince, 6000);
  assert.equal(s().waitingFor, 'question');
  st.apply(base({ hook_event_name: 'Stop' }), 7000);
  assert.equal(s().waitingSince, null);
  st.apply(base({ hook_event_name: 'Notification', notification_type: 'elicitation_dialog', message: 'MCP 입력' }), 8000);
  assert.equal(s().waitingFor, 'question');
  st.sweep(8000 + AWAY_MS);
  assert.equal(s().status, 'away');
  assert.equal(s().waitingSince, null, '자리 비움으로 바뀌어도 비운다 → 다음에 기다리면 새 시각');
});
