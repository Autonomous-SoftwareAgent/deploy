'use strict';
// spec: BDK-S-004
// SỔ THAO TÁC của bảng điều khiển: ai làm gì, lúc nào, kết quả ra sao. Chỉ thêm, không sửa, không xóa.
// Ghi sổ hỏng không được làm hỏng việc chính (một lần deploy đã chạy thì vẫn là đã chạy): lỗi ghi được nuốt và đếm lại.

/** @param {{auditLog: import('./ports').AuditLog, clock: import('./ports').Clock}} deps */
function makeAudit({ auditLog, clock }) {
  let dropped = 0;
  return {
    /** entry: { actor, action, target?, detail?, outcome? ('ok' mặc định) }. */
    async record({ actor, action, target = '', detail = '', outcome = 'ok' }) {
      try { await auditLog.append({ at: clock.now(), actor: String(actor), action, target: String(target), detail: String(detail).slice(0, 500), outcome }); }
      catch { dropped += 1; }
    },
    /** Mới trước. dropped: số dòng không ghi được từ lúc bảng điều khiển khởi động. */
    async list(limit = 200, filter = {}) { return { items: await auditLog.list(Math.max(1, Math.min(1000, Number(limit) || 200)), filter), dropped }; },
  };
}

module.exports = { makeAudit };
