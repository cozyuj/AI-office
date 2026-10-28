#!/usr/bin/env node
'use strict';
// 캐릭터 스프라이트 시트 굽기 (개발용, 산출물 public/assets/characters/*.webp 는 커밋한다).
// Kenney Mini Characters 팩(https://kenney.nl/assets/mini-characters, CC0)을 받아 풀고, 그 폴더를 넘긴다.
//   node scripts/bake-characters/bake.js ~/Downloads/kenney_mini-characters
//   node scripts/bake-characters/bake.js <팩 폴더> --only male-c,female-a --quality 0.9
// 헤드리스 크롬에서 three.js(CDN)로 렌더하므로 크롬과 인터넷 연결이 필요하다. 시트 구성은 public/js/scene/characters.js 의 SHEET.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pack = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!pack) { console.error('사용법: node scripts/bake-characters/bake.js <Kenney Mini Characters 폴더> [--only a,b] [--quality 0.9]'); process.exit(1); }
const GLB = [path.join(pack, 'Models', 'GLB format'), pack].find((d) => fs.existsSync(path.join(d, 'character-male-a.glb')));
if (!GLB) { console.error(`GLB 를 찾지 못했습니다: ${pack}/Models/GLB format/character-*.glb`); process.exit(1); }
const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'characters');
const CHROME = process.env.CHROME || ({
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}[process.platform] || 'google-chrome');

(async () => {
  const { CHARACTERS, SHEET } = await import('../../public/js/scene/characters.js');
  const names = (opt('--only') || CHARACTERS.join(',')).split(',').filter((n) => CHARACTERS.includes(n));
  const quality = opt('--quality', '0.9');
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-bake-'));
  let got = 0, chrome, failed = false;
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        res.end();
        const body = Buffer.concat(chunks).toString();
        if (u.pathname === '/err') { console.error('렌더 실패:', body); failed = true; return finish(); }
        const name = path.basename(u.searchParams.get('name')).replace(/^character-/, '');
        const { data, ext } = JSON.parse(body);
        const buf = Buffer.from(data.split(',')[1], 'base64');
        fs.writeFileSync(path.join(OUT, `${name}.webp`), buf);
        const clip = ext.clipped.length ? `  ⚠ 프레임 밖으로 잘림: ${ext.clipped.join(' ')}` : '';
        console.log(`${name}.webp  ${(buf.length / 1024).toFixed(0)} KB  x ${ext.x0}~${ext.x1} y ${ext.y0}~${ext.y1}${clip}`);
        if (clip) failed = true;
        if (++got === names.length) finish();
      });
      return;
    }
    // GET: 굽기 페이지, GLB, 텍스처
    let f = path.join(__dirname, 'render.html');
    if (u.pathname.startsWith('/glb/Textures/')) f = path.join(GLB, 'Textures', path.basename(u.pathname));
    else if (u.pathname.startsWith('/glb/')) f = path.join(GLB, path.basename(decodeURIComponent(u.pathname)));
    fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.end(b); });
  });
  function finish() {
    srv.close();
    const done = () => { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); process.exit(failed ? 1 : 0); };
    if (chrome && chrome.exitCode === null) { chrome.once('exit', done); chrome.kill(); } else done();
  }
  srv.listen(0, '127.0.0.1', () => {
    const q = new URLSearchParams({ names: names.map((n) => `character-${n}`).join(','), meta: JSON.stringify(SHEET), quality });
    const url = `http://127.0.0.1:${srv.address().port}/?${q}`;
    chrome = spawn(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${profile}`, url], { stdio: 'ignore' });
    chrome.on('error', (e) => { console.error(`크롬을 실행하지 못했습니다 (CHROME 환경변수로 경로 지정): ${e.message}`); failed = true; finish(); });
  });
  setTimeout(() => { console.error('시간 초과'); failed = true; finish(); }, 180000);
})();
