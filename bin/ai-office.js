#!/usr/bin/env node
'use strict';
// ai-office CLI — 어느 OS 에서든 `npx github:cozyuj/AI-office` 한 줄로 설치·기동.
//
//   ai-office                 install + install-hooks + start (브라우저 열기)
//   ai-office install         ~/.ai-office/app 에 앱 복사 (npx 캐시와 무관한 안정 경로)
//   ai-office install-hooks   ~/.claude/settings.json 에 훅 등록 (멱등)
//   ai-office uninstall-hooks 훅 제거
//   ai-office start [--port N] [--no-open]
//   ai-office demo            가짜 세션 데모
//   ai-office doctor          환경 점검
//   ai-office compact         저널 즉시 압축

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { readHookPort } = require('../lib/hookport');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..');
const HOME = process.env.AI_OFFICE_HOME || path.join(os.homedir(), '.ai-office');
const APP = path.join(HOME, 'app');
const PKG = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8'));
const FILES = ['package.json', 'server.js', 'README.md', 'lib', 'hooks', 'public', 'scripts'];
const JOURNAL_WARN_MB = 5;

const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--port']);
const positional = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) { if (VALUE_FLAGS.has(args[i])) i++; continue; } positional.push(args[i]); }
const cmd = positional[0] || 'up';
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const PORT = Number(opt('port', process.env.AI_OFFICE_PORT || 4777));

function log(s) { console.log(s); }

// ---------- install ----------
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}
function installedVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version; } catch { return null; }
}
/** 소스 파일 목록 + 크기 + mtime 의 지문. 버전이 같아도 내용이 바뀌면 달라진다 */
function fingerprint(dir) {
  const h = crypto.createHash('sha1');
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const st = fs.statSync(p); h.update(`${path.relative(dir, p)}:${st.size}:${Math.floor(st.mtimeMs)}\n`); }
    }
  };
  for (const f of FILES) { const p = path.join(dir, f); if (fs.existsSync(p)) (fs.statSync(p).isDirectory() ? walk(p) : (() => { const st = fs.statSync(p); h.update(`${f}:${st.size}:${Math.floor(st.mtimeMs)}\n`); })()); }
  return h.digest('hex');
}
const runningFromSource = () => path.resolve(SRC) !== path.resolve(APP) && fs.existsSync(path.join(SRC, '.git'));
function install({ force = false } = {}) {
  if (path.resolve(SRC) === path.resolve(APP)) return APP; // 이미 설치 경로에서 실행 중
  const have = installedVersion();
  const fp = fingerprint(SRC);
  let installedFp = null;
  try { installedFp = fs.readFileSync(path.join(APP, '.fingerprint'), 'utf8').trim(); } catch {}
  if (!force && have && installedFp === fp) {
    log(`app ${PKG.version} 이미 최신 → ${APP}`);
    return APP;
  }
  fs.rmSync(APP, { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });
  for (const f of FILES) {
    const from = path.join(SRC, f);
    if (!fs.existsSync(from)) continue;
    if (fs.statSync(from).isDirectory()) copyDir(from, path.join(APP, f));
    else fs.copyFileSync(from, path.join(APP, f));
  }
  fs.writeFileSync(path.join(APP, '.fingerprint'), fp + '\n');
  log(`app ${PKG.version} ${have ? '갱신' : '설치'} → ${APP}`);
  return APP;
}

function runScript(appDir, script, extra = []) {
  execFileSync(process.execPath, [path.join(appDir, 'scripts', script), ...extra], { stdio: 'inherit' });
}

// ---------- start ----------
function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(true)).once('listening', () => s.close(() => resolve(false)));
    s.listen(port, '127.0.0.1');
  });
}
function openBrowser(url) {
  const p = process.platform;
  try {
    if (p === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    else if (p === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true, windowsHide: true }).unref();
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch { log(`브라우저에서 열어 주세요: ${url}`); }
}
async function start(appDir) {
  const url = `http://127.0.0.1:${PORT}`;
  if (await portInUse(PORT)) {
    log(`포트 ${PORT} 는 이미 사용 중입니다 (ai-office 가 떠 있을 수 있습니다) → ${url}`);
    if (!flag('no-open')) openBrowser(url);
    return;
  }
  const child = spawn(process.execPath, [path.join(appDir, 'server.js')], { stdio: 'inherit', env: { ...process.env, AI_OFFICE_PORT: String(PORT), AI_OFFICE_WATCH_PARENT: '1' } });
  if (!flag('no-open')) setTimeout(() => openBrowser(url), 800);
  const stop = () => { child.kill('SIGINT'); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code || 0));
}

