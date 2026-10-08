'use strict';
// spec: BDK-S-007
// GET /api/v1/events: dòng sự kiện (Server-Sent Events) cho trang. Mỗi sự kiện chỉ là TÊN một chủ đề vừa đổi; trang nhận rồi
// hỏi lại dữ liệu qua các đường gọi thường. Có nhịp giữ kết nối để các lớp ở giữa không đóng đường im lặng.
const HEARTBEAT_MS = 25000;

function eventsController({ changes }) {
  const open = () => ({
    status: 200, headers: {}, body: '',
    /** Được server.js gọi với câu trả lời đang mở; trả hàm dọn khi trình duyệt đóng kết nối. */
    stream(res) {
      res.write('retry: 3000\n\n');
      const stop = changes.subscribe((topic) => { res.write(`data: ${topic}\n\n`); });
      const beat = setInterval(() => { res.write(': keep-alive\n\n'); }, HEARTBEAT_MS);
      beat.unref();
      return () => { clearInterval(beat); stop(); };
    },
  });
  return { routes: [{ method: 'GET', path: '/api/v1/events', handler: async () => open() }] };
}

module.exports = { eventsController };
