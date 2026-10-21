#!/usr/bin/env node
'use strict';
// 메뉴바(트레이)용 단색 템플릿 아이콘 생성: 검정 픽셀 + 알파만 있으면 macOS 가 테마에 맞춰 칠한다.
// 22pt 기준 설계, @1x(22px)·@2x(44px) 두 장을 app/src-tauri/icons/ 에 쓴다. 의존성 없음(PNG 직접 인코딩).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 22×22 캔버스. 건물 본체 + 창문 2×3 + 문 + 옥상 안테나. ('#' 불투명, '.' 투명)
const ART = [
  '......................',
  '..........#...........',
  '..........#...........',
  '....##############....',
  '....##############....',
  '....##..##..##..##....',
  '....##..##..##..##....',
  '....##############....',
  '....##############....',
  '....##..##..##..##....',
  '....##..##..##..##....',
  '....##############....',
  '....##############....',
  '....##..##..##..##....',
  '....##..##..##..##....',
  '....##############....',
  '....##############....',
  '....######....######..'.slice(0, 22),
  '....######....######..'.slice(0, 22),
  '....######....######..'.slice(0, 22),
  '..####################',
  '......................',
];
// 문 폭을 가운데 4px 로 맞추고 바닥선을 본체에 맞춘다
for (const y of [17, 18, 19]) ART[y] = '....#####....#####....';
ART[20] = '...################...';

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, scale) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const on = ART[Math.floor(y / scale)][Math.floor(x / scale)] === '#';
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = 0; raw[o + 1] = 0; raw[o + 2] = 0; raw[o + 3] = on ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const out = path.join(__dirname, '..', 'app', 'src-tauri', 'icons');
fs.writeFileSync(path.join(out, 'tray.png'), png(22, 1));
fs.writeFileSync(path.join(out, 'tray@2x.png'), png(44, 2));
console.log('wrote', path.join(out, 'tray.png'), 'and tray@2x.png');
console.log(ART.join('\n'));
