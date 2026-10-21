'use strict';
// 서버 HTTP API 테스트: 실제 server.js 를 빈 포트(AI_OFFICE_PORT=0)·저널 없이 띄우고 요청한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

/** server.js 를 자식 프로세스로 띄우고 실제 포트를 돌려준다 (spawnSync 는 이벤트 루프를 막으므로 비동기) */
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--no-journal'], { env: { ...process.env, AI_OFFICE_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`server did not start: ${out}`)); }, 8000);
    child.stdout.on('data', (c) => {
      out += c;
      const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
      if (m && Number(m[1]) > 0) { clearTimeout(timer); resolve({ child, port: Number(m[1]), stop: () => new Promise((r) => { child.on('exit', r); child.kill(); }) }); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${out}`)); });
  });
}

function request(port, method, p, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: body ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b, json: () => JSON.parse(b || 'null') }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

/** SSE /events 에 붙어 지정한 이벤트 이름을 모은다 */
function listenSse(port, want) {
  return new Promise((resolve, reject) => {
    const got = [];
    const req = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(chunk), data = /^data: (.+)$/m.exec(chunk);
          if (ev && data) got.push({ event: ev[1], data: JSON.parse(data[1]) });
        }
        if (got.some((e) => e.event === 'snapshot')) resolve({ got, close: () => req.destroy(), waitFor: (name) => new Promise((r) => { const t = setInterval(() => { const e = got.find((x) => x.event === name); if (e) { clearInterval(t); r(e); } }, 20); }) });
      });
    });
    req.on('error', reject);
  });
}

const hook = (extra) => ({ session_id: 's-api', cwd: '/Users/me/proj/apitest', transcript_path: '/x', ...extra });

test('DELETE /api/sessions/:id — 세션을 제거하고 SSE remove 를 보낸다, 없는 세션은 404', async () => {
  const srv = await startServer();
  try {
    const sse = await listenSse(srv.port, 'remove');
    // 세션 하나 만든 뒤 Stop 으로 idle 상태로
    let r = await request(srv.port, 'POST', '/hook', hook({ hook_event_name: 'SessionStart', source: 'startup' }));
    assert.equal(r.status, 204);
    r = await request(srv.port, 'POST', '/hook', hook({ hook_event_name: 'Stop', last_assistant_message: 'done' }));
    assert.equal(r.status, 204);
    await sse.waitFor('update');
    let st = (await request(srv.port, 'GET', '/api/state')).json();
    assert.equal(st.sessions.length, 1);
    assert.equal(st.sessions[0].id, 's-api');
    assert.equal(st.sessions[0].status, 'idle');
    assert.equal(st.floors.length, 1);

    r = await request(srv.port, 'DELETE', '/api/sessions/s-api');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json(), { removed: true, sessionId: 's-api' });
    const removed = await sse.waitFor('remove');
    assert.equal(removed.data.sessionId, 's-api');
    assert.equal(removed.data.floorRemoved, true, '마지막 세션이면 층도 사라진다');
    st = (await request(srv.port, 'GET', '/api/state')).json();
    assert.equal(st.sessions.length, 0);
    assert.equal(st.floors.length, 0);

    r = await request(srv.port, 'DELETE', '/api/sessions/s-api');
    assert.equal(r.status, 404);
    assert.equal(r.json().removed, false);
    // 다른 메서드는 그대로 405 / 정적 404
    r = await request(srv.port, 'POST', '/api/sessions/s-api');
    assert.equal(r.status, 405);
    sse.close();
  } finally { await srv.stop(); }
});

test('DELETE /api/sessions/:id — 같은 층에 다른 세션이 남으면 층은 유지된다 (URL 인코딩된 id 포함)', async () => {
  const srv = await startServer();
  try {
    const sse = await listenSse(srv.port, 'remove');
    await request(srv.port, 'POST', '/hook', hook({ hook_event_name: 'SessionStart', source: 'startup' }));
    await request(srv.port, 'POST', '/hook', hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'a b/c' }));
    await sse.waitFor('update');
    const r = await request(srv.port, 'DELETE', `/api/sessions/${encodeURIComponent('a b/c')}`);
    assert.equal(r.status, 200);
    const removed = await sse.waitFor('remove');
    assert.equal(removed.data.sessionId, 'a b/c');
    assert.equal(removed.data.floorRemoved, false);
    const st = (await request(srv.port, 'GET', '/api/state')).json();
    assert.deepEqual(st.sessions.map((s) => s.id), ['s-api']);
    assert.equal(st.floors.length, 1);
    sse.close();
  } finally { await srv.stop(); }
});
