'use strict';
// 훅 명령에 넣을 Node 경로 (BE-18). Node 를 업그레이드해도 깨지지 않는 경로를 고른다.
//   1) ~/.ai-office/node(.exe): 데스크톱 앱이 복사해 둔 Node. 앱과 CLI 가 같은 훅 명령을 쓰게 된다
//   2) Homebrew 의 버전 폴더(/opt/homebrew/Cellar/node/26.12.0/bin/node) → 버전 없는 opt 링크(/opt/homebrew/opt/node/bin/node)
//   3) 그 밖에는 실행 중인 Node 그대로
const fs = require('fs');
const path = require('path');
const os = require('os');

const CELLAR = /^(.*)[\\/]Cellar[\\/](node(?:@\d+)?)[\\/][^\\/]+[\\/]bin[\\/]node$/;

function isFile(p, fsImpl) { try { return fsImpl.statSync(p).isFile(); } catch { return false; } }

/** Homebrew Cellar 의 버전 폴더 경로인가 (업그레이드·cleanup 때 사라진다) */
function isVersionedNodePath(p) { return CELLAR.test(String(p || '')); }

function stableNodePath({
  execPath = process.execPath,
  home = process.env.AI_OFFICE_HOME || path.join(os.homedir(), '.ai-office'),
  platform = process.platform,
  fsImpl = fs,
} = {}) {
  const appNode = path.join(home, platform === 'win32' ? 'node.exe' : 'node');
  if (isFile(appNode, fsImpl)) return appNode;
  const m = CELLAR.exec(execPath);
  if (m) {
    const opt = path.join(m[1], 'opt', m[2], 'bin', 'node');
    if (isFile(opt, fsImpl)) return opt;
  }
  return execPath;
}

module.exports = { stableNodePath, isVersionedNodePath };
