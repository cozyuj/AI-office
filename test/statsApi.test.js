// GET /api/stats (FE-72): 실제 server.js 로 집계·저장·재시작 후 저널 재생 이중 집계 없음·접근 검사
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const { dayKey } = require('../lib/dailyStats');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function freePort() { return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); }); }
function portOpen(port) { return new Promise((resolve) => { const c = net.connect(port, '127.0.0.1'); c.once('connect', () => { c.destroy(); resolve(true); }); c.once('error', () => resolve(false)); }); }
async function waitPort(port, open, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await portOpen(port)) === open) return true; await sleep(150); } return false; }
function get(port, p, headers = {}) { return new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b, json: () => JSON.parse(b) })); }).on('error', reject); }); }
function post(port, p, body) { return new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => { res.resume(); res.on('end', resolve); }); req.on('error', reject); req.end(JSON.stringify(body)); }); }
function startServer(port, home) {
  return spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, AI_OFFICE_PORT: String(port), AI_OFFICE_HOME: home, CLAUDE_SETTINGS: path.join(home, 'settings.json') }, stdio: 'ignore' });
}
function stop(c) { return new Promise((r) => { c.once('exit', r); c.kill('SIGTERM'); }); }

test('GET /api/stats: 오늘 집계를 돌려주고, 재시작해도 저널 재생으로 두 번 세지 않는다', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-stats-srv-'));
  const port = await freePort();
  let srv = startServer(port, home);
  try {
    assert.ok(await waitPort(port, true), '서버가 안 뜸');
    const base = { session_id: 'st1', cwd: home, transcript_path: '/x' };
    await post(port, '/hook', { ...base, hook_event_name: 'SessionStart', source: 'startup' });
    await post(port, '/hook', { ...base, hook_event_name: 'UserPromptSubmit', prompt: '고쳐줘' });
    await post(port, '/hook', { ...base, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_use_id: 'u1', tool_input: { file_path: path.join(home, 'a.js') } });
    await post(port, '/hook', { ...base, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_use_id: 'u1', tool_input: { file_path: path.join(home, 'a.js') } });
    await post(port, '/hook', { ...base, hook_event_name: 'SubagentStart', agent_id: 'ag1', agent_type: 'Explore' });
    await post(port, '/hook', { session_id: 'demo1', cwd: '/demo/x', transcript_path: '/x', hook_event_name: 'UserPromptSubmit', prompt: 'demo' }); // 데모 꺼짐 → 무시
    await sleep(400);
    await post(port, '/hook', { ...base, hook_event_name: 'Stop' });
    await sleep(200);

    let r = await get(port, '/api/stats');
    assert.equal(r.status, 200);
    let sum = r.json();
    assert.equal(sum.date, dayKey(Date.now()));
    assert.equal(sum.today, true);
    assert.equal(sum.totals.sessions, 1);
    assert.equal(sum.totals.prompts, 1);
    assert.deepEqual(sum.totals.toolsByName, { Edit: 1 });
    assert.equal(sum.totals.files, 1);
    assert.equal(sum.totals.subagents, 1);
    assert.ok(sum.totals.workMs >= 300, `일한 시간이 쌓여야 한다: ${sum.totals.workMs}`);
    assert.equal(sum.projects.length, 1);
    const work1 = sum.totals.workMs;

    await stop(srv); // SIGTERM → 저장
    assert.ok(fs.existsSync(path.join(home, 'stats', `${sum.date}.json`)), 'stats/YYYY-MM-DD.json 에 저장');
    srv = startServer(port, home);
    assert.ok(await waitPort(port, true), '다시 안 뜸');
    sum = (await get(port, '/api/stats')).json();
    assert.equal(sum.totals.prompts, 1, '저널 재생은 다시 세지 않는다');
    assert.equal(sum.totals.tools, 1);
    assert.equal(sum.totals.subagents, 1);
    assert.equal(sum.totals.workMs, work1, '쉬는 세션은 시간도 늘지 않는다');

    assert.equal((await get(port, '/api/stats?date=2026-13-xx')).status, 400);
    const empty = (await get(port, '/api/stats?date=2001-01-01')).json();
    assert.equal(empty.totals.sessions, 0);
    assert.equal((await get(port, '/api/stats', { origin: 'https://evil.example' })).status, 403, '다른 사이트 Origin 은 거절');
  } finally { srv.kill('SIGKILL'); fs.rmSync(home, { recursive: true, force: true }); }
});
