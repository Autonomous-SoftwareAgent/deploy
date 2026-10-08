'use strict';
// Các đường /api/v1 của bảng điều khiển theo môi trường (design/deploy-console.api.md). Bộ điều khiển chỉ đổi yêu cầu thành
// lời gọi ca sử dụng rồi đổi kết quả có tên thành mã HTTP; không có luật nào ở đây.
const { json } = require('../respond');

// Kết quả có tên của ca sử dụng -> mã HTTP (mục 4 của tài liệu API: 400 sai cú pháp, 404, 409 xung đột trạng thái, 422 vi phạm nghiệp vụ).
const STATUS = { BAD_INPUT: 400, UNKNOWN_SERVICE: 404, UNKNOWN_ENVIRONMENT: 404, BUSY: 409, BLOCKED: 422, INVALID_DECLARATIONS: 502 };
const CODE = { BUSY: 'RUN_IN_PROGRESS' };

const error = (res, extra = {}) => json(STATUS[res.outcome] || 500, { error: { code: CODE[res.outcome] || res.outcome || 'UNEXPECTED', message: res.reason || 'unexpected error', details: extra } });
const text = (q, key) => { const v = q.get(key); return v === null || v === '' ? undefined : v; };

function fleetController({ fleet, runs, memory = false, skippedTargets = [] }) {
  const overview = async (ctx) => {
    const res = await fleet.overview({ projectId: text(ctx.query, 'projectId'), environmentId: text(ctx.query, 'environmentId'), status: text(ctx.query, 'status'), q: text(ctx.query, 'q') });
    return res.ok ? json(200, { ...res, ok: undefined, memory, skippedTargets, actor: ctx.who.actor }) : error(res);
  };
  const service = async (ctx) => { const res = await fleet.service(ctx.params.id); return res.ok ? json(200, { ...res, ok: undefined }) : error(res); };
  const preflight = async (ctx) => {
    const res = await fleet.preflight({ kind: ctx.body.kind, environmentId: ctx.body.environmentId, items: ctx.body.items });
    return res.ok ? json(200, { ...res, ok: undefined }) : error(res);
  };
  const create = async (ctx) => {
    const res = await runs.start({ kind: ctx.body.kind, environmentId: ctx.body.environmentId, items: ctx.body.items, by: ctx.who.actor });
    return res.ok ? json(201, { runId: res.run.id, run: res.run }) : error(res, res.preflight ? { preflight: res.preflight } : {});
  };
  const list = async (ctx) => json(200, { items: runs.list({ activeOnly: text(ctx.query, 'status') === 'active' }) });
  const one = async (ctx) => { const r = runs.get(ctx.params.id); return r ? json(200, r) : json(404, { error: { code: 'NOT_FOUND', message: 'run not found (the console only remembers runs since it started)' } }); };
  const logs = async (ctx) => {
    const after = Number(text(ctx.query, 'after') || 0);
    const lines = runs.logs(ctx.params.id, Number.isFinite(after) && after > 0 ? after : 0);
    return lines ? json(200, { items: lines }) : json(404, { error: { code: 'NOT_FOUND', message: 'run not found' } });
  };
  // Một lần chuyển bản đã bắt đầu thì không cắt ngang an toàn được (container đã đổi, sổ chưa ghi): nói thật thay vì giả vờ hủy.
  const cancel = async () => json(409, { error: { code: 'NOT_CANCELLABLE', message: 'A started run cannot be cancelled: it runs to the end, and an unhealthy version is replaced by the previous one.' } });
  return {
    routes: [
      { method: 'GET', path: '/api/v1/overview', handler: overview },
      { method: 'GET', path: '/api/v1/environments', handler: async () => json(200, { items: fleet.environments() }) },
      { method: 'GET', path: '/api/v1/services/:id', handler: service },
      { method: 'POST', path: '/api/v1/deployments/preflight', handler: preflight },
      { method: 'POST', path: '/api/v1/deployments', handler: create },
      { method: 'GET', path: '/api/v1/runs', handler: list },
      { method: 'GET', path: '/api/v1/runs/:id', handler: one },
      { method: 'GET', path: '/api/v1/runs/:id/logs', handler: logs },
      { method: 'POST', path: '/api/v1/runs/:id/cancel', handler: cancel },
    ],
  };
}

module.exports = { fleetController };
