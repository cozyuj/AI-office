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

test('치운 세션(DELETE)은 저널에 남아 서버를 다시 켜도 되살아나지 않는다 (FE-49)', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-srv-'));
  const port = await freePort();
  let srv = startServer(port, home);
  try {
    assert.ok(await waitPort(port, true), '서버가 안 뜸');
    await post(port, '/hook', { session_id: 'keep', cwd: home, transcript_path: '', hook_event_name: 'SessionStart', source: 'startup' });
    await post(port, '/hook', { session_id: 'gone', cwd: home, transcript_path: '', hook_event_name: 'SessionStart', source: 'startup' });
    await sleep(200);
    await new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port, path: '/api/sessions/gone', method: 'DELETE' }, (res) => { res.resume(); res.on('end', resolve); }); req.on('error', reject); req.end(); });
    await sleep(1500); // 저널 flush
    srv.kill('SIGTERM');
    assert.ok(await waitPort(port, false), '서버가 안 내려감');
    srv = startServer(port, home);
    assert.ok(await waitPort(port, true), '다시 안 뜸');
    await sleep(300);
    const st = await get(port, '/api/state');
    const live = st.sessions.filter((s) => s.status !== 'ended').map((s) => s.id);
    assert.deepEqual(live, ['keep'], '치운 세션은 재생 뒤에도 없어야 한다');
  } finally { srv.kill('SIGKILL'); fs.rmSync(home, { recursive: true, force: true }); }
});

// 다른 웹사이트가 로컬 서버를 읽거나 가짜 이벤트를 넣지 못하게 막는다 (BE-21)
function raw(port, method, p, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    req.on('error', reject); req.end(body);
  });
}

test('Host·Origin 검사: 다른 사이트와 DNS 리바인딩은 403, 훅·앱·자기 화면은 통과 (BE-21)', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-srv-'));
  const port = await freePort();
  const srv = startServer(port, home);
  try {
    assert.ok(await waitPort(port, true), '서버가 안 뜸');
    // Origin 없는 요청(훅·CLI·curl)은 그대로, CORS 헤더도 붙이지 않는다
    let r = await raw(port, 'GET', '/api/state');
    assert.equal(r.status, 200);
    assert.equal(r.headers['access-control-allow-origin'], undefined, '* 를 돌려주면 안 된다');
    // 다른 사이트에서 읽기 · 쓰기
    r = await raw(port, 'GET', '/api/state', { Origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    assert.ok(!r.body.includes('sessions'), '거절 응답에 상태가 섞이면 안 된다');
    r = await raw(port, 'POST', '/hook', { Origin: 'https://evil.example', 'content-type': 'text/plain' }, JSON.stringify({ session_id: 'fake', cwd: home, hook_event_name: 'SessionStart' }));
    assert.equal(r.status, 403);
    r = await raw(port, 'GET', '/events', { Origin: 'http://127.0.0.1:1' });
    assert.equal(r.status, 403, '다른 포트의 로컬 페이지도 남이다');
    r = await raw(port, 'GET', '/api/state', { Origin: 'null' });
    assert.equal(r.status, 403, 'file:// 이나 샌드박스 iframe');
    // DNS 리바인딩: Origin 이 같아 보여도 Host 이름이 루프백이 아니면 거절
    r = await raw(port, 'GET', '/api/state', { Host: `evil.example:${port}` });
    assert.equal(r.status, 403);
    // 허용: 자기 화면, 데스크톱 앱 창 (macOS · Windows)
    for (const origin of [`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
      r = await raw(port, 'GET', '/api/state', { Origin: origin });
      assert.equal(r.status, 200, origin);
      assert.equal(r.headers['access-control-allow-origin'], origin, origin);
    }
    r = await raw(port, 'GET', '/', { Host: `localhost:${port}` });
    assert.equal(r.status, 200, 'localhost 로 열어도 화면이 떠야 한다');
    // 거절된 가짜 이벤트는 세션을 만들지 않았다
    const st = await get(port, '/api/state');
    assert.ok(!st.sessions.some((s) => s.id === 'fake'));
  } finally { srv.kill('SIGKILL'); fs.rmSync(home, { recursive: true, force: true }); }
});
