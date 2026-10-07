'use strict';
// Chỉ nhận yêu cầu gọi đúng tên máy của chính bảng điều khiển. Chặn kiểu tấn công dùng một tên miền lạ trỏ về 127.0.0.1
// để trang bên ngoài gọi được vào đây qua trình duyệt của người quản trị.
const { fail } = require('../respond');

function hostGuard({ port }) {
  return (ctx, next) => {
    const allowed = [`127.0.0.1:${port()}`, `localhost:${port()}`];
    return allowed.includes(ctx.host) ? next() : fail(421, 'tên máy không đúng');
  };
}

module.exports = { hostGuard };
