'use strict';
// Mỗi dịch vụ chỉ có MỘT lần đưa lên tại một thời điểm, dù gõ lệnh hay bấm trên bảng điều khiển; dịch vụ khác nhau thì chạy song song.
const { OUTCOME } = require('../domain/outcome');

const lockKey = (name) => `deploy.${name}`;

/** @param {{locks: import('./ports').Locks, clock: import('./ports').Clock}} ports */
function makeServiceLock({ locks, clock }) {
  /** Chạy fn khi đang giữ khóa của dịch vụ. Đang có bên khác giữ thì trả kết quả BUSY, không chạy fn. */
  async function exclusive({ name, action, by }, fn) {
    const got = await locks.acquire(lockKey(name), { action, by, at: clock.now() });
    if (!got.ok) {
      const h = got.holder || {};
      return { ok: false, locked: true, outcome: OUTCOME.BUSY, service: name, action, reason: `${name} đang có một lần ${h.action || 'đưa lên'} chạy dở (bắt đầu ${h.at || '?'}, bởi ${h.by || '?'}, pid ${h.pid}). Chờ nó xong rồi thử lại.` };
    }
    try { return await fn(); } finally { await locks.release(lockKey(name)); }
  }
  return { exclusive, holder: (name) => locks.holder(lockKey(name)) };
}

module.exports = { makeServiceLock, lockKey };
