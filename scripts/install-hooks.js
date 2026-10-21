#!/usr/bin/env node
'use strict';
// ~/.claude/settings.json 에 ai-office 훅 항목을 병합한다. --remove 로 제거.
// 이미 같은 command 가 있으면 건너뛰므로 여러 번 실행해도 안전하다.

const fs = require('fs');
const path = require('path');
const os = require('os');

const EVENTS = [
  'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact',
];

const SETTINGS = process.env.CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
const argAppDir = (() => { const i = process.argv.indexOf('--app-dir'); return i >= 0 ? process.argv[i + 1] : null; })();
const APP_DIR = path.resolve(argAppDir || path.join(__dirname, '..'));
const remove = process.argv.includes('--remove');

// Windows/macOS/Linux 공통: "<node 절대경로>" "<app>/hooks/emit.js"  (공백·역슬래시 경로 대비 따옴표)
const q = (s) => `"${s}"`;
const COMMAND = buildCommand(process.execPath, path.join(APP_DIR, 'hooks', 'emit.js'));
function buildCommand(nodePath, emitPath) { return `${q(nodePath)} ${q(emitPath)}`; }

function isOurs(h) {
  return h && h.type === 'command' && typeof h.command === 'string' && /hooks[\\/]emit\.(js|sh)"?\s*$/.test(h.command);
}

if (require.main !== module) { module.exports = { buildCommand, isOurs }; return; }

let settings = {};
if (fs.existsSync(SETTINGS)) {
  settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  const backup = `${SETTINGS}.bak.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(SETTINGS, backup);
  console.log(`backup → ${backup}`);
}
settings.hooks = settings.hooks || {};

let added = 0, removed = 0, skipped = 0;
for (const ev of EVENTS) {
  const groups = Array.isArray(settings.hooks[ev]) ? settings.hooks[ev] : [];
  const has = groups.some((g) => (g.hooks || []).some(isOurs));
  if (remove) {
    const kept = groups
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length > 0);
    if (kept.length !== groups.length || has) removed++;
    if (kept.length) settings.hooks[ev] = kept; else delete settings.hooks[ev];
  } else if (has) {
    // 이미 있지만 명령이 다르면(emit.sh → emit.js, 경로 변경) 교체
    let replaced = false;
    for (const g of groups) for (const h of g.hooks || []) if (isOurs(h) && h.command !== COMMAND) { h.command = COMMAND; replaced = true; }
    if (replaced) added++; else skipped++;
  } else {
    groups.push({ matcher: '', hooks: [{ type: 'command', command: COMMAND }] });
    settings.hooks[ev] = groups;
    added++;
  }
}
if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
console.log(remove
  ? `removed from ${removed} event(s) → ${SETTINGS}`
  : `added ${added}, skipped ${skipped} (already present) → ${SETTINGS}`);
console.log(`hook command: ${COMMAND}`);
module.exports = { buildCommand, isOurs };
if (!remove) console.log('새 Claude Code 세션부터 적용됩니다. 서버: npm start');
