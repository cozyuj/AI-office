'use strict';
// 오늘의 근무 기록 (FE-72): 세션별 하루 집계(일한 시간·답 기다린 시간·도구·고친 파일·요청·서브에이전트).
// 저널은 2시간만 남기므로 원본 이벤트 대신 집계만 AI_OFFICE_HOME/stats/YYYY-MM-DD.json (로컬 날짜) 에 따로 쌓는다.
// - 시간: 세션 상태(thinking·working·waiting)가 머문 시간을 상태가 바뀔 때·1초 sweep 때 더한다. 자정을 넘기면 날짜별로 나눈다
// - 개수: 훅 payload 로 센다. 저널 재생은 이미 센 이벤트라 부르지 않는다 (server.js) → 재시작해도 이중 집계 없음
// - 데모 세션(/demo/)은 세지 않는다. 디스크 쓰기는 FLUSH_MS 마다 묶어서, KEEP_DAYS 가 지난 파일은 지운다

const fs = require('fs');
const path = require('path');
const os = require('os');

const FLUSH_MS = 5000;
const KEEP_DAYS = 30;
const MAX_FILES = 1000; // 세션 하루치 고친 파일 목록 상한 (넘으면 개수만 늘린다)
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const TIME_KEY = { thinking: 'thinkMs', working: 'workMs', waiting: 'waitMs' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, '0');
/** 로컬 날짜 'YYYY-MM-DD' */
function dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
/** t 다음 로컬 자정 (ms) */
function nextMidnight(t) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); }
/** 'YYYY-MM-DD' 에서 n 일 뒤 (음수면 앞) */
function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n, 12).getTime()); }
const isDemo = (s) => String(s.floorId || '').startsWith('/demo/') || String(s.cwd || '').startsWith('/demo/');

function emptyRec() { return { title: '', project: '', cwd: '', branch: '', thinkMs: 0, workMs: 0, waitMs: 0, prompts: 0, tools: {}, files: [], fileCount: 0, subagents: 0, firstAt: 0, lastAt: 0 }; }

