'use strict';
// settings.json 에 등록된 ai-office 훅 명령에서 포트를 읽는다. 훅이 없으면 null, 포트 지정이 없으면 4777.
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_PORT = 4777;

function settingsPath() { return process.env.CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json'); }

/** 훅 명령 문자열에서 포트 추출 (없으면 기본) */
function portFromCommand(cmd) {
  const m = /--port\s+(\d+)/.exec(cmd || '');
  return m ? Number(m[1]) : DEFAULT_PORT;
}

/** settings 객체에서 우리 훅의 포트. 훅이 없으면 null */
function hookPortFromSettings(settings) {
  const h = (settings && settings.hooks) || {};
  for (const groups of Object.values(h)) for (const g of groups || []) for (const x of g.hooks || []) {
    if (/hooks[\\/]emit\.(js|sh)/.test(x.command || '')) return portFromCommand(x.command);
  }
  return null;
}

function readHookPort(file = settingsPath()) {
  try { return hookPortFromSettings(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return null; }
}

module.exports = { DEFAULT_PORT, portFromCommand, hookPortFromSettings, readHookPort, settingsPath };
