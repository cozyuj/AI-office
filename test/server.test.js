// server.js 를 실제 프로세스로 띄워 확인하는 통합 테스트 (FE-42)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function freePort() { return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); }); }
function portOpen(port) { return new Promise((resolve) => { const c = net.connect(port, '127.0.0.1'); c.once('connect', () => { c.destroy(); resolve(true); }); c.once('error', () => resolve(false)); }); }
async function waitPort(port, open, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await portOpen(port)) === open) return true; await sleep(150); } return false; }
function get(port, p) { return new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(JSON.parse(b))); }).on('error', reject); }); }
function post(port, p, body) { return new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => { res.resume(); res.on('end', resolve); }); req.on('error', reject); req.end(JSON.stringify(body)); }); }
function startServer(port, home, extraEnv = {}) {
  const c = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, AI_OFFICE_PORT: String(port), AI_OFFICE_HOME: home, CLAUDE_SETTINGS: path.join(home, 'settings.json'), ...extraEnv }, stdio: 'ignore' });
  return c;
}

test('데모가 꺼져 있으면 /demo/ 훅은 무시하고 저널에도 남기지 않는다', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-srv-'));
  const port = await freePort();
  const srv = startServer(port, home);
  try {
    assert.ok(await waitPort(port, true), '서버가 안 뜸');
    await post(port, '/hook', { session_id: 'demo1', cwd: '/demo/ghost', transcript_path: '/x', hook_event_name: 'SessionStart', source: 'startup' });
    await post(port, '/hook', { session_id: 'real1', cwd: home, transcript_path: '/x', hook_event_name: 'SessionStart', source: 'startup' });
    await sleep(300);
    const st = await get(port, '/api/state');
    assert.deepEqual(st.sessions.map((s) => s.id), ['real1'], '데모 세션은 생기면 안 되고 실제 세션은 생겨야 한다');
    assert.equal(st.demo, false);
    await post(port, '/hook', { session_id: 'real1', cwd: home, transcript_path: '/x', hook_event_name: 'SessionEnd', reason: 'exit' });
    await sleep(1500); // 저널 flush
    const journal = fs.existsSync(path.join(home, 'events.jsonl')) ? fs.readFileSync(path.join(home, 'events.jsonl'), 'utf8') : '';
    assert.ok(journal.includes('real1'), '실제 세션은 저널에 남는다');
    assert.ok(!journal.includes('/demo/'), '데모 이벤트는 저널에 없어야 한다');
  } finally { srv.kill('SIGKILL'); fs.rmSync(home, { recursive: true, force: true }); }
});

test('AI_OFFICE_WATCH_PARENT: 부모 프로세스가 강제 종료되면 서버도 스스로 끝난다', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-srv-'));
  const port = await freePort();
  // 중간 부모: 서버를 자식으로 띄우고 가만히 기다린다 (앱/CLI 역할)
  const parent = spawn(process.execPath, ['-e', `
    const { spawn } = require('child_process');
    spawn(process.execPath, [${JSON.stringify(path.join(ROOT, 'server.js'))}], { env: { ...process.env, AI_OFFICE_PORT: '${port}', AI_OFFICE_HOME: ${JSON.stringify(home)}, CLAUDE_SETTINGS: ${JSON.stringify(path.join(home, 'settings.json'))}, AI_OFFICE_WATCH_PARENT: '1' }, stdio: 'ignore' });
    setInterval(() => {}, 1000);
  `], { stdio: 'ignore' });
  try {
    assert.ok(await waitPort(port, true), '서버가 안 뜸');
    parent.kill('SIGKILL');
    assert.ok(await waitPort(port, false, 8000), '부모가 죽은 뒤 8초 안에 서버가 내려가야 한다');
  } finally { try { parent.kill('SIGKILL'); } catch {} fs.rmSync(home, { recursive: true, force: true }); }
});
