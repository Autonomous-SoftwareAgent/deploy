'use strict';
// Cổng Secrets trên đĩa: local/.run/secrets.env (không commit). Sinh ngẫu nhiên lần đầu, giữ nguyên các lần sau.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function makeFsSecrets({ layout }) {
  return {
    async ensure(names) {
      const have = {};
      if (fs.existsSync(layout.secrets)) {
        for (const line of fs.readFileSync(layout.secrets, 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0) have[line.slice(0, i)] = line.slice(i + 1).trim(); }
      }
      let changed = false;
      for (const n of names) if (!have[n]) { have[n] = crypto.randomBytes(24).toString('hex'); changed = true; }
      if (changed) {
        fs.mkdirSync(path.dirname(layout.secrets), { recursive: true });
        fs.writeFileSync(layout.secrets, Object.entries(have).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
      }
      return have;
    },
  };
}

module.exports = { makeFsSecrets };
