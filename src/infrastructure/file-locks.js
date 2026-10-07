'use strict';
// Cổng Locks bằng tệp: tệp tạo với cờ "wx" (chỉ một tiến trình tạo được), ghi pid của bên giữ.
// Bên giữ đã chết thì khóa coi như bỏ. Dùng chung cho dòng lệnh gõ tay và bảng điều khiển, vì cả hai cùng nhìn một thư mục.
const fs = require('node:fs');
const path = require('node:path');

const WAIT_MS = 30000;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeFileLocks({ layout, pid = process.pid }) {
  const read = (key) => { try { return JSON.parse(fs.readFileSync(layout.lock(key), 'utf8')); } catch { return null; } };
  const holderOf = (key) => { const j = read(key); return j && Number.isInteger(j.pid) && alive(j.pid) ? j : null; };

  async function acquire(key, info = {}) {
    fs.mkdirSync(path.dirname(layout.lock(key)), { recursive: true });
    for (let i = 0; i < 3; i++) {
      try { fs.writeFileSync(layout.lock(key), JSON.stringify({ pid, ...info }) + '\n', { flag: 'wx' }); return { ok: true }; }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        const holder = holderOf(key);
        if (holder) return { ok: false, holder };
        try { fs.unlinkSync(layout.lock(key)); } catch { /* bên khác vừa dọn */ }
      }
    }
    return { ok: false, holder: holderOf(key) || { pid: null } };
  }

  async function release(key) {
    const j = read(key);
    if (j && j.pid === pid) { try { fs.unlinkSync(layout.lock(key)); } catch { /* không còn khóa */ } }
  }

  return {
    acquire,
    release,
    async holder(key) { return holderOf(key); },
    /** Chờ tới khi lấy được khóa (tối đa 30 giây) rồi chạy fn; xong hay lỗi đều nhả. */
    async within(key, fn) {
      const until = Date.now() + WAIT_MS;
      while (!(await acquire(key)).ok) {
        if (Date.now() > until) throw new Error(`không lấy được khóa "${key}" sau ${WAIT_MS / 1000} giây: ${layout.lock(key)}`);
        await sleep(40);
      }
      try { return await fn(); } finally { await release(key); }
    },
  };
}

module.exports = { makeFileLocks };
