'use strict';
// Ca sử dụng LẦN CHẠY của bảng điều khiển: nhận một yêu cầu deploy hay rollback cho một hoặc nhiều dịch vụ ở MỘT môi trường,
// kiểm tra trước ở phía máy chủ (không tin phía trình duyệt), rồi cho từng mục chạy độc lập. Mục này hỏng không làm hỏng mục kia.
// Việc thật vẫn do đúng lệnh điều khiển làm (khóa theo dịch vụ, tự bật lại bản cũ, ghi sổ nằm ở đó); ở đây chỉ theo dõi tiến trình.
// Sổ các lần chạy sống trong bộ nhớ của bảng điều khiển; lịch sử lâu dài là sổ deploy của từng môi trường.
const run = require('../domain/run');
const { OUTCOME } = require('../domain/outcome');

const KEEP = 30;
const LOG_KEEP = 2000;
const refuse = (outcome, reason, extra = {}) => ({ ok: false, outcome, reason, ...extra });

/**
 * @param {{fleet: ReturnType<import('./fleet').makeFleet>, executors: Map<string, import('./ports').JobExecutor>,
 *          clock: import('./ports').Clock, random: import('./ports').Random, onSettled?: () => void}} deps
 * executors: id môi trường -> bộ chạy việc của môi trường đó.
 */
function makeRuns({ fleet, executors, clock, random, onSettled = () => {} }) {
  const runs = []; // mới nhất ở cuối
  const view = (r) => ({ id: r.id, kind: r.kind, environment: r.environment, requestedBy: r.by, status: run.runStatus(r.items), startedAt: r.startedAt, finishedAt: r.finishedAt, autoRollback: true, items: r.items.map((i) => ({ ...i, steps: i.steps.map((s) => ({ ...s })) })) });
  const active = (environmentId, serviceId) => runs.find((r) => r.environment.id === environmentId && r.items.some((i) => i.serviceId === serviceId && !run.itemDone(i))) || null;

  function log(r, serviceId, level, text) {
    r.log.push({ seq: r.seq += 1, at: clock.now(), serviceId, level, text });
    if (r.log.length > LOG_KEEP) r.log.splice(0, r.log.length - LOG_KEEP);
  }

  /** input: { kind, environmentId, items: [{serviceId, targetSha?}], by }. Tất cả hoặc không: một mục bị chặn thì không mục nào chạy. */
  async function start({ kind, environmentId, items, by }) {
    const pre = await fleet.preflight({ kind, environmentId, items });
    if (!pre.ok) return pre;
    const busy = pre.items.find((i) => active(environmentId, i.serviceId));
    if (busy) return refuse(OUTCOME.BUSY, `${busy.serviceId} already has a run in progress on ${pre.environment.name}`, { preflight: pre });
    if (!pre.canProceed) return refuse('BLOCKED', 'at least one item is blocked; nothing was started', { preflight: pre });
    const executor = executors.get(environmentId);
    if (!executor) return refuse('UNKNOWN_ENVIRONMENT', `environment ${environmentId} does not accept commands`);
    const r = { id: random.bytes(6).toString('hex'), kind, environment: { id: pre.environment.id, name: pre.environment.name }, by, startedAt: clock.now(), finishedAt: null, seq: 0, log: [], items: pre.items.map((i) => run.newItem({ serviceId: i.serviceId, fromSha: i.from && i.from.sha, toSha: i.to.sha })) };
    runs.push(r);
    if (runs.length > KEEP) runs.splice(0, runs.length - KEEP);
    log(r, null, 'info', `Started ${kind} of ${r.items.length} service(s) on ${r.environment.name}, requested by ${by}.`);
    r.done = Promise.all(r.items.map((item) => {
      const onEvent = (e) => {
        if (e.event === 'step') run.applyStep(item, e);
        else if (e.event === 'log' && typeof e.text === 'string') log(r, item.serviceId, /KHÔNG|HỎNG|hỏng/.test(e.text) ? 'error' : 'info', e.text);
      };
      return executor.run({ service: item.serviceId, action: kind, commit: item.toSha, by }, { onEvent })
        .catch((e) => ({ ok: false, outcome: OUTCOME.UNEXPECTED, reason: e.message }))
        .then((result) => {
          run.applyResult(item, result);
          log(r, item.serviceId, item.status === run.ITEM.SUCCEEDED ? 'success' : item.status === run.ITEM.ROLLED_BACK ? 'warn' : 'error',
            item.status === run.ITEM.SUCCEEDED ? 'Done: the new version is running and healthy.' : item.status === run.ITEM.ROLLED_BACK ? `The new version was unhealthy; the previous version was restored: ${item.reason}` : `Failed: ${item.reason}`);
        });
    })).then(() => { r.finishedAt = clock.now(); onSettled(); });
    return { ok: true, run: view(r) };
  }

  return {
    start,
    get: (id) => { const r = runs.find((x) => x.id === id); return r ? view(r) : null; },
    /** Các dòng log có số thứ tự lớn hơn `after` (để trang hỏi dần mà không lấy lại từ đầu). */
    logs: (id, after = 0) => { const r = runs.find((x) => x.id === id); return r ? r.log.filter((l) => l.seq > after) : null; },
    list: ({ activeOnly = false } = {}) => runs.filter((r) => !activeOnly || run.runStatus(r.items) === 'running').slice().reverse().map(view),
    settle: () => Promise.all(runs.map((r) => r.done)),
  };
}

module.exports = { makeRuns };
