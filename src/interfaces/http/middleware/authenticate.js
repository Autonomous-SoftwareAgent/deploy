'use strict';
// Xác định ai đang gọi: agent (header Authorization: Bearer <token>) hay người quản trị (cookie phiên).
// Đường nào không đánh dấu "open" trong bảng định tuyến thì bắt buộc phải biết người gọi.
const { fail } = require('../respond');
const cookie = require('../session-cookie');

function authenticate({ auth }) {
  return async (ctx, next) => {
    const header = ctx.req.headers.authorization || '';
    ctx.who = header.startsWith('Bearer ') ? await auth.identify({ token: header.slice(7).trim() }) : await auth.identify({ sid: cookie.read(ctx.req) });
    if (!ctx.who && !ctx.route.open) return fail(401, 'chưa đăng nhập');
    return next();
  };
}

module.exports = { authenticate };