function createDailyStats({ dir, enabled = true, keepDays = KEEP_DAYS, flushMs = FLUSH_MS, clock = Date.now } = {}) {
  dir = dir || path.join(process.env.AI_OFFICE_HOME || path.join(os.homedir(), '.ai-office'), 'stats');
  const days = new Map();   // 'YYYY-MM-DD' → { date, sessions: { id → rec } }
  const dirty = new Set();
  const tracks = new Map(); // sessionId → { status, since }  지금 상태가 언제부터인지
  let timer = null;

  const fileOf = (key) => path.join(dir, `${key}.json`);
  function load(key) {
    if (!enabled) return null;
    try {
      const j = JSON.parse(fs.readFileSync(fileOf(key), 'utf8'));
      if (j && j.sessions && typeof j.sessions === 'object') return { date: key, sessions: j.sessions };
    } catch {}
    return null;
  }
  function dayOf(key) {
    let d = days.get(key);
    if (!d) { d = load(key) || { date: key, sessions: {} }; days.set(key, d); }
    return d;
  }
  /** 그날의 세션 기록 (세션 정보는 늘 최신으로) */
  function recOf(s, t) {
    const key = dayKey(t);
    const d = dayOf(key);
    const r = d.sessions[s.id] || (d.sessions[s.id] = emptyRec());
    if (s.title) r.title = s.title;
    r.project = s.floorId || r.project;
    r.cwd = s.cwd || r.cwd;
    r.branch = s.branch || r.branch;
    if (!r.firstAt || t < r.firstAt) r.firstAt = t;
    if (t > r.lastAt) r.lastAt = t;
    dirty.add(key);
    return r;
  }

  /** [from, to) 동안 status 였던 시간을 날짜별로 나눠 더한다 */
  function accrue(s, status, from, to) {
    const k = TIME_KEY[status];
    if (!k) return;
    while (from < to) {
      const end = Math.min(to, nextMidnight(from));
      recOf(s, end - 1)[k] += end - from;
      from = end;
    }
  }

  /** 세션의 지금 상태를 반영: 직전 상태로 머문 시간을 더하고 새 상태부터 다시 잰다 */
  function observe(s, now = clock()) {
    if (!s || !s.id || isDemo(s)) return;
    const tr = tracks.get(s.id);
    if (!tr) { tracks.set(s.id, { status: s.status, since: now }); return; }
    if (now > tr.since) { accrue(s, tr.status, tr.since, now); tr.since = now; }
    tr.status = s.status;
  }

  /** 훅 하나를 센다. s 는 그 훅을 적용한 뒤의 세션 */
  function hook(payload, s, now = clock()) {
    if (!payload || !s || isDemo(s)) return;
    observe(s, now);
    const ev = payload.hook_event_name;
    if (ev === 'UserPromptSubmit') {
      if (!/^<[a-z][\w-]*>/i.test(payload.prompt || '')) recOf(s, now).prompts++; // 시스템 알림은 요청이 아니다
    } else if (ev === 'PreToolUse' && payload.tool_name) {
      const r = recOf(s, now);
      r.tools[payload.tool_name] = (r.tools[payload.tool_name] || 0) + 1;
      const ti = payload.tool_input || {};
      const fp = ti.file_path || ti.notebook_path;
      if (EDIT_TOOLS.has(payload.tool_name) && typeof fp === 'string' && fp && !r.files.includes(fp)) {
        if (r.files.length < MAX_FILES) r.files.push(fp);
        r.fileCount++;
      }
    } else if (ev === 'SubagentStart' && payload.agent_id) {
      recOf(s, now).subagents++;
    }
  }

  /** 모든 세션의 시간을 지금까지로 맞춘다 (서버 sweep 마다). 사라진 세션은 잊는다 */
  function sync(sessions, now = clock()) {
    const seen = new Set();
    for (const s of sessions) { seen.add(s.id); observe(s, now); }
    for (const id of tracks.keys()) if (!seen.has(id)) tracks.delete(id);
  }

  function flush(now = clock()) {
    if (enabled && dirty.size) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        for (const key of dirty) {
          const d = days.get(key);
          if (!d) continue;
          const tmp = fileOf(key) + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify({ date: key, sessions: d.sessions }) + '\n');
          fs.renameSync(tmp, fileOf(key));
        }
      } catch (e) { console.error('[stats] write failed:', e.message); }
    }
    dirty.clear();
    // 메모리에는 오늘·어제만 (자정 직후에도 어제 몫이 더해질 수 있다). 저장을 끈 경우엔 보관 기간만큼
    const today = dayKey(now), keepFrom = addDays(today, enabled ? -1 : -(keepDays - 1));
    for (const key of days.keys()) if (key < keepFrom) days.delete(key);
  }

  /** keepDays 보다 오래된 파일 삭제. 지운 개수 반환 */
  function prune(now = clock()) {
    if (!enabled) return 0;
    const oldest = addDays(dayKey(now), -(keepDays - 1));
    let n = 0;
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return 0; }
    for (const name of names) {
      const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
      if (m && m[1] < oldest) { try { fs.unlinkSync(path.join(dir, name)); n++; } catch {} }
    }
    return n;
  }

  /** 저장된 날짜 목록 (오름차순) */
  function dates() {
    const set = new Set([...days.keys()].filter((k) => Object.keys(days.get(k).sessions).length));
    if (enabled) { try { for (const name of fs.readdirSync(dir)) { const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name); if (m) set.add(m[1]); } } catch {} }
    return [...set].sort();
  }

  /** 하루 요약: 합계 + 프로젝트(층)별 + 세션별. 일한 시간 = thinking + working */
  function summary(key = dayKey(clock())) {
    if (!DATE_RE.test(key)) return null;
    const d = days.get(key) || load(key) || { date: key, sessions: {} };
    const blank = () => ({ workMs: 0, thinkMs: 0, waitMs: 0, prompts: 0, tools: 0, toolsByName: {}, files: 0, subagents: 0 });
    const add = (acc, r) => {
      acc.thinkMs += r.thinkMs || 0; acc.workMs += (r.thinkMs || 0) + (r.workMs || 0); acc.waitMs += r.waitMs || 0;
      acc.prompts += r.prompts || 0; acc.subagents += r.subagents || 0; acc.files += r.fileCount || 0;
      for (const [k, v] of Object.entries(r.tools || {})) { acc.tools += v; acc.toolsByName[k] = (acc.toolsByName[k] || 0) + v; }
    };
    const totals = { ...blank(), sessions: 0 };
    const projects = new Map();
    const sessions = [];
    for (const [id, r] of Object.entries(d.sessions)) {
      const one = blank();
      add(one, r);
      sessions.push({ id, title: r.title || '', project: r.project || '', branch: r.branch || '', firstAt: r.firstAt, lastAt: r.lastAt, ...one });
      add(totals, r); totals.sessions++;
      const pid = r.project || '(unknown)';
      const p = projects.get(pid) || { id: pid, name: path.basename(pid) || pid, ...blank(), sessions: 0 };
      add(p, r); p.sessions++;
      projects.set(pid, p);
    }
    const byWork = (a, b) => (b.workMs + b.waitMs) - (a.workMs + a.waitMs) || b.tools - a.tools;
    return { date: key, today: key === dayKey(clock()), totals, projects: [...projects.values()].sort(byWork), sessions: sessions.sort(byWork), dates: dates() };
  }

  function start() {
    prune();
    if (timer) return;
    let lastPrune = dayKey(clock());
    timer = setInterval(() => {
      const now = clock();
      flush(now);
      if (dayKey(now) !== lastPrune) { lastPrune = dayKey(now); prune(now); }
    }, flushMs);
    timer.unref && timer.unref();
  }
  function close() { if (timer) { clearInterval(timer); timer = null; } flush(); }

  return { observe, hook, sync, flush, prune, summary, dates, start, close, dir, get enabled() { return enabled; } };
}

module.exports = { createDailyStats, dayKey, nextMidnight, addDays, KEEP_DAYS, FLUSH_MS };
