'use strict';
// Cổng Health: gọi đường kiểm sức khỏe của dịch vụ qua cổng của nó trên chính máy này, tới khi trả lời tốt hoặc hết giờ.

function makeHttpHealth({ fetchImpl = fetch, pauseMs = 1500 } = {}) {
  return {
    async waitHealthy({ port, path }, seconds) {
      const until = Date.now() + seconds * 1000;
      let last = '';
      while (Date.now() < until) {
        try {
          const r = await fetchImpl(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(3000) });
          if (r.ok) return;
          last = `HTTP ${r.status}`;
        } catch (e) { last = e.cause ? String(e.cause.code || e.cause.message) : e.message; }
        await new Promise((r) => setTimeout(r, pauseMs));
      }
      throw new Error(`không khỏe sau ${seconds} giây (${last})`);
    },
  };
}

module.exports = { makeHttpHealth };
