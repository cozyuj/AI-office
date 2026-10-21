#!/usr/bin/env node
'use strict';
// ai-office 서버: Claude Code 훅 이벤트를 받아(POST /hook) 브라우저로 SSE 중계(GET /events).
// 외부 의존성 없음. Node 18+.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createState } = require('./lib/state');
const { createJournal } = require('./lib/journal');
const { readHookPort } = require('./lib/hookport');
const { spawn } = require('child_process');

let PORT = Number(process.env.AI_OFFICE_PORT || 4777); // 0 이면 빈 포트 (테스트용), listen 후 실제 포트로 바뀐다
const VERSION = require('./package.json').version;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 2 * 1024 * 1024; // 2MB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.csv': 'text/csv; charset=utf-8',
};

const state = createState({ me: os.userInfo().username });
let hookPort = readHookPort(); // settings.json 의 훅 포트 (없으면 null)
setInterval(() => { hookPort = readHookPort(); }, 30 * 1000).unref();
let demoChild = null;
function demoRunning() { return !!(demoChild && demoChild.exitCode === null); }
function startDemo() {
  if (demoRunning()) return true;
  demoChild = spawn(process.execPath, [path.join(__dirname, 'scripts', 'demo.js')], { env: { ...process.env, AI_OFFICE_PORT: String(PORT), DEMO_SPEED: process.env.DEMO_SPEED || '1.5' }, stdio: 'ignore' });
  demoChild.on('exit', () => { demoChild = null; broadcast('demo', { on: false }); });
  broadcast('demo', { on: true });
  return true;
}
function stopDemo() {
  if (demoRunning()) { try { demoChild.kill(); } catch {} }
  demoChild = null;
  const n = state.removeDemo();
  broadcast('demo', { on: false });
  return n;
}
function withPorts(snap) { return { ...snap, serverPort: PORT, hookPort, version: VERSION, demo: demoRunning(), journal: journal.enabled ? journal.stats() : null }; }
const clients = new Set();

// 이벤트 저널: 재시작해도 최근 2시간 상태를 복원한다. --no-journal 로 끌 수 있다.
const journal = createJournal({ enabled: !process.argv.includes('--no-journal') });
if (journal.enabled) {
  const n = journal.replay((payload, t) => state.apply(payload, t), Date.now());
  state.sweep(Date.now());
  console.log(`journal    →  ${journal.file} (${n}건 재생, 세션 ${state.snapshot().sessions.length}개 복원)`);
  journal.startAutoCompact();
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of clients) {
    try { sse(res, event, data); } catch { clients.delete(res); }
  }
}

state.on('update', (data) => broadcast('update', data));
state.on('remove', (data) => broadcast('remove', data));
state.on('floor', (data) => broadcast('floor', data));

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleHook(req, res) {
  let payload;
  try {
    const raw = await readBody(req, MAX_BODY);
    payload = JSON.parse(raw);
  } catch (e) {
    res.writeHead(400).end();
    return;
  }
  // 훅 호출 쪽은 응답을 기다리지 않으므로 먼저 응답하고 처리한다.
  res.writeHead(204).end();
  try {
    const now = Date.now();
    state.apply(payload, now);
    journal.append(now, payload);
  } catch (e) {
    console.error('[hook] apply failed:', e && e.message);
  }
}

function handleEvents(req, res) {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  sse(res, 'snapshot', withPorts(state.snapshot()));
  clients.add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (req.method === 'POST' && pathname === '/hook') return handleHook(req, res);
  if (req.method === 'GET' && pathname === '/events') return handleEvents(req, res);
  if (req.method === 'POST' && pathname === '/api/demo/start') { startDemo(); res.writeHead(200, { 'Content-Type': MIME['.json'], 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify({ demo: true })); }
  if (req.method === 'POST' && pathname === '/api/demo/stop') { const removed = stopDemo(); res.writeHead(200, { 'Content-Type': MIME['.json'], 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify({ demo: false, removed })); }
  // 끝난/자리 비운 세션을 목록에서 치운다 (TTL 을 기다리지 않고). state.remove → SSE 'remove' 로 모든 브라우저에 전파
  const del = /^\/api\/sessions\/([^/]+)$/.exec(pathname);
  if (del && req.method === 'DELETE') {
    const id = decodeURIComponent(del[1]);
    const found = !!state.get(id);
    if (found) state.remove(id);
    res.writeHead(found ? 200 : 404, { 'Content-Type': MIME['.json'], 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ removed: found, sessionId: id }));
  }
  if (req.method === 'GET' && pathname === '/api/state') {
    // 데스크탑 앱(tauri://) 로더가 서버 준비 여부를 묻는다 — 로컬 전용 서버라 전체 허용
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ ...withPorts(state.snapshot()), installDir: __dirname }));
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405).end();
});

server.listen(PORT, '127.0.0.1', () => {
  if (!PORT) PORT = server.address().port;
  console.log(`ai-office v${VERSION}  →  http://127.0.0.1:${PORT}`);
  console.log(`hooks POST →  http://127.0.0.1:${PORT}/hook   (AI_OFFICE_PORT=${PORT})`);
  if (hookPort === null) console.log('⚠ settings.json 에 ai-office 훅이 없습니다 → ai-office install-hooks');
  else if (hookPort !== PORT) console.log(`⚠ 훅은 포트 ${hookPort} 로 보내는데 서버는 ${PORT} 입니다 → ai-office install-hooks --port ${PORT}`);
});

// 예약 작업(서브에이전트 퇴근, 세션 제거) 실행 + 오래 조용한 세션 정리
setInterval(() => state.sweep(Date.now()), 1000).unref();

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (demoRunning()) { try { demoChild.kill(); } catch {} } journal.close(); process.exit(0); });
process.on('exit', () => journal.close());
