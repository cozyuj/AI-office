'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveProject, _cache } = require('../lib/project');
const { createState } = require('../lib/state');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-proj-')); }
function makeRepo(root, branch = 'main') {
  fs.mkdirSync(path.join(root, '.git', 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), `ref: refs/heads/${branch}\n`);
}

test('resolveProject: 하위 폴더에서도 저장소 루트·이름·브랜치', () => {
  const base = tmp();
  const repo = path.join(base, 'ai-office');
  makeRepo(repo, 'feature/BE-12');
  fs.mkdirSync(path.join(repo, 'app', 'src-tauri'), { recursive: true });
  const p = resolveProject(path.join(repo, 'app', 'src-tauri'));
  assert.equal(p.root, repo);
  assert.equal(p.name, 'ai-office');
  assert.equal(p.branch, 'feature/BE-12');
  assert.equal(p.worktree, false);
  assert.equal(resolveProject(path.join(base, 'nowhere')), null, 'git 없는 경로는 null');
});

test('resolveProject: worktree 는 본 저장소 루트로 묶이고 worktree 브랜치를 읽는다', () => {
  const base = tmp();
  const main = path.join(base, 'dataworks-ground');
  makeRepo(main, 'main');
  const wtGit = path.join(main, '.git', 'worktrees', 'DW-1790');
  fs.mkdirSync(wtGit, { recursive: true });
  fs.writeFileSync(path.join(wtGit, 'HEAD'), 'ref: refs/heads/feature/DW-1790\n');
  const wt = path.join(base, 'worktrees', 'DW-1790', 'dataworks-ground');
  fs.mkdirSync(wt, { recursive: true });
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${wtGit}\n`);
  const p = resolveProject(path.join(wt, 'src'));
  assert.equal(p.root, main);
  assert.equal(p.name, 'dataworks-ground');
  assert.equal(p.branch, 'feature/DW-1790');
  assert.equal(p.worktree, true);
});

test('state: cwd 가 하위 폴더로 바뀌어도 새 층이 생기지 않고, 같은 저장소의 세션은 같은 층', () => {
  const base = tmp();
  const repo = path.join(base, 'ai-office');
  makeRepo(repo, 'main');
  fs.mkdirSync(path.join(repo, 'app', 'src-tauri'), { recursive: true });
  const st = createState({ statFile: () => ({ mtimeMs: Number.MAX_SAFE_INTEGER }) });
  st.apply({ session_id: 'a', cwd: repo, hook_event_name: 'SessionStart', source: 'startup' }, 1000);
  st.apply({ session_id: 'a', cwd: path.join(repo, 'app', 'src-tauri'), hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cargo build' } }, 1100);
  st.apply({ session_id: 'b', cwd: path.join(repo, 'app'), hook_event_name: 'SessionStart', source: 'startup' }, 1200);
  const floors = st.snapshot().floors;
  assert.equal(floors.length, 1, '층은 저장소 하나');
  assert.equal(floors[0].name, 'ai-office');
  assert.equal(floors[0].sessionIds.length, 2);
  assert.equal(st.get('a').branch, 'main');
  assert.equal(st.get('b').cwd, path.join(repo, 'app'));
});
