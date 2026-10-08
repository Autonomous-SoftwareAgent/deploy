'use strict';
// spec: BDK-S-004
// Hai cổng lưu của bảng điều khiển ở dạng TỆP, trong thư mục trạng thái (không commit). Từ D-014 bảng điều khiển lưu vào SQLite
// (sqlite/console-stores.js); hai bộ nối này còn dùng để ĐỌC dữ liệu cũ khi chép sang DB lần đầu:
//   ConfigStore: console.config.json (cấu hình kèm lịch sử phiên bản), ghi qua tệp tạm rồi đổi tên để không bao giờ để lại tệp dở.
//   AuditLog:    console.audit.jsonl (mỗi dòng một thao tác), chỉ thêm vào cuối.
const fs = require('node:fs');
const path = require('node:path');

function makeFsConfigStore({ dir }) {
  const file = path.join(dir, 'console.config.json');
  return {
    async load() {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`console.config.json is unreadable: ${e.message}`); }
    },
    async save(record) {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n');
      fs.renameSync(tmp, file);
    },
  };
}

function makeFsAuditLog({ dir }) {
  const file = path.join(dir, 'console.audit.jsonl');
  return {
    async append(entry) {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    },
    /** Mới trước. Dòng hỏng (ghi dở khi máy tắt) bị bỏ qua, không làm hỏng cả sổ. */
    async list(limit, filter = {}) {
      const q = String(filter.q || '').toLowerCase();
      const keep = (e) => (!filter.actor || e.actor === filter.actor) && (!filter.action || String(e.action).startsWith(filter.action)) && (!filter.outcome || e.outcome === filter.outcome)
        && (!q || `${e.target} ${e.detail}`.toLowerCase().includes(q));
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
      const out = [];
      const lines = text.split('\n');
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
        if (!lines[i]) continue;
        try { const e = JSON.parse(lines[i]); if (keep(e)) out.push(e); } catch { /* dòng ghi dở */ }
      }
      return out;
    },
  };
}

module.exports = { makeFsConfigStore, makeFsAuditLog };
