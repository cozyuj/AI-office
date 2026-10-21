'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync, execFileSync } = require('child_process');
const { buildCommand, isOurs } = require('../scripts/install-hooks.js');

const ROOT = path.join(__dirname, '..');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('emit.js: 서버가 있으면 stdin 을 그대로 POST 한다', async () => {
  const got = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push(JSON.parse(b)); res.writeHead(204).end(); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const t0 = Date.now();
  // spawnSync 는 부모 이벤트 루프를 막아 테스트 서버가 응답할 수 없으므로 비동기로
  const status = await new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'hooks', 'emit.js')], { env: { ...process.env, AI_OFFICE_PORT: String(port) } });
    c.on('exit', resolve);
    c.stdin.end(JSON.stringify({ hook_event_name: 'Stop', session_id: 'x' }));
  });
  srv.close();
  assert.equal(status, 0);
  assert.ok(Date.now() - t0 < 1500);
  assert.deepEqual(got, [{ hook_event_name: 'Stop', session_id: 'x' }]);
});

test('emit.js: --port 인자가 env 보다 우선한다', async () => {
  const got = [];
  const srv = http.createServer((req, res) => { got.push(req.url); res.writeHead(204).end(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const status = await new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'hooks', 'emit.js'), '--port', String(port)], { env: { ...process.env, AI_OFFICE_PORT: '1' } });
    c.on('exit', resolve);
    c.stdin.end('{"hook_event_name":"Stop"}');
  });
  srv.close();
  assert.equal(status, 0);
  assert.deepEqual(got, ['/hook']);
});

test('emit.js: 서버가 없으면 1.5초 안에 exit 0, 빈 입력도 exit 0', () => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'hooks', 'emit.js')], { input: '{"a":1}', env: { ...process.env, AI_OFFICE_PORT: '1' } });
  assert.equal(r.status, 0);
  assert.ok(Date.now() - t0 < 2500, `too slow: ${Date.now() - t0}ms`);
  assert.equal(spawnSync(process.execPath, [path.join(ROOT, 'hooks', 'emit.js')], { input: '' }).status, 0);
});

test('install-hooks: Windows 식 경로도 따옴표로 감싸고, emit.sh/emit.js 모두 우리 훅으로 인식', () => {
  const cmd = buildCommand('C:\\Program Files\\nodejs\\node.exe', 'C:\\Users\\me\\.ai-office\\app\\hooks\\emit.js');
  assert.equal(cmd, '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\me\\.ai-office\\app\\hooks\\emit.js"');
  assert.ok(isOurs({ type: 'command', command: cmd }));
  assert.ok(isOurs({ type: 'command', command: '/Users/me/ai-office/hooks/emit.sh' }));
  assert.ok(!isOurs({ type: 'command', command: '/Users/me/other/hook --hook' }));
});

test('install-hooks: emit.sh 항목이 있으면 emit.js 명령으로 교체, 두 번째는 건너뜀, --remove 로 원복', () => {
  const dir = tmp('ai-office-settings-');
  const settings = path.join(dir, 'settings.json');
  fs.writeFileSync(settings, JSON.stringify({ hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: '/old/ai-office/hooks/emit.sh' }, { type: 'command', command: '/other/tool --hook' }] }] } }));
  const run = (...a) => execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'install-hooks.js'), ...a], { env: { ...process.env, CLAUDE_SETTINGS: settings }, encoding: 'utf8' });
  let out = run('--app-dir', ROOT);
  let h = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks;
  assert.equal(Object.keys(h).length, 11);
  const stop = h.Stop.flatMap((g) => g.hooks).map((x) => x.command);
  assert.ok(stop.some((c) => c.endsWith('emit.js"')) && !stop.some((c) => c.endsWith('emit.sh')), '교체됨');
  assert.ok(stop.includes('/other/tool --hook'), '다른 훅 유지');
  out = run('--app-dir', ROOT);
  assert.match(out, /added 0, skipped 11/);
  run('--remove');
  h = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks;
  assert.deepEqual(h, { Stop: [{ matcher: '', hooks: [{ type: 'command', command: '/other/tool --hook' }] }] });
});

test('CLI: install 이 AI_OFFICE_HOME/app 에 복사하고 doctor 가 동작한다', () => {
  const home = tmp('ai-office-home-');
  const env = { ...process.env, AI_OFFICE_HOME: home, CLAUDE_SETTINGS: path.join(home, 'settings.json') };
  const out = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'ai-office.js'), 'install'], { env, encoding: 'utf8' });
  assert.match(out, /설치 →/);
  for (const f of ['server.js', 'hooks/emit.js', 'lib/state.js', 'public/index.html', 'scripts/install-hooks.js']) assert.ok(fs.existsSync(path.join(home, 'app', f)), f);
  const again = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'ai-office.js'), 'install'], { env, encoding: 'utf8' });
  assert.match(again, /이미 최신/);
  // 소스가 바뀌면(설치본의 지문과 다르면) 버전이 같아도 다시 복사한다
  const marker = path.join(home, 'app', 'public', 'index.html');
  fs.writeFileSync(path.join(home, 'app', '.fingerprint'), 'stale\n');
  fs.writeFileSync(marker, 'OLD');
  const refreshed = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'ai-office.js'), 'install'], { env, encoding: 'utf8' });
  assert.match(refreshed, /갱신/);
  assert.notEqual(fs.readFileSync(marker, 'utf8'), 'OLD');
  execFileSync(process.execPath, [path.join(ROOT, 'bin', 'ai-office.js'), 'install-hooks'], { env, encoding: 'utf8' });
  const h = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8')).hooks;
  assert.ok(h.PreToolUse[0].hooks[0].command.includes(path.join(home, 'app', 'hooks', 'emit.js')));
  const doc = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'ai-office.js'), 'doctor'], { env, encoding: 'utf8' });
  assert.match(doc, /node\s+v/);
  assert.match(doc, /훅 11개 등록/);
});

test('install-hooks --node: 지정한 node 경로로 훅 명령을 만든다', () => {
  const dir = tmp('ai-office-settings-');
  const settings = path.join(dir, 'settings.json');
  fs.writeFileSync(settings, '{}');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'install-hooks.js'), '--app-dir', ROOT, '--node', '/Applications/AI Office.app/Contents/MacOS/node'], { env: { ...process.env, CLAUDE_SETTINGS: settings }, encoding: 'utf8' });
  const h = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks;
  assert.equal(h.Stop[0].hooks[0].command, `"/Applications/AI Office.app/Contents/MacOS/node" "${path.join(ROOT, 'hooks', 'emit.js')}"`);
});
