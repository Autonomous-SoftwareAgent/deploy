'use strict';
// Cổng Ledger trên đĩa: local/.run/deployments.json (không commit; là sự thật của MỘT đích).
// Luật của sổ nằm ở domain/ledger.js; tệp này chỉ đọc, ghi và giữ khóa quanh lần ghi.
const fs = require('node:fs');
const path = require('node:path');
const ledger = require('../domain/ledger');

function makeFsLedger({ layout, locks }) {
  function readNow() {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(layout.ledger, 'utf8')); } catch { /* chưa có sổ */ }
    return ledger.accept(raw, layout.ledger);
  }
  function write(value) {
    fs.mkdirSync(path.dirname(layout.ledger), { recursive: true });
    fs.writeFileSync(layout.ledger + '.tmp', JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(layout.ledger + '.tmp', layout.ledger);
  }
  return {
    async read() { return readNow(); },
    /** Đọc lại sổ, ghi thêm một dòng, lưu, tất cả trong khóa: hai dịch vụ deploy cùng lúc không ghi đè dòng của nhau. */
    async append(name, entry) {
      await locks.within('ledger', async () => { const value = readNow(); ledger.record(value, name, entry); write(value); });
    },
  };
}

module.exports = { makeFsLedger };
