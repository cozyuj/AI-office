#!/usr/bin/env node
'use strict';
// ai-office 서버: Claude Code 훅 이벤트를 받아(POST /hook) 브라우저로 SSE 중계(GET /events).
// 외부 의존성 없음. Node 18+.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createState } = require('./lib/state');

const PORT = Number(process.env.AI_OFFICE_PORT || 4777);
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
};

const state = createState({ me: os.userInfo().username });
const clients = new Set();

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
    state.apply(payload, Date.now());
  } catch (e) {
    console.error('[hook] apply failed:', e && e.message);
  }
}

function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  sse(res, 'snapshot', state.snapshot());
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
  if (req.method === 'GET' && pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': MIME['.json'] });
    return res.end(JSON.stringify(state.snapshot()));
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405).end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ai-office  →  http://127.0.0.1:${PORT}`);
  console.log(`hooks POST →  http://127.0.0.1:${PORT}/hook   (AI_OFFICE_PORT=${PORT})`);
});

// 예약 작업(서브에이전트 퇴근, 세션 제거) 실행 + 오래 조용한 세션 정리
setInterval(() => state.sweep(Date.now()), 1000).unref();
