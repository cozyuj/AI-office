// 기억 용량 (FE-70): 서버가 세션에 붙이는 context { tokens, limit, pct } 를 게이지로 보여 줄 때 쓰는 공통 규칙.
// 80% 이상 주황(곧 자동 압축), 90% 이상 빨강.
export const CTX_WARN = 80;
export const CTX_DANGER = 90;

/** 'ok' | 'warn' | 'danger' */
export function ctxLevel(pct) { return pct >= CTX_DANGER ? 'danger' : pct >= CTX_WARN ? 'warn' : 'ok'; }

/** 156000 → '156K', 1000000 → '1M', 1250000 → '1.3M' */
export function fmtTokens(n) {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

export const ctxLabel = (c) => `🧠 ${c.pct}%`;
export const ctxDetail = (c) => `(${fmtTokens(c.tokens)} / ${fmtTokens(c.limit)} 토큰)`;
export const ctxTip = (c) => `기억 용량 ${c.pct}% ${ctxDetail(c)}`;

/** 캔버스 이름표 옆 게이지 색 */
export const CTX_COLOR = { ok: '#3b6fd6', warn: '#e08a2c', danger: '#e05252' };
