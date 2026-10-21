'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { next } = require('../scripts/bump-version.js');

test('next: patch/minor/major/명시 버전', () => {
  assert.equal(next('0.2.0', 'patch'), '0.2.1');
  assert.equal(next('0.2.9', 'minor'), '0.3.0');
  assert.equal(next('0.2.9', 'major'), '1.0.0');
  assert.equal(next('0.2.9', '2.0.5'), '2.0.5');
  assert.throws(() => next('0.2.0', 'nope'));
});

test('bump: 네 파일이 같은 버전으로 바뀐다 (임시 복사본)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-bump-'));
  fs.mkdirSync(path.join(root, 'app', 'src-tauri'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x', version: '0.2.0' }));
  fs.writeFileSync(path.join(root, 'app', 'package.json'), JSON.stringify({ name: 'y', version: '0.2.0' }));
  fs.writeFileSync(path.join(root, 'app', 'src-tauri', 'tauri.conf.json'), JSON.stringify({ productName: 'z', version: '0.2.0' }));
  fs.writeFileSync(path.join(root, 'app', 'src-tauri', 'Cargo.toml'), '[package]\nname = "z"\nversion = "0.2.0"\nedition = "2021"\n\n[dependencies]\nserde = { version = "1" }\n');
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'bump-version.js'), 'minor'], { env: { ...process.env, BUMP_ROOT: root }, encoding: 'utf8' });
  assert.match(out, /0\.2\.0 → 0\.3\.0/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version, '0.3.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'app', 'package.json'))).version, '0.3.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'app', 'src-tauri', 'tauri.conf.json'))).version, '0.3.0');
  const cargo = fs.readFileSync(path.join(root, 'app', 'src-tauri', 'Cargo.toml'), 'utf8');
  assert.match(cargo, /^version = "0\.3\.0"/m);
  assert.match(cargo, /serde = \{ version = "1" \}/, '의존성 버전은 건드리지 않음');
});
