'use strict';
// Trạng thái của hệ, và nút Deploy, Rollback. Bộ điều khiển chỉ đổi yêu cầu thành lời gọi ca sử dụng, rồi đổi kết quả thành mã HTTP.
const { json, fail } = require('../respond');

// Kết quả có tên của ca sử dụng -> mã HTTP.
const STATUS = { BAD_INPUT: 400, UNKNOWN_SERVICE: 404, BUSY: 409, INVALID_DECLARATIONS: 502, TARGET_UNREACHABLE: 504 };

function deploymentsController({ console: board, memory, target = null }) {
  const request = (action) => async (ctx) => {
    const res = await board.request({ service: ctx.params.service, action, commit: ctx.body.commit, by: ctx.who.actor });
    return res.ok ? json(202, { ok: true, job: res.job }) : fail(STATUS[res.outcome] || 500, res.reason, res.job ? { job: res.job } : {});
  };
  return {
    async state(ctx) {
      const s = await board.state();
      return s.ok ? json(200, { ...s, memory: !!memory, target, actor: ctx.who.actor }) : fail(STATUS[s.outcome] || 502, s.reason, { actor: ctx.who.actor });
    },
    deploy: request('deploy'),
    rollback: request('rollback'),
    async job(ctx) {
      const j = board.job(ctx.params.id);
      return j ? json(200, { ok: true, job: j }) : fail(404, 'không có việc này (bảng điều khiển chỉ nhớ các việc từ lúc nó khởi động)');
    },
  };
}

module.exports = { deploymentsController };
