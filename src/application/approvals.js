'use strict';
// spec: BDK-S-004
// Ca sử dụng GỬI YÊU CẦU deploy hay rollback từ bảng điều khiển, kèm bước NGƯỜI THỨ HAI DUYỆT cho môi trường đòi duyệt.
// Mọi yêu cầu đi qua đây: được chạy ngay, bị chặn, hay phải chờ duyệt đều ghi vào sổ thao tác.
// Yêu cầu chờ duyệt lưu ở cổng approvalStore (còn nguyên sau khi bảng điều khiển khởi động lại) và hết hạn sau 24 giờ.
const access = require('../domain/access');

const TTL_MS = 24 * 3600 * 1000;
const KEEP = 100;
const STATUS = Object.freeze({ PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', EXPIRED: 'expired' });
const refuse = (outcome, reason, extra = {}) => ({ ok: false, outcome, reason, ...extra });

/**
 * @param {{runs: ReturnType<import('./runs').makeRuns>, settings: {get: Function}, audit: {record: Function},
 *          approvalStore: import('./ports').DocumentStore, clock: import('./ports').Clock, random: import('./ports').Random}} deps
 */
function makeApprovals({ runs, settings, audit, approvalStore, clock, random }) {
  let list = null; // mới nhất ở cuối; nạp từ nơi lưu ở lần dùng đầu
  const load = async () => { if (!list) list = await approvalStore.recent(KEEP); return list; };
  const keep = (a) => approvalStore.put(a);
  const names = (items) => items.map((i) => i.serviceId).join(', ');
  const view = (a) => ({ id: a.id, kind: a.kind, environment: a.environment, items: a.items, requestedBy: a.actor.name, requestedAt: a.requestedAt, expiresAt: new Date(a.expiresAtMs).toISOString(), status: a.status, decidedBy: a.decidedBy || null, decidedAt: a.decidedAt || null, runId: a.runId || null });
  async function expire() { for (const a of await load()) if (a.status === STATUS.PENDING && a.expiresAtMs <= clock.millis()) { a.status = STATUS.EXPIRED; await keep(a); } }

  /** input: { kind, environmentId, items, actor: {name, role}, confirmation? }. Trả { ok, run } | { ok, approval } | từ chối. */
  async function submit(input) {
    const res = await runs.start(input);
    const where = `${input.kind} ${names(Array.isArray(input.items) ? input.items.filter(Boolean) : [])} @ ${input.environmentId}`;
    if (res.ok) { await audit.record({ actor: input.actor.name, action: `${input.kind}.start`, target: where, detail: `run ${res.run.id}` }); return res; }
    if (res.outcome !== 'APPROVAL_REQUIRED') { await audit.record({ actor: input.actor.name, action: `${input.kind}.refused`, target: where, detail: `${res.outcome}: ${res.reason}`, outcome: 'refused' }); return res; }
    const pre = res.preflight;
    const a = { id: random.bytes(6).toString('hex'), kind: input.kind, environment: { id: pre.environment.id, name: pre.environment.name }, actor: input.actor, confirmation: input.confirmation || null,
      items: pre.items.map((i) => ({ serviceId: i.serviceId, targetSha: i.to.sha, fromSha: i.from ? i.from.sha : null, message: i.to.message || null })), requestedAt: clock.now(), expiresAtMs: clock.millis() + TTL_MS, status: STATUS.PENDING };
    (await load()).push(a);
    if (list.length > KEEP) list.splice(0, list.length - KEEP);
    await keep(a);
    await audit.record({ actor: input.actor.name, action: 'approval.request', target: where, detail: `approval ${a.id}` });
    return { ok: true, approval: view(a) };
  }

  /** Duyệt hoặc từ chối. Người duyệt phải khác người gửi và có quyền mức cao nhất ở môi trường đó. Duyệt xong thì chạy ngay. */
  async function decide(id, { approve, actor }) {
    await expire();
    const a = list.find((x) => x.id === id);
    if (!a) return refuse('NOT_FOUND', 'approval request not found');
    if (a.status !== STATUS.PENDING) return refuse('CONFLICT', `this request is already ${a.status}`);
    const { config } = await settings.get();
    if (!access.canApprove(config, actor, a.actor.name, a.environment.id)) return refuse('FORBIDDEN', a.actor.name === actor.name ? 'the person who asked cannot approve their own request' : `role ${actor.role} may not approve on ${a.environment.name}`);
    const where = `${a.kind} ${names(a.items)} @ ${a.environment.id}`;
    if (!approve) {
      Object.assign(a, { status: STATUS.REJECTED, decidedBy: actor.name, decidedAt: clock.now() });
      await keep(a);
      await audit.record({ actor: actor.name, action: 'approval.reject', target: where, detail: `approval ${a.id}, asked by ${a.actor.name}` });
      return { ok: true, approval: view(a) };
    }
    // Kiểm tra trước chạy lại với đúng người gửi: từ lúc gửi tới lúc duyệt môi trường có thể đã đổi (bản khác đang chạy, vào giờ khóa).
    const res = await runs.start({ kind: a.kind, environmentId: a.environment.id, items: a.items.map((i) => ({ serviceId: i.serviceId, targetSha: i.targetSha })), actor: a.actor, confirmation: a.confirmation, approvedBy: actor.name });
    if (!res.ok) { await audit.record({ actor: actor.name, action: 'approval.approve', target: where, detail: `could not start: ${res.outcome}: ${res.reason}`, outcome: 'refused' }); return res; }
    Object.assign(a, { status: STATUS.APPROVED, decidedBy: actor.name, decidedAt: clock.now(), runId: res.run.id });
    await keep(a);
    await audit.record({ actor: actor.name, action: 'approval.approve', target: where, detail: `approval ${a.id}, asked by ${a.actor.name}, run ${res.run.id}` });
    return { ok: true, approval: view(a), run: res.run };
  }

  return {
    submit, decide,
    list: async ({ pendingOnly = false } = {}) => { await expire(); return list.filter((a) => !pendingOnly || a.status === STATUS.PENDING).slice().reverse().map(view); },
  };
}

module.exports = { makeApprovals, STATUS };