// ---------- doctor ----------
async function doctor() {
  const [major] = process.versions.node.split('.').map(Number);
  log(`node      ${process.version} ${major >= 18 ? '✓' : '✗ 18 이상 필요'}  (${process.execPath})`);
  log(`platform  ${process.platform} ${os.release()}`);
  const settings = process.env.CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
  let hooks = 0, stale = 0;
  try {
    const h = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks || {};
    for (const ev of Object.values(h)) for (const g of ev) for (const x of g.hooks || []) {
      if (/emit\.(js|sh)/.test(x.command || '')) {
        hooks++;
        const m = /"?([^"]*emit\.(?:js|sh))"?(?:\s+--port\s+\d+)?\s*$/.exec(x.command);
        if (m && !fs.existsSync(m[1])) stale++;
        const n = /^"([^"]+)"/.exec(x.command); // 앞의 node 경로(앱이 등록한 내장 node 등)도 있어야 한다
        if (n && n[1] !== 'node' && !fs.existsSync(n[1])) stale++;
      }
    }
    log(`settings  ${settings} ✓  훅 ${hooks}개 등록${stale ? `, ${stale}개는 node 또는 emit.js 파일 없음 → ai-office install-hooks` : ''}`);
  } catch { log(`settings  ${settings} ✗ 읽을 수 없음`); }
  log(`app       ${installedVersion() ? `${installedVersion()} @ ${APP} ✓` : '미설치 (ai-office install)'}`);
  log(`port      ${PORT} ${(await portInUse(PORT)) ? '사용 중 (서버 떠 있음)' : '비어 있음'}`);
  try {
    const j = path.join(HOME, 'events.jsonl'); const st = fs.statSync(j);
    const mb = st.size / 1024 / 1024;
    log(`journal   ${j} ${mb >= 1 ? `${mb.toFixed(1)}MB` : `${(st.size / 1024).toFixed(0)}KB`}${mb >= JOURNAL_WARN_MB ? ` ⚠ ${JOURNAL_WARN_MB}MB 이상 → ai-office compact (서버가 매시간 자동 압축하지만 바로 줄이려면)` : ' ✓'}`);
  } catch { log('journal   없음'); }
  const hp = readHookPort(settings);
  if (hp === null) log('hook port 훅 없음 ✗ → ai-office install-hooks');
  else log(`hook port ${hp} ${hp === PORT ? '✓' : `✗ 서버 포트 ${PORT} 와 다름 → ai-office install-hooks --port ${PORT}`}`);
}

(async () => {
  switch (cmd) {
    case 'up': { const app = install(); runScript(app, 'install-hooks.js', ['--app-dir', app]); await start(runningFromSource() ? SRC : app); break; }
    case 'install': install({ force: flag('force') }); break;
    case 'install-hooks': { const app = installedVersion() ? APP : install(); runScript(app, 'install-hooks.js', ['--app-dir', app, '--port', String(PORT)]); break; }
    case 'uninstall-hooks': runScript(installedVersion() ? APP : SRC, 'install-hooks.js', ['--remove']); break;
    case 'start': await start(runningFromSource() || !installedVersion() ? SRC : APP); break;
    case 'demo': execFileSync(process.execPath, [path.join(runningFromSource() || !installedVersion() ? SRC : APP, 'scripts', 'demo.js')], { stdio: 'inherit', env: { ...process.env, AI_OFFICE_PORT: String(PORT) } }); break;
    case 'doctor': await doctor(); break;
    case 'compact': { // 저널을 지금 압축 (최근 2시간만 남김). 서버도 매시간 스스로 한다
      const { createJournal } = require('../lib/journal');
      const j = createJournal({ dir: HOME });
      const before = j.stats();
      const kept = j.compactNow();
      const after = j.stats();
      log(`journal   ${j.file}\n          ${before.lines}건 ${(before.bytes / 1024).toFixed(0)}KB → ${after.lines}건 ${(after.bytes / 1024).toFixed(0)}KB (최근 2시간 ${kept}건 유지)`);
      break;
    }
    default:
      log(`ai-office ${PKG.version}\n\n  ai-office                 설치 + 훅 등록 + 서버 기동 + 브라우저\n  ai-office install [--force]\n  ai-office install-hooks | uninstall-hooks\n  ai-office start [--port N] [--no-open]\n  ai-office demo\n  ai-office doctor\n  ai-office compact         저널(events.jsonl) 즉시 압축`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
