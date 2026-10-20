#!/usr/bin/env node
'use strict';
// 가짜 Claude Code 세션들이 훅 이벤트를 보내는 데모. 실제 세션 없이 UI 를 개발·시연할 때 쓴다.
//   npm start  (다른 터미널)  →  npm run demo
// 옵션: AI_OFFICE_PORT, DEMO_SPEED (1 = 기본, 2 = 두 배 빠르게), DEMO_ONCE=1 (한 바퀴만)

const http = require('http');

const PORT = Number(process.env.AI_OFFICE_PORT || 4777);
const SPEED = Number(process.env.DEMO_SPEED || 1);
const ONCE = process.env.DEMO_ONCE === '1';

const HOME = process.env.HOME || '/Users/me';
const PROJECTS = {
  nccx: `${HOME}/dev/workspace_bitbucket/nccx`,
  'mcp-hub': `${HOME}/dev/mcp-hub`,
};

function post(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/hook', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', (e) => { console.error(`POST 실패 (${e.message}) — 서버가 떠 있나요? npm start`); resolve(); });
    req.end(body);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms / SPEED));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** 세션 하나의 이벤트 생성기 */
function makeSession(id, project, title) {
  const cwd = PROJECTS[project];
  const base = (extra) => ({ session_id: id, cwd, transcript_path: `${HOME}/.claude/projects/x/${id}.jsonl`, permission_mode: 'default', ...extra });
  const send = (extra) => post(base(extra));
  let toolSeq = 0;
  const tool = async (tool_name, tool_input, ms, agent) => {
    const tool_use_id = `toolu_${id}_${++toolSeq}`;
    const agentFields = agent ? { agent_id: agent.id, agent_type: agent.type } : {};
    await send({ hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id, ...agentFields });
    await sleep(ms);
    await send({ hook_event_name: 'PostToolUse', tool_name, tool_input, tool_use_id, tool_response: 'ok', duration_ms: ms, ...agentFields });
    await sleep(rand(600, 1800)); // 고민 중
  };
  return { id, project, cwd, title, send, tool };
}

const FILES = ['server.js', 'lib/state.js', 'public/js/scene/render.js', 'TicketActionController.java', 'README.md', 'package.json', 'docs/ARCHITECTURE.md'];
const CMDS = [['npm test', '테스트 실행'], ['git status', 'Git 상태 확인'], ['./gradlew build', '빌드'], ['curl -s localhost:8080/health', '헬스 체크']];
const SEARCHES = ['resolveStatus', 'TODO', 'hook_event_name', 'AuditLog'];

/** 시나리오: 읽기→검색→실행→수정→서브에이전트→질문→휴식 */
async function scenario(s) {
  await s.send({ hook_event_name: 'UserPromptSubmit', prompt: s.title });
  await sleep(rand(800, 1500));

  await s.tool('Read', { file_path: `${s.cwd}/${pick(FILES)}` }, rand(1500, 3500));
  await s.tool('Grep', { pattern: pick(SEARCHES), path: s.cwd }, rand(1000, 2500));
  const [command, description] = pick(CMDS);
  await s.tool('Bash', { command, description }, rand(2000, 5000));
  await s.tool('Edit', { file_path: `${s.cwd}/${pick(FILES)}`, old_string: 'a', new_string: 'b' }, rand(2000, 4000));

  if (Math.random() < 0.7) {
    const desc = pick(['컨트롤러 diff 확인', '훅 문서 조사', '테스트 커버리지 점검', 'API 엔드포인트 찾기']);
    const agent = { id: `agent-${s.id}-${Date.now().toString(36)}`, type: pick(['Explore', 'general-purpose', 'Plan']) };
    await s.send({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: desc, prompt: '...', subagent_type: agent.type }, tool_use_id: 'toolu_agent' });
    await sleep(800);
    await s.send({ hook_event_name: 'SubagentStart', agent_id: agent.id, agent_type: agent.type });
    await sleep(1500);
    await s.tool('Glob', { pattern: '**/*Controller.java' }, rand(1500, 3000), agent);
    await s.tool('Read', { file_path: `${s.cwd}/${pick(FILES)}` }, rand(2000, 4000), agent);
    if (Math.random() < 0.5) await s.tool('WebFetch', { url: 'https://code.claude.com/docs/en/hooks' }, rand(2000, 4000), agent);
    await s.send({ hook_event_name: 'SubagentStop', agent_id: agent.id, agent_type: agent.type, last_assistant_message: `${desc} 결과: 3곳 확인했습니다.` });
    await sleep(1000);
    await s.send({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { description: desc }, tool_use_id: 'toolu_agent', tool_response: 'done' });
    await sleep(rand(800, 1500));
  }

  if (Math.random() < 0.4) {
    await s.tool('WebSearch', { query: pick(['tauri vs electron', 'node sse keepalive', 'canvas isometric tile']) }, rand(2000, 4000));
  }

  if (Math.random() < 0.35) {
    await s.send({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_use_id: 'x', error: 'Exit code 1\nError: Cannot find module' });
    await sleep(rand(1500, 2500));
    await s.tool('Edit', { file_path: `${s.cwd}/${pick(FILES)}` }, rand(1500, 3000));
  }

  if (Math.random() < 0.5) {
    await s.send({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [] }, tool_use_id: 'q' });
    await sleep(rand(4000, 7000));
    await s.send({ hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_input: {}, tool_use_id: 'q', tool_response: 'answered' });
    await sleep(1000);
  } else if (Math.random() < 0.5) {
    await s.send({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash', title: 'Permission needed' });
    await sleep(rand(3000, 6000));
  }

  await s.tool('Write', { file_path: `${s.cwd}/${pick(FILES)}`, content: '...' }, rand(1500, 3000));
  await s.send({ hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: pick(['수정 완료했습니다. 테스트 15건 통과.', '요청하신 티켓 문서를 작성했습니다.', '컨트롤러 리팩터링을 마쳤습니다.']) });
  await sleep(rand(5000, 12000));
}

async function runSession(s, startDelay) {
  await sleep(startDelay);
  await s.send({ hook_event_name: 'SessionStart', source: 'startup' });
  await sleep(rand(1000, 2500));
  do { await scenario(s); } while (!ONCE);
  await s.send({ hook_event_name: 'SessionEnd', reason: 'other' });
}

const SESSIONS = [
  makeSession('c1948d9b', 'nccx', 'NCCX-TC Jira 티켓 문서 이관'),
  makeSession('ef13b3cc', 'nccx', 'TicketLabelWrite AGENT 적용'),
  makeSession('9f0a1c22', 'nccx', 'resolveStatus 제거 리팩터링'),
  makeSession('a77e2d10', 'mcp-hub', 'MCP 서버 헬스체크 추가'),
];

console.log(`demo → http://127.0.0.1:${PORT}  (세션 ${SESSIONS.length}개, 프로젝트 ${Object.keys(PROJECTS).length}개, speed x${SPEED}${ONCE ? ', once' : ''})`);
Promise.all(SESSIONS.map((s, i) => runSession(s, i * 2500))).then(() => console.log('demo 종료'));
