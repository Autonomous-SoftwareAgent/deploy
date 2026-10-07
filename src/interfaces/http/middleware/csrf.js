'use strict';
// Chặn yêu cầu giả mạo: mọi yêu cầu GHI đến từ trình duyệt (đăng nhập, hoặc đang dùng cookie phiên) phải mang một header riêng.
// Trình duyệt không cho trang khác tự thêm header này vào yêu cầu gửi sang đây. Agent dùng token thì không cần.
const { fail } = require('../respond');

const HEADER = 'x-bsn-console';

function csrf() {
  return (ctx, next) => {
    const fromBrowser = !ctx.who || ctx.who.via === 'session';
    if (ctx.method !== 'GET' && fromBrowser && ctx.req.headers[HEADER] !== '1') return fail(400, `thiếu header ${HEADER}`);
    return next();
  };
}

module.exports = { csrf, HEADER };
