#!/usr/bin/env node
'use strict';
// 릴리스 뒤 Homebrew tap(cozyuj/homebrew-tap)의 cask·formula 버전과 sha256 을 갱신한다. CI 에선 .github/workflows/homebrew.yml 이 돌린다.
//   node scripts/update-homebrew.js [--tap ../homebrew-tap] [--version 0.25.0]
// cask: GitHub Release 의 AI.Office_<v>_aarch64.dmg, formula: npm 의 claude-ai-office-<v>.tgz (npm 에 그 버전이 있을 때만)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : def; };
const ROOT = path.join(__dirname, '..');
const TAP = path.resolve(arg('tap', path.join(ROOT, '..', 'homebrew-tap')));
const VERSION = arg('version', require(path.join(ROOT, 'package.json')).version);

async function sha256Of(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return crypto.createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
}
function rewrite(file, version, sha, urlVersionRe) {
  let s = fs.readFileSync(file, 'utf8');
  s = s.replace(/version "[^"]*"/, `version "${version}"`).replace(/sha256 "[0-9a-f]{64}"/, `sha256 "${sha}"`);
  if (urlVersionRe) s = s.replace(urlVersionRe, (m) => m.replace(/\d+\.\d+\.\d+/, version));
  fs.writeFileSync(file, s);
}

(async () => {
  const dmg = `https://github.com/cozyuj/AI-office/releases/download/v${VERSION}/AI.Office_${VERSION}_aarch64.dmg`;
  const caskSha = await sha256Of(dmg);
  rewrite(path.join(TAP, 'Casks', 'ai-office.rb'), VERSION, caskSha);
  console.log(`cask    ${VERSION}  ${caskSha}`);

  const meta = await (await fetch('https://registry.npmjs.org/claude-ai-office')).json();
  const npmV = meta.versions && meta.versions[VERSION] ? VERSION : meta['dist-tags'].latest;
  const tgz = meta.versions[npmV].dist.tarball;
  const formulaSha = await sha256Of(tgz);
  rewrite(path.join(TAP, 'Formula', 'claude-ai-office.rb'), npmV, formulaSha, /claude-ai-office-\d+\.\d+\.\d+\.tgz/);
  console.log(`formula ${npmV}  ${formulaSha}${npmV !== VERSION ? `  (npm 에 ${VERSION} 이 아직 없어 ${npmV} 사용)` : ''}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
