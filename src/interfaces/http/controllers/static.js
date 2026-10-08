'use strict';
// Phục vụ giao diện (thư mục interfaces/web): chỉ các loại tệp đã khai, chỉ trong đúng thư mục đó.
const fs = require('node:fs');
const path = require('node:path');
const { raw, fail } = require('../respond');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function staticController({ dir }) {
  const base = path.resolve(dir);
  function file(relative) {
    const full = path.resolve(base, relative);
    const type = TYPES[path.extname(full)];
    if (!type || (full !== base && !full.startsWith(base + path.sep))) return fail(404, 'không có đường dẫn này');
    try { return raw(200, fs.readFileSync(full), type); } catch { return fail(404, 'không có đường dẫn này'); }
  }
  return {
    index: () => file('index.html'),
    asset: (ctx) => file(ctx.params.rest),
  };
}

module.exports = { staticController };
