'use strict';
// Tờ khai các đích từ xa: targets/<tên>.json trong repo deploy trên MÁY NÀY. Tên máy và vùng là chuyện của từng nơi cài,
// nên các tệp này không vào git (xem .gitignore và targets/README.md).
const fs = require('node:fs');
const path = require('node:path');
const { validateTarget } = require('../domain/target');

function makeFsTargets({ layout }) {
  const dir = path.join(layout.base, 'targets');
  return {
    /** Đọc và kiểm một đích theo tên. Ném lỗi có lời giải thích nếu thiếu hoặc sai. */
    load(name) {
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name || '')) throw new Error('tên đích chỉ gồm chữ thường, số, gạch nối');
      const file = path.join(dir, `${name}.json`);
      let raw;
      try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (e) { throw new Error(e.code === 'ENOENT' ? `không có tờ khai đích ${file} (mẫu: infra/targets/README.md)` : `${file}: không đọc được JSON (${e.message})`); }
      const target = { name, ...raw };
      const errs = validateTarget(target);
      if (errs.length) throw new Error(`${file} không hợp lệ: ${errs.join('; ')}`);
      return target;
    },
  };
}

module.exports = { makeFsTargets };
