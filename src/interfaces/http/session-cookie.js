'use strict';
// Cookie phiên đăng nhập của bảng điều khiển: cách đặt và cách đọc nằm chung một chỗ, để lớp chặn (đọc) và bộ điều khiển (đặt) không lệch nhau.

const NAME = 'bsn_sid';

/** HttpOnly: mã trên trang không đọc được. SameSite=Strict: trang khác không gửi kèm được. maxAge 0 là xóa. */
const format = (sid, maxAge) => `${NAME}=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

/** Mã phiên trong header Cookie của yêu cầu; không có hoặc sai dạng thì null. */
function read(req) {
  const m = new RegExp(`(?:^|;\\s*)${NAME}=([a-f0-9]{48})(?:;|$)`).exec(req.headers.cookie || '');
  return m ? m[1] : null;
}

module.exports = { format, read };
