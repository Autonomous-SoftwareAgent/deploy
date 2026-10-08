'use strict';
// NƠI DUY NHẤT lắp bộ nối vào ca sử dụng. Không tệp nào khác tự tạo bộ nối; lớp interfaces chỉ nhận "app" trả về từ đây.
// Mã lắp ráp nằm ở hai tệp trong composition/: core.js (các cổng và ca sử dụng của dòng lệnh) và console.js (bảng điều khiển).
// spec: BDK-S-002
// spec: BDK-S-003
// spec: LENH-S-001
module.exports = { ...require('./composition/core'), ...require('./composition/console') };
