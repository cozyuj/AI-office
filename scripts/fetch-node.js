#!/usr/bin/env node
'use strict';
// Tauri 사이드카용 Node 바이너리를 내려받는다 (산출물은 커밋하지 않음). 맥·리눅스·Windows 공통.
//   node scripts/fetch-node.js                 # 현재 머신
//   NODE_VERSION=22.12.0 node scripts/fetch-node.js
//   node scripts/fetch-node.js --target x86_64-pc-windows-msvc   # 교차 (CI)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const VER = process.env.NODE_VERSION || '22.12.0';
const TARGETS = { // rust triple → nodejs.org 배포 이름
  'aarch64-apple-darwin': { plat: 'darwin-arm64', ext: 'tar.gz', bin: 'bin/node', out: 'node' },
  'x86_64-apple-darwin': { plat: 'darwin-x64', ext: 'tar.gz', bin: 'bin/node', out: 'node' },
  'x86_64-unknown-linux-gnu': { plat: 'linux-x64', ext: 'tar.gz', bin: 'bin/node', out: 'node' },
  'aarch64-unknown-linux-gnu': { plat: 'linux-arm64', ext: 'tar.gz', bin: 'bin/node', out: 'node' },
  'x86_64-pc-windows-msvc': { plat: 'win-x64', ext: 'zip', bin: 'node.exe', out: 'node.exe' },
  'aarch64-pc-windows-msvc': { plat: 'win-arm64', ext: 'zip', bin: 'node.exe', out: 'node.exe' },
};
function hostTriple() {
  const arch = { arm64: 'aarch64', x64: 'x86_64' }[process.arch];
  const osn = { darwin: 'apple-darwin', linux: 'unknown-linux-gnu', win32: 'pc-windows-msvc' }[process.platform];
  return `${arch}-${osn}`;
}
const i = process.argv.indexOf('--target');
const triple = i >= 0 ? process.argv[i + 1] : hostTriple();
const t = TARGETS[triple];
if (!t) { console.error(`지원하지 않는 대상: ${triple}`); process.exit(1); }

const OUT = path.join(__dirname, '..', 'app', 'src-tauri', 'binaries');
const dest = path.join(OUT, triple.endsWith('windows-msvc') ? `node-${triple}.exe` : `node-${triple}`);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  if (!fs.existsSync(dest)) {
    const name = `node-v${VER}-${t.plat}`;
    const url = `https://nodejs.org/dist/v${VER}/${name}.${t.ext}`;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-node-'));
    const archive = path.join(tmp, `${name}.${t.ext}`);
    console.log(`downloading node v${VER} (${t.plat})…`);
    const res = await fetch(url);
    if (!res.ok) { console.error(`다운로드 실패 ${res.status} ${url}`); process.exit(1); }
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
    // tar 는 맥·리눅스·Windows 10+ 모두 있고 zip 도 풀 수 있다
    execFileSync('tar', ['-xf', archive, '-C', tmp], { stdio: 'inherit' });
    fs.copyFileSync(path.join(tmp, name, t.bin), dest);
    if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const st = fs.statSync(dest);
  console.log(`${dest} ${st.size} bytes`);
  if (triple === hostTriple()) { try { console.log(execFileSync(dest, ['--version']).toString().trim()); } catch {} }
})().catch((e) => { console.error(e.message); process.exit(1); });
