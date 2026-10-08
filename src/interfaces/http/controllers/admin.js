'use strict';
// spec: BDK-S-004
// Các đường /api/v1 của phần AN TOÀN và CẤU HÌNH: người gọi là ai, cấu hình và lịch sử phiên bản, ánh xạ nhánh, người dùng,
// yêu cầu chờ duyệt, sổ thao tác. Bộ điều khiển chỉ đổi yêu cầu thành lời gọi ca sử dụng; quyền và luật nằm ở domain/access.
const { json } = require('../respond');
const access = require('../../../domain/access');

const STATUS = { UNREACHABLE: 502, BAD_INPUT: 400, FORBIDDEN: 403, NOT_FOUND: 404, UNKNOWN_SERVICE: 404, CONFLICT: 409, BLOCKED: 422, CONFIRMATION_REQUIRED: 422, BUSY: 409, NOT_READY: 503 };
const error = (res, details = {}) => json(STATUS[res.outcome] || 500, { error: { code: res.outcome || 'UNEXPECTED', message: res.reason || 'unexpected error', details } });
const answer = (res, status = 200) => (res.ok ? json(status, { ...res, ok: undefined }) : error(res, res.errors ? { errors: res.errors } : res.version !== undefined ? { version: res.version } : {}));
const actorOf = (ctx) => ({ name: ctx.who.actor, role: ctx.who.role });

function adminController({ settings, auth, audit, approvals, provision = null }) {
  /** Bọc một bộ xử lý: chỉ người quản trị cấu hình (Admin, DevOps) mới qua; người khác nhận 403 và sổ thao tác ghi lại. */
  const adminOnly = (action, handler) => async (ctx) => {
    if (access.canAdminister(ctx.who.role)) return handler(ctx);
    await audit.record({ actor: ctx.who.actor, action, detail: `role ${ctx.who.role} may not change the console configuration`, outcome: 'refused' });
    return error({ outcome: 'FORBIDDEN', reason: `role ${ctx.who.role} may not change the console configuration` });
  };
  const logged = async (ctx, action, target, res) => { await audit.record({ actor: ctx.who.actor, action, target, detail: res.ok ? '' : `${res.outcome}: ${res.reason}`, outcome: res.ok ? 'ok' : 'refused' }); return res; };

  const me = async (ctx) => json(200, { name: ctx.who.actor, role: ctx.who.role, canAdminister: access.canAdminister(ctx.who.role) });
  const getConfig = async (ctx) => json(200, { ...(await settings.get()), roles: access.ROLES, days: access.DAYS, canEdit: access.canAdminister(ctx.who.role) });
  const decide = (approve) => async (ctx) => {
    const res = await approvals.decide(ctx.params.id, { approve, actor: actorOf(ctx) });
    return res.ok ? json(200, { approval: res.approval, run: res.run || null }) : error(res, res.preflight ? { preflight: res.preflight } : {});
  };

  // Thêm, gỡ môi trường (kể cả tạo và xóa máy trên cloud): chỉ có khi bảng điều khiển được lắp phần đó.
  const environments = provision ? [
    { method: 'GET', path: '/api/v1/environments/managed', handler: async () => json(200, await provision.list()) },
    { method: 'GET', path: '/api/v1/environments/operations/:id', handler: async (ctx) => { const o = provision.operation(ctx.params.id); return o ? json(200, o) : error({ outcome: 'NOT_FOUND', reason: 'operation not found' }); } },
    { method: 'POST', path: '/api/v1/environments', handler: adminOnly('environment.add', async (ctx) => answer(await provision.add({ mode: ctx.body.mode, name: ctx.body.name, machineType: ctx.body.machineType, zone: ctx.body.zone, instance: ctx.body.instance, configuration: ctx.body.configuration, confirmation: ctx.body.confirmation, actor: actorOf(ctx) }), 202)) },
    { method: 'DELETE', path: '/api/v1/environments/:name', handler: adminOnly('environment.remove', async (ctx) => answer(await provision.remove({ name: ctx.params.name, deleteMachine: ctx.body.deleteMachine === true, confirmation: ctx.body.confirmation, actor: actorOf(ctx) }))) },
  ] : [];

  return {
    routes: [
      ...environments,
      { method: 'GET', path: '/api/v1/me', handler: me },
      { method: 'GET', path: '/api/v1/config', handler: getConfig },
      { method: 'POST', path: '/api/v1/config/preview', handler: async (ctx) => answer(await settings.preview(ctx.body.config)) },
      { method: 'PUT', path: '/api/v1/config', handler: adminOnly('config.save', async (ctx) => answer(await settings.save({ config: ctx.body.config, expectedVersion: ctx.body.expectedVersion, by: ctx.who.actor, note: ctx.body.note }))) },
      { method: 'POST', path: '/api/v1/config/restore', handler: adminOnly('config.restore', async (ctx) => answer(await settings.restore(ctx.body.version, ctx.who.actor))) },
      { method: 'POST', path: '/api/v1/config/reset', handler: adminOnly('config.reset', async (ctx) => answer(await settings.reset(ctx.who.actor))) },
      { method: 'GET', path: '/api/v1/branches/matrix', handler: async () => json(200, { items: await settings.branchMatrix() }) },
      { method: 'POST', path: '/api/v1/branches/test', handler: async (ctx) => answer(await settings.testBranch(ctx.body.branch, ctx.body.serviceId)) },
      { method: 'GET', path: '/api/v1/users', handler: adminOnly('user.list', async () => json(200, { items: await auth.users(), roles: access.ROLES.filter((r) => r !== 'Agent') })) },
      // Mật khẩu của người dùng mới (và mật khẩu sinh lại) chỉ nằm trong ĐÚNG câu trả lời này; không ghi vào sổ thao tác hay tệp nào.
      { method: 'POST', path: '/api/v1/users', handler: adminOnly('user.add', async (ctx) => answer(await logged(ctx, 'user.add', `${ctx.body.name} (${ctx.body.role})`, await auth.addUser({ name: ctx.body.name, role: ctx.body.role })), 201)) },
      { method: 'PATCH', path: '/api/v1/users/:name', handler: adminOnly('user.role', async (ctx) => answer(await logged(ctx, 'user.role', `${ctx.params.name} -> ${ctx.body.role}`, await auth.setRole(ctx.params.name, ctx.body.role)))) },
      { method: 'DELETE', path: '/api/v1/users/:name', handler: adminOnly('user.remove', async (ctx) => answer(await logged(ctx, 'user.remove', ctx.params.name, await auth.removeUser(ctx.params.name)))) },
      { method: 'POST', path: '/api/v1/users/:name/password', handler: adminOnly('user.password', async (ctx) => answer(await logged(ctx, 'user.password', ctx.params.name, await auth.resetPassword(ctx.params.name)))) },
      { method: 'GET', path: '/api/v1/approvals', handler: async (ctx) => json(200, { items: await approvals.list({ pendingOnly: ctx.query.get('status') === 'pending' }) }) },
      { method: 'POST', path: '/api/v1/approvals/:id/approve', handler: decide(true) },
      { method: 'POST', path: '/api/v1/approvals/:id/reject', handler: decide(false) },
      { method: 'GET', path: '/api/v1/audit', handler: async (ctx) => json(200, await audit.list(ctx.query.get('limit'), { actor: ctx.query.get('actor') || undefined, action: ctx.query.get('action') || undefined, outcome: ctx.query.get('outcome') || undefined, q: ctx.query.get('q') || undefined })) },
    ],
  };
}

module.exports = { adminController };
