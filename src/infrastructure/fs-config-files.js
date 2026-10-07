'use strict';
// Cổng ConfigFiles trên đĩa: tệp cấu hình của dịch vụ được chép từ commit đã trích vào local/.run/files/<tên>/,
// kèm một tệp dấu ghi commit nguồn. Đổi bản ghim thì phải trích lại, kể cả khi bản được kéo về chứ không build.
const fs = require('node:fs');
const path = require('node:path');
const { short } = require('../domain/naming');

function makeFsConfigFiles({ layout }) {
  const marker = (name) => path.join(layout.files(name), '.commit');
  return {
    async stale(name, declaration) {
      if (!declaration.files || !declaration.files.length) return false;
      try { return fs.readFileSync(marker(name), 'utf8').trim() !== declaration.commit; } catch { return true; }
    },
    async install(name, declaration, fromDir) {
      for (const f of declaration.files || []) {
        const src = path.join(fromDir, f.from);
        if (!fs.existsSync(src)) throw new Error(`${name}: commit ${short(declaration.commit)} không có tệp ${f.from} (khai ở files)`);
        const dst = path.join(layout.files(name), f.from);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
      }
      if (declaration.files && declaration.files.length) fs.writeFileSync(marker(name), declaration.commit + '\n');
    },
    hostPath: (name, from) => path.join(layout.files(name), from).replace(/\\/g, '/'),
  };
}

module.exports = { makeFsConfigFiles };
