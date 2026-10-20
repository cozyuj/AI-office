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
const COMMAND = path.join(__dirname, '..', 'hooks', 'emit.sh');
const remove = process.argv.includes('--remove');

function isOurs(h) {
  return h && h.type === 'command' && typeof h.command === 'string' && h.command.endsWith(path.join('hooks', 'emit.sh'));
}

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
    skipped++;
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
if (!remove) console.log('새 Claude Code 세션부터 적용됩니다. 서버: npm start');
