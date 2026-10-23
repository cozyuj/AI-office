#!/usr/bin/env node
'use strict';
// 버전을 네 파일에 동시에 반영한다: package.json, app/package.json, app/src-tauri/tauri.conf.json, app/src-tauri/Cargo.toml
// (+ Cargo.lock 의 이 크레이트 항목. 안 맞으면 CI 의 cargo check --locked 가 실패한다)
//   node scripts/bump-version.js patch|minor|major|1.2.3   (버그 수정 = patch, 기능 = minor, 호환 깨짐 = major)
const fs = require('fs');
const path = require('path');

const ROOT = process.env.BUMP_ROOT || path.join(__dirname, '..');
const FILES = {
  pkg: path.join(ROOT, 'package.json'),
  appPkg: path.join(ROOT, 'app', 'package.json'),
  tauri: path.join(ROOT, 'app', 'src-tauri', 'tauri.conf.json'),
  cargo: path.join(ROOT, 'app', 'src-tauri', 'Cargo.toml'),
  lock: path.join(ROOT, 'app', 'src-tauri', 'Cargo.lock'),
};

function next(current, how) {
  if (/^\d+\.\d+\.\d+$/.test(how)) return how;
  const [a, b, c] = current.split('.').map(Number);
  if (how === 'major') return `${a + 1}.0.0`;
  if (how === 'minor') return `${a}.${b + 1}.0`;
  if (how === 'patch') return `${a}.${b}.${c + 1}`;
  throw new Error(`patch | minor | major | x.y.z 중 하나: ${how}`);
}

function bump(how) {
  const pkg = JSON.parse(fs.readFileSync(FILES.pkg, 'utf8'));
  const to = next(pkg.version, how);
  const changed = [];
  for (const key of ['pkg', 'appPkg']) {
    if (!fs.existsSync(FILES[key])) continue;
    const j = JSON.parse(fs.readFileSync(FILES[key], 'utf8'));
    j.version = to;
    fs.writeFileSync(FILES[key], JSON.stringify(j, null, 2) + '\n');
    changed.push(FILES[key]);
  }
  if (fs.existsSync(FILES.tauri)) {
    const j = JSON.parse(fs.readFileSync(FILES.tauri, 'utf8'));
    j.version = to;
    fs.writeFileSync(FILES.tauri, JSON.stringify(j, null, 2) + '\n');
    changed.push(FILES.tauri);
  }
  if (fs.existsSync(FILES.cargo)) {
    const toml = fs.readFileSync(FILES.cargo, 'utf8');
    fs.writeFileSync(FILES.cargo, toml.replace(/^version = "[^"]+"/m, `version = "${to}"`));
    changed.push(FILES.cargo);
    const name = (/^name = "([^"]+)"/m.exec(toml) || [])[1];
    if (name && fs.existsSync(FILES.lock)) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const lock = fs.readFileSync(FILES.lock, 'utf8');
      const t = lock.replace(new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${esc}"\\r?\\nversion = )"[^"]+"`), `$1"${to}"`);
      if (t !== lock) { fs.writeFileSync(FILES.lock, t); changed.push(FILES.lock); }
    }
  }
  return { from: pkg.version, to, changed };
}

if (require.main === module) {
  const how = process.argv[2];
  if (!how) { console.error('사용법: node scripts/bump-version.js patch|minor|major|x.y.z'); process.exit(1); }
  const r = bump(how);
  console.log(`${r.from} → ${r.to}`);
  for (const f of r.changed) console.log(`  ${path.relative(ROOT, f)}`);
  console.log('커밋 예: git commit -am "chore: v' + r.to + '"');
}
module.exports = { bump, next };
