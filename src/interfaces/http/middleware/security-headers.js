'use strict';
// Gắn các header bảo vệ vào MỌI câu trả lời. Trang không có mã viết trong HTML nên chính sách nội dung không cần 'unsafe-inline'.

const HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
});

function securityHeaders() {
  return async (ctx, next) => { const res = await next(); return { ...res, headers: { ...HEADERS, ...res.headers } }; };
}

module.exports = { securityHeaders };
