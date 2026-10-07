'use strict';
// Cổng Credentials trên đĩa, trong thư mục trạng thái của đích (không commit): console.auth.json giữ dạng băm,
// console.first-login.txt giữ bản rõ để người dùng đọc MỘT lần rồi xóa.
const fs = require('node:fs');
const path = require('node:path');

function makeFsCredentials({ dir }) {
  const authFile = path.join(dir, 'console.auth.json');
  const firstLoginFile = path.join(dir, 'console.first-login.txt');
  return {
    async load() {
      try { return JSON.parse(fs.readFileSync(authFile, 'utf8')); }
      catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return null; throw e; }
    },
    async save(record) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(authFile, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
    },
    async publishFirstLogin(text) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(firstLoginFile, text, { mode: 0o600 });
      return firstLoginFile;
    },
  };
}

module.exports = { makeFsCredentials };
