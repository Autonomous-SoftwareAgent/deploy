'use strict';
// Xác định ai đang gọi: agent (header Authorization: Bearer <token>) hay người (Authorization: Basic, do hộp thoại đăng nhập
// của trình duyệt gửi kèm mọi yêu cầu). Đường nào không đánh dấu "open" trong bảng định tuyến thì bắt buộc phải biết người gọi.
// Chưa có hoặc sai thì trả 401 kèm WWW-Authenticate: trình duyệt tự hiện hộp thoại hỏi tên và mật khẩu.
const { fail } = require('../respond');

const CHALLENGE = { 'www-authenticate': 'Basic realm="Deploy Console", charset="UTF-8"' };

/** Tách "Basic <base64(tên:mật khẩu)>". Sai dạng thì null. */
function parseBasic(header) {
  const text = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  const at = text.indexOf(':');
  return at < 0 ? null : { user: text.slice(0, at), password: text.slice(at + 1) };
}

function authenticate({ auth }) {
  return async (ctx, next) => {
    const header = String(ctx.req.headers.authorization || '');
    ctx.who = null;
    if (header.startsWith('Bearer ')) ctx.who = await auth.identify({ token: header.slice(7).trim() });
    else if (header.startsWith('Basic ')) {
      const given = parseBasic(header);
      const res = given ? await auth.basic(given.user, given.password) : { ok: false, code: 'WRONG' };
      if (res.ok) ctx.who = res.who;
      else if (res.code === 'LOCKED_OUT' && !ctx.route.open) {
        const locked = fail(429, `too many failed sign-in attempts; retry in ${res.retrySeconds} seconds`);
        return { ...locked, headers: { ...locked.headers, 'retry-after': String(res.retrySeconds) } };
      }
    }
    if (ctx.who || ctx.route.open) return next();
    const denied = fail(401, 'sign-in required');
    return header.startsWith('Bearer ') ? denied : { ...denied, headers: { ...denied.headers, ...CHALLENGE } };
  };
}

module.exports = { authenticate };
