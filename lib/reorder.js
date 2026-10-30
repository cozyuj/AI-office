'use strict';
// 백그라운드(async) 훅은 프로세스가 동시에 떠서 도착 순서가 뒤바뀔 수 있다 (FE-66).
// emit.js 가 보낸 프로세스 시작 시각(ts) 순으로 잠깐 모았다가 적용한다. ts 가 없으면(예전 emit.js·데모·치우기) 바로 적용.

const DELAY_MS = 300; // 시작부터 도착까지(Node 시작 + POST) 여유
const MAX_SKEW_MS = 5000; // 이보다 어긋난 시각은 믿지 않는다

/** apply(payload, now) 를 ts 순서로 부르는 대기열 */
function createReorder(apply, { delay = DELAY_MS, clock = Date.now } = {}) {
  const queue = []; // { ts, payload } — ts 오름차순
  let timer = null;

  function run(item, now) { try { apply(item.payload, now); } catch (e) { console.error('[hook] apply failed:', e && e.message); } }

  /** 기다린 시간이 지난 것만 적용 */
  function flush(now = clock()) {
    while (queue.length && queue[0].ts + delay <= now) run(queue.shift(), now);
    schedule(now);
  }

  /** 모두 적용 (종료 직전, ts 없는 이벤트 앞) */
  function drain(now = clock()) {
    while (queue.length) run(queue.shift(), now);
    schedule(now);
  }

  function schedule(now) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;
    timer = setTimeout(() => { timer = null; flush(); }, Math.max(0, queue[0].ts + delay - now));
    timer.unref?.();
  }

  function push(payload, ts, now = clock()) {
    if (!Number.isFinite(ts) || Math.abs(ts - now) > MAX_SKEW_MS) {
      drain(now);
      run({ payload }, now);
      return;
    }
    let i = queue.length;
    while (i > 0 && queue[i - 1].ts > ts) i--;
    queue.splice(i, 0, { ts, payload });
    flush(now);
  }

  return { push, flush, drain, get size() { return queue.length; } };
}

module.exports = { createReorder, DELAY_MS };
