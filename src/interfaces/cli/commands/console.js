'use strict';
// console [--memory | --target=<tên>] [--port=8900] [--reset-auth]: mở bảng điều khiển web (chỉ nghe trên 127.0.0.1).
// --target=<tên>: điều khiển hệ trên một máy từ xa khai ở targets/<tên>.json, qua SSH; bảng điều khiển vẫn chạy ở máy này.
// Lệnh này không tự lắp gì: nó nhận hàm mở bảng điều khiển từ cửa vào (bsn.js), nơi gọi composition.

/** open({memory, target, port}) trả { auth, server, describe } đã lắp; ném lỗi có lời giải thích nếu tờ khai đích sai. */
function makeConsoleCommand({ open }) {
  return {
    name: 'console',
    usage: 'console [--memory | --target=<tên>] [--port=8900] [--reset-auth]',
    standalone: true,
    async run({ flags, options, say }) {
      const port = options.has('port') ? Number(options.get('port')) : 8900;
      if (!Number.isInteger(port) || port < 1024 || port > 65535) { say('--port phải là số từ 1024 tới 65535'); return 1; }
      const memory = flags.has('memory');
      const target = options.get('target') || null;
      if (memory && target) { say('Chỉ dùng một trong hai: --memory hoặc --target'); return 1; }
      let board;
      try { board = open({ memory, target, port }); } catch (e) { say(`Không mở được bảng điều khiển: ${e.message}`); return 1; }
      const first = await board.auth.ensure({ reset: flags.has('reset-auth') });
      if (first.created && !memory) say(`Đã sinh mật khẩu quản trị và token cho agent. Đọc rồi XÓA tệp: ${first.where}`);
      if (first.created && memory) say(board.firstLogin());
      if (flags.has('reset-auth')) return 0;
      // Lần đầu chạy bản có DB: chép cấu hình, sổ thao tác và người dùng từ các tệp cũ sang DB (tệp cũ giữ nguyên).
      if (board.importRecords) {
        try { const r = await board.importRecords(); if (r.imported && (r.versions || r.auditEntries || r.members)) say(`Đã chép dữ liệu cũ vào DB của bảng điều khiển: ${r.versions} phiên bản cấu hình, ${r.auditEntries} dòng sổ thao tác, ${r.members} người dùng.`); }
        catch (e) { say(`Không chép được dữ liệu cũ vào DB: ${e.message}`); return 1; }
      }
      try { await board.server.listen(); } catch (e) { say(`Không mở được cổng ${port}: ${e.message}`); return 1; }
      say(`Bảng điều khiển${memory ? ' (TRONG BỘ NHỚ, không đụng hệ nào)' : ''}: http://127.0.0.1:${port}  (chỉ máy này vào được; Ctrl+C để tắt, tắt không ảnh hưởng dịch vụ đang chạy)`);
      say(`Đích: ${board.describe || 'chính máy này'}`);
      // Lần đọc đầu tới một đích từ xa chậm (phải hỏi địa chỉ máy): làm sẵn ở nền để trang mở ra là có dữ liệu.
      if (board.warm) board.warm();
      return board.untilClosed();
    },
  };
}

module.exports = { makeConsoleCommand };
