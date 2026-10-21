'use strict';
// 이벤트 저널: 훅 payload 를 JSONL 로 남기고, 기동 시 최근 것만 다시 흘려보내 상태를 복원한다.
// 기본 경로 ~/.ai-office/events.jsonl (AI_OFFICE_HOME 으로 변경).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { cut } = require('./normalize');

const DEFAULT_MAX_AGE = 2 * 60 * 60 * 1000; // SESSION_TTL 과 동일
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const FLUSH_MS = 1000;

const KEEP = ['session_id', 'cwd', 'hook_event_name', 'tool_name', 'tool_use_id', 'agent_id', 'agent_type', 'source', 'reason',
  'notification_type', 'duration_ms', 'trigger', 'session_title', 'transcript_path'];
const KEEP_CUT = ['message', 'prompt', 'last_assistant_message', 'error', 'task_subject', 'title'];
const INPUT_KEYS = ['file_path', 'notebook_path', 'pattern', 'path', 'command', 'description', 'query', 'url', 'subagent_type', 'skill', 'prompt'];

/** 저장용으로 줄인 payload. normalize() 가 그대로 읽을 수 있는 형태 */
function slim(p) {
  const out = {};
  for (const k of KEEP) if (p[k] !== undefined) out[k] = p[k];
  for (const k of KEEP_CUT) if (p[k] != null) out[k] = cut(p[k], 200);
  if (p.tool_input && typeof p.tool_input === 'object') {
    out.tool_input = {};
    for (const k of INPUT_KEYS) if (p.tool_input[k] != null) out.tool_input[k] = cut(p.tool_input[k], 200);
  }
  if (p.mcp_server && typeof p.mcp_server === 'object') out.mcp_server = { name: p.mcp_server.name };
  return out;
}

function createJournal({ dir, maxAge = DEFAULT_MAX_AGE, maxBytes = DEFAULT_MAX_BYTES, enabled = true } = {}) {
  dir = dir || process.env.AI_OFFICE_HOME || path.join(os.homedir(), '.ai-office');
  const file = path.join(dir, 'events.jsonl');
  let buffer = [];
  let timer = null;

  function flush() {
    if (!buffer.length) return;
    const chunk = buffer.join('');
    buffer = [];
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(file, chunk);
    } catch (e) {
      console.error('[journal] write failed:', e.message);
    }
  }

  function append(t, payload) {
    if (!enabled) return;
    buffer.push(JSON.stringify({ t, p: slim(payload) }) + '\n');
    if (!timer) { timer = setTimeout(() => { timer = null; flush(); }, FLUSH_MS); timer.unref && timer.unref(); }
  }

  function readRecent(now) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const out = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec && typeof rec.t === 'number' && rec.p && now - rec.t <= maxAge) out.push(rec);
    }
    return out;
  }

  /** 최근 이벤트를 apply(payload, t) 로 재생하고, 파일을 최근 것만 남기도록 다시 쓴다. 재생 건수 반환 */
  function replay(apply, now = Date.now()) {
    if (!enabled) return 0;
    const recent = readRecent(now);
    for (const rec of recent) {
      try { apply(rec.p, rec.t); } catch (e) { console.error('[journal] replay failed:', e.message); }
    }
    compact(recent);
    return recent.length;
  }

  function compact(recent) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      let lines = recent.map((r) => JSON.stringify(r) + '\n');
      let size = lines.reduce((n, l) => n + Buffer.byteLength(l), 0);
      while (size > maxBytes && lines.length) size -= Buffer.byteLength(lines.shift());
      fs.writeFileSync(file, lines.join(''));
    } catch (e) {
      console.error('[journal] compact failed:', e.message);
    }
  }

  function close() { if (timer) { clearTimeout(timer); timer = null; } flush(); }

  return { append, replay, flush, close, file, get enabled() { return enabled; } };
}

module.exports = { createJournal, slim };
