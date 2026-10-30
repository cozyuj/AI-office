#!/usr/bin/env node
'use strict';
// Claude Code hook → ai-office 서버. 셸·curl 없이 Node 만으로 동작한다 (Windows/macOS/Linux 공통).
// 서버가 꺼져 있어도 1초 안에 조용히 exit 0 → Claude 를 절대 막지 않는다.
// 도구 훅은 백그라운드(async)로 동시에 떠서 도착 순서가 뒤바뀔 수 있어, 프로세스 시작 시각을 함께 보낸다 (FE-66)
const http = require('http');
const STARTED = performance.timeOrigin;

const argPort = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? Number(process.argv[i + 1]) : null; })();
const PORT = argPort || Number(process.env.AI_OFFICE_PORT || 4777);
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const body = Buffer.concat(chunks);
  if (!body.length) process.exit(0);
  const req = http.request(
    { host: '127.0.0.1', port: PORT, path: '/hook', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, 'X-AI-Office-Ts': String(STARTED) }, timeout: 1000 },
    (res) => { res.resume(); res.on('end', () => process.exit(0)); },
  );
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.on('error', () => process.exit(0));
  req.end(body);
});
process.stdin.on('error', () => process.exit(0));
setTimeout(() => process.exit(0), 1500).unref();
