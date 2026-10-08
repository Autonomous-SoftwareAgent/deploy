'use strict';
// spec: BDK-S-007
// BẢNG TIN THAY ĐỔI của bảng điều khiển: ca sử dụng nào vừa đổi thứ gì người đang xem cần thấy (lần chạy, yêu cầu chờ duyệt,
// môi trường, cấu hình) thì báo một CHỦ ĐỀ; ai đang nghe (các trình duyệt đang mở trang) nhận tên chủ đề rồi tự hỏi lại dữ liệu.
// Chỉ gửi tên chủ đề, không gửi dữ liệu: quyền xem vẫn do các đường gọi thường quyết định.
const TOPICS = Object.freeze(['runs', 'approvals', 'environments', 'config']);

function makeChanges() {
  const listeners = new Set();
  return {
    /** Trả hàm để thôi nghe. */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Người nghe hỏng không được làm hỏng việc đang báo. */
    publish(topic) { for (const fn of listeners) { try { fn(topic); } catch { /* người nghe đã đi */ } } },
    listeners: () => listeners.size,
  };
}

module.exports = { makeChanges, TOPICS };
