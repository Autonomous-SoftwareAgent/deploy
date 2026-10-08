'use strict';
// Chặn yêu cầu giả mạo: trình duyệt tự gửi kèm tên và mật khẩu đã nhớ cho MỌI yêu cầu tới đây, kể cả yêu cầu do một trang khác
// tạo ra. Nên mọi yêu cầu GHI của người (đăng nhập kiểu Basic) phải mang một header riêng mà trang khác không tự thêm được,
// và nếu trình duyệt có ghi nguồn gốc (Origin) thì nguồn gốc phải là chính bảng điều khiển. Agent dùng token thì không cần.
const { fail } = require('../respond');

const HEADER = 'x-bsn-console';

function csrf() {
  return (ctx, next) => {
    if (ctx.method === 'GET' || (ctx.who && ctx.who.via === 'token')) return next();
    if (ctx.req.headers[HEADER] !== '1') return fail(400, `missing header ${HEADER}`);
    const origin = ctx.req.headers.origin;
    if (origin && origin !== `http://${ctx.host}`) return fail(403, 'request comes from another origin');
    return next();
  };
}

module.exports = { csrf, HEADER };
