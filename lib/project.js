'use strict';
// cwd → 프로젝트(git 저장소) 정보. git 을 실행하지 않고 .git 을 위로 찾는다.
//   { root, name, branch, worktree }  root 가 없으면 null
const fs = require('fs');
const path = require('path');

const cache = new Map();

function readHead(gitDir) {
  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const m = /^ref: refs\/heads\/(.+)$/.exec(head);
    return m ? m[1] : head.slice(0, 8);
  } catch { return ''; }
}

function resolveProject(cwd) {
  if (!cwd) return null;
  if (cache.has(cwd)) return cache.get(cwd);
  let dir = path.resolve(cwd);
  let result = null;
  for (let i = 0; i < 40; i++) {
    const dotGit = path.join(dir, '.git');
    let st = null;
    try { st = fs.statSync(dotGit); } catch {}
    if (st) {
      if (st.isDirectory()) {
        result = { root: dir, name: path.basename(dir), branch: readHead(dotGit), worktree: false };
      } else {
        // worktree: ".git" 파일 → "gitdir: /repo/.git/worktrees/<name>"
        let gitdir = '';
        try { gitdir = (/gitdir:\s*(.+)/.exec(fs.readFileSync(dotGit, 'utf8')) || [])[1] || ''; } catch {}
        gitdir = gitdir ? path.resolve(dir, gitdir.trim()) : '';
        const m = /^(.*)[\\/]\.git[\\/]worktrees[\\/][^\\/]+$/.exec(gitdir);
        const mainRoot = m ? m[1] : dir;
        result = { root: mainRoot, name: path.basename(mainRoot), branch: readHead(gitdir || dotGit), worktree: !!m, worktreeDir: dir };
      }
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cache.set(cwd, result);
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return result;
}

module.exports = { resolveProject, _cache: cache };
