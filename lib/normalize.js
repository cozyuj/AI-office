'use strict';
// 훅 payload → 작고 안전한 이벤트 객체. 큰 필드는 앞부분만 남긴다.
// 도구 호출은 "어느 방에서 무슨 말풍선" 으로 해석한다 (docs/ARCHITECTURE.md 4절).

const path = require('path');

const ROOMS = {
  library: '자료실', dev: '개발실', research: '정보검색실', server: '서버실',
  meeting: '회의실', lounge: '휴게실', mydesk: '내 자리', lobby: '로비', elevator: '엘리베이터',
};

const ACTIVITY_ICON = {
  think: '💭', read: '📖', search: '🔍', run: '🖥️', edit: '✏️', web: '🌐', delegate: '🤝',
  plan: '📋', ask: '🙋', rest: '☕', wait: '🙂', compact: '🧹', leave: '👋', arrive: '🛗', work: '🔧',
};

function cut(s, n) {
  if (s == null) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function base(p) {
  if (!p || typeof p !== 'string') return '';
  return path.basename(p);
}

function host(u) {
  try { return new URL(u).host; } catch { return cut(u, 30); }
}

/** 도구 이름/입력 → { room, activity, icon, bubble, target } */
function describeTool(name = '', input = {}, mcpServer) {
  input = input || {};
  const d = (room, activity, bubble, target = '', detail = '') => ({ room, activity, icon: ACTIVITY_ICON[activity], bubble, target, detail: cut(detail, 200) });

  if (name.startsWith('mcp__')) {
    const [, server = mcpServer?.name || 'mcp', ...rest] = name.split('__');
    return d('research', 'web', `${server}: ${cut(rest.join('__'), 24)} 조회 중`, server, name);
  }
  switch (name) {
    case 'Read':
    case 'NotebookRead': {
      const fp = input.file_path || input.notebook_path;
      const f = base(fp);
      return d('library', 'read', `${f || '파일'} 읽는 중`, f, fp);
    }
    case 'Grep': return d('library', 'search', `"${cut(input.pattern, 24)}" 검색 중`, cut(input.pattern, 40), `${input.pattern || ''}${input.path ? '  in ' + input.path : ''}`);
    case 'Glob': return d('library', 'search', `${cut(input.pattern, 24)} 찾는 중`, cut(input.pattern, 40), `${input.pattern || ''}${input.path ? '  in ' + input.path : ''}`);
    case 'LS': return d('library', 'search', `${base(input.path) || '폴더'} 둘러보는 중`, base(input.path), input.path);
    case 'Bash': {
      const desc = cut(input.description, 36);
      const cmd = cut(input.command, 30);
      return d('server', 'run', desc || `${cmd || '명령'} 실행 중`, cmd, input.command);
    }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit': {
      const fp = input.file_path || input.notebook_path;
      const f = base(fp);
      return d('dev', 'edit', `${f || '파일'} 수정 중`, f, fp);
    }
    case 'Write': {
      const f = base(input.file_path);
      return d('dev', 'edit', `${f || '파일'} 작성 중`, f, input.file_path);
    }
    case 'WebSearch': return d('research', 'web', `"${cut(input.query, 24)}" 검색 중`, cut(input.query, 40), input.query);
    case 'WebFetch': return d('research', 'web', `${host(input.url)} 읽는 중`, host(input.url), input.url);
    case 'Agent':
    case 'Task': {
      const what = cut(input.description || input.subagent_type || '작업', 24);
      return d('meeting', 'delegate', `${what} 맡기는 중`, what, `${input.subagent_type ? '[' + input.subagent_type + '] ' : ''}${input.prompt || input.description || ''}`);
    }
    case 'TodoWrite': return d('meeting', 'plan', '할 일 정리 중');
    case 'Skill': return d('meeting', 'plan', `${cut(input.skill, 20) || '스킬'} 실행 중`, cut(input.skill, 20), input.skill);
    case 'EnterPlanMode':
    case 'ExitPlanMode': return d('meeting', 'plan', '계획 세우는 중');
    case 'AskUserQuestion': return d('mydesk', 'ask', '질문 있어요');
    default: return d('dev', 'work', `${cut(name, 20) || '도구'} 사용 중`, cut(name, 20));
  }
}

/** 훅 payload 를 내부 이벤트로 정규화 */
function normalize(p) {
  const ev = {
    event: p.hook_event_name || '',
    sessionId: p.session_id || 'unknown',
    cwd: p.cwd || '',
    sessionTitle: p.session_title ? cut(p.session_title, 60) : '',
    transcriptPath: typeof p.transcript_path === 'string' ? p.transcript_path : '',
    agentId: p.agent_id || null,
    agentType: p.agent_type || '',
    toolName: p.tool_name || '',
    toolUseId: p.tool_use_id || '',
    toolInput: null,
    mcpServer: p.mcp_server || null,
    source: p.source || '',
    reason: p.reason || '',
    notificationType: p.notification_type || '',
    message: cut(p.message, 120),
    prompt: cut(p.prompt, 120),
    lastMessage: cut(p.last_assistant_message, 120),
    error: cut(p.error, 120),
    durationMs: typeof p.duration_ms === 'number' ? p.duration_ms : null,
    trigger: p.trigger || '',
    taskSubject: cut(p.task_subject, 80),
  };
  if (p.tool_input && typeof p.tool_input === 'object') {
    const ti = {};
    for (const k of ['file_path', 'notebook_path', 'pattern', 'path', 'command', 'description', 'query', 'url', 'subagent_type', 'skill', 'prompt']) {
      if (p.tool_input[k] != null) ti[k] = cut(p.tool_input[k], 200);
    }
    ev.toolInput = ti;
  }
  return ev;
}

module.exports = { normalize, describeTool, cut, ROOMS, ACTIVITY_ICON };
