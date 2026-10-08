'use strict';
// Ca sử dụng LẦN CHẠY của bảng điều khiển: nhận một yêu cầu deploy hay rollback cho một hoặc nhiều dịch vụ ở MỘT môi trường,
// kiểm tra trước ở phía máy chủ (không tin phía trình duyệt), rồi cho từng mục chạy độc lập. Mục này hỏng không làm hỏng mục kia.
// Việc thật vẫn do đúng lệnh điều khiển làm (khóa theo dịch vụ, tự bật lại bản cũ, ghi sổ nằm ở đó); ở đây chỉ theo dõi tiến trình.
// Lần chạy đang dở sống trong bộ nhớ; mỗi lần chạy được ghi ra cổng runStore lúc bắt đầu và lúc xong, nên sau khi bảng điều khiển
// khởi động lại vẫn xem được các lần trước. Lần đang chạy dở lúc bảng điều khiển tắt hiện là "interrupted": việc thật vẫn chạy
// tới cuối trong tiến trình riêng của nó, kết quả nằm ở sổ deploy của môi trường.
const run = require('../domain/run');
const { OUTCOME } = require('../domain/outcome');

const KEEP = 30;
const INTERRUPTED = 'interrupted';
const LOG_KEEP = 2000;
const refuse = (outcome, reason, extra = {}) => ({ ok: false, outcome, reason, ...extra });

/**
 * @param {{fleet: ReturnType<import('./fleet').makeFleet>, executors: Map<string, import('./ports').JobExecutor>,
 *          runStore: import('./ports').DocumentStore, clock: import('./ports').Clock, random: import('./ports').Random, onSettled?: () => void}} deps
 * executors: id môi trường -> bộ chạy việc của môi trường đó.
 */
function makeRuns({ fleet, executors, runStore, clock, random, onSettled = () => {} }) {
  const runs = []; // các lần chạy của lần khởi động này, mới nhất ở cuối
  let archived = null; // các lần chạy của những lần khởi động trước: [{ view, log }], cũ trước
  async function archive() {
    if (!archived) archived = (await runStore.recent(KEEP)).filter((d) => !runs.some((r) => r.id === d.id)).map((d) => ({ log: d.log || [], view: d.view.status === 'running' ? { ...d.view, status: INTERRUPTED } : d.view }));
    return archived;
  }
  const view = (r) => ({ id: r.id, kind: r.kind, environment: r.environment, requestedBy: r.by, approvedBy: r.approvedBy || null, status: run.runStatus(r.items), startedAt: r.startedAt, finishedAt: r.finishedAt, autoRollback: true, items: r.items.map((i) => ({ ...i, steps: i.steps.map((s) => ({ ...s })) })) });
  const active = (environmentId, serviceId) => runs.find((r) => r.environment.id === environmentId && r.items.some((i) => i.serviceId === serviceId && !run.itemDone(i))) || null;

  /** Ghi lần chạy ra nơi lưu. Ghi hỏng không được làm hỏng lần chạy. */
  const save = (r) => runStore.put({ id: r.id, status: run.runStatus(r.items), startedAt: r.startedAt, view: view(r), log: r.log }).catch(() => {});

  function log(r, serviceId, level, text) {
    r.log.push({ seq: r.seq += 1, at: clock.now(), serviceId, level, text });
    if (r.log.length > LOG_KEEP) r.log.splice(0, r.log.length - LOG_KEEP);
  }

  /**
   * input: { kind, environmentId, items: [{serviceId, targetSha?}], actor: {name, role}, confirmation?, approvedBy? }.
   * Tất cả hoặc không: một mục bị chặn thì không mục nào chạy. Môi trường đòi duyệt mà chưa có người duyệt: trả APPROVAL_REQUIRED.
   */
  async function start({ kind, environmentId, items, actor, confirmation, approvedBy }) {
    const by = actor.name;
    const pre = await fleet.preflight({ kind, environmentId, items, actor });
    if (!pre.ok) return pre;
    const busy = pre.items.find((i) => active(environmentId, i.serviceId));
    if (busy) return refuse(OUTCOME.BUSY, `${busy.serviceId} already has a run in progress on ${pre.environment.name}`, { preflight: pre });
    if (!pre.canProceed) return refuse('BLOCKED', 'at least one item is blocked; nothing was started', { preflight: pre });
    if (pre.gate.confirmation && confirmation !== pre.gate.confirmation) return refuse('CONFIRMATION_REQUIRED', `type ${pre.gate.confirmation} to confirm`, { preflight: pre });
    if (pre.gate.approval && !approvedBy) return refuse('APPROVAL_REQUIRED', `${pre.environment.name} requires a second person to approve`, { preflight: pre });
    const executor = executors.get(environmentId);
    if (!executor) return refuse('UNKNOWN_ENVIRONMENT', `environment ${environmentId} does not accept commands`);
    const r = { id: random.bytes(6).toString('hex'), kind, environment: { id: pre.environment.id, name: pre.environment.name }, by, approvedBy: approvedBy || null, startedAt: clock.now(), finishedAt: null, seq: 0, log: [], items: pre.items.map((i) => run.newItem({ serviceId: i.serviceId, fromSha: i.from && i.from.sha, toSha: i.to.sha })) };
    runs.push(r);
    if (runs.length > KEEP) runs.splice(0, runs.length - KEEP);
    log(r, null, 'info', `Started ${kind} of ${r.items.length} service(s) on ${r.environment.name}, requested by ${by}${approvedBy ? `, approved by ${approvedBy}` : ''}.`);
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
    })).then(async () => { r.finishedAt = clock.now(); await save(r); onSettled(); });
    await save(r);
    return { ok: true, run: view(r) };
  }

  return {
    start,
    get: async (id) => { const r = runs.find((x) => x.id === id); if (r) return view(r); const old = (await archive()).find((d) => d.view.id === id); return old ? old.view : null; },
    /** Các dòng log có số thứ tự lớn hơn `after` (để trang hỏi dần mà không lấy lại từ đầu). */
    logs: async (id, after = 0) => { const r = runs.find((x) => x.id === id) || (await archive()).find((d) => d.view.id === id); return r ? r.log.filter((l) => l.seq > after) : null; },
    list: async ({ activeOnly = false } = {}) => {
      const live = runs.filter((r) => !activeOnly || run.runStatus(r.items) === 'running').slice().reverse().map(view);
      return activeOnly ? live : [...live, ...(await archive()).map((d) => d.view).reverse()];
    },
    settle: () => Promise.all(runs.map((r) => r.done)),
  };
}

module.exports = { makeRuns };
