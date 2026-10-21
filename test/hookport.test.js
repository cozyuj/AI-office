'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { portFromCommand, hookPortFromSettings } = require('../lib/hookport');
const { buildCommand, isOurs } = require('../scripts/install-hooks.js');

test('portFromCommand: --port 가 있으면 그 값, 없으면 4777', () => {
  assert.equal(portFromCommand('"/n/node" "/a/hooks/emit.js" --port 4800'), 4800);
  assert.equal(portFromCommand('"/n/node" "/a/hooks/emit.js"'), 4777);
  assert.equal(portFromCommand(''), 4777);
});

test('hookPortFromSettings: 우리 훅만 보고, 없으면 null', () => {
  assert.equal(hookPortFromSettings({ hooks: { Stop: [{ hooks: [{ type: 'command', command: '/x/tool --hook' }] }] } }), null);
  assert.equal(hookPortFromSettings({ hooks: { Stop: [{ hooks: [{ type: 'command', command: '"/n/node" "/a/hooks/emit.js" --port 4800' }] }] } }), 4800);
  assert.equal(hookPortFromSettings({ hooks: { Stop: [{ hooks: [{ type: 'command', command: '/old/hooks/emit.sh' }] }] } }), 4777);
  assert.equal(hookPortFromSettings(null), null);
});

test('buildCommand: 포트가 기본이면 생략, 아니면 --port 를 붙이고 isOurs 가 인식', () => {
  assert.equal(buildCommand('/n/node', '/a/hooks/emit.js', 4777), '"/n/node" "/a/hooks/emit.js"');
  const c = buildCommand('/n/node', '/a/hooks/emit.js', 4800);
  assert.equal(c, '"/n/node" "/a/hooks/emit.js" --port 4800');
  assert.ok(isOurs({ type: 'command', command: c }));
});
