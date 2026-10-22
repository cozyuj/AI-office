// 훅 Node 경로 (BE-18): 업그레이드에 깨지지 않는 경로를 고른다
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { stableNodePath, isVersionedNodePath } = require('../lib/nodepath');

const fakeFs = (files) => ({ statSync: (p) => { if (files.includes(p)) return { isFile: () => true }; throw new Error('ENOENT'); } });

test('앱이 복사한 ~/.ai-office/node 가 있으면 그것을 쓴다 (Windows 는 node.exe)', () => {
  const home = '/Users/me/.ai-office';
  assert.equal(stableNodePath({ execPath: '/opt/homebrew/Cellar/node/26.12.0/bin/node', home, platform: 'darwin', fsImpl: fakeFs([path.join(home, 'node')]) }), path.join(home, 'node'));
  assert.equal(stableNodePath({ execPath: 'C:\\Program Files\\nodejs\\node.exe', home, platform: 'win32', fsImpl: fakeFs([path.join(home, 'node.exe')]) }), path.join(home, 'node.exe'));
});

test('Homebrew 버전 폴더는 버전 없는 opt 링크로 바꾼다 (node@22 포함), 링크가 없으면 그대로', () => {
  const none = '/nonexistent';
  assert.equal(stableNodePath({ execPath: '/opt/homebrew/Cellar/node/26.12.0/bin/node', home: none, fsImpl: fakeFs(['/opt/homebrew/opt/node/bin/node']) }), '/opt/homebrew/opt/node/bin/node');
  assert.equal(stableNodePath({ execPath: '/usr/local/Cellar/node@22/22.12.0/bin/node', home: none, fsImpl: fakeFs(['/usr/local/opt/node@22/bin/node']) }), '/usr/local/opt/node@22/bin/node');
  assert.equal(stableNodePath({ execPath: '/opt/homebrew/Cellar/node/26.12.0/bin/node', home: none, fsImpl: fakeFs([]) }), '/opt/homebrew/Cellar/node/26.12.0/bin/node');
  assert.equal(stableNodePath({ execPath: '/Users/me/.nvm/versions/node/v22.12.0/bin/node', home: none, fsImpl: fakeFs([]) }), '/Users/me/.nvm/versions/node/v22.12.0/bin/node');
});

test('isVersionedNodePath: Cellar 버전 폴더만 참', () => {
  assert.ok(isVersionedNodePath('/opt/homebrew/Cellar/node/25.3.0/bin/node'));
  assert.ok(isVersionedNodePath('/usr/local/Cellar/node@22/22.12.0/bin/node'));
  assert.ok(!isVersionedNodePath('/opt/homebrew/opt/node/bin/node'));
  assert.ok(!isVersionedNodePath('/Users/me/.ai-office/node'));
  assert.ok(!isVersionedNodePath(''));
});
