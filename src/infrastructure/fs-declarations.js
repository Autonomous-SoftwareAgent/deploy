'use strict';
// Cổng Declarations trên đĩa: mỗi dịch vụ một tệp services/<tên>.json (tên tệp là tên dịch vụ), và platform.json.
const fs = require('node:fs');
const path = require('node:path');

function makeFsDeclarations({ layout }) {
  function platform() {
    if (!fs.existsSync(layout.platform)) return null;
    try { return JSON.parse(fs.readFileSync(layout.platform, 'utf8')); }
    catch (e) { throw new Error(`infra/platform.json: không đọc được JSON (${e.message})`); }
  }
  return {
    async load() {
      if (!fs.existsSync(layout.services)) throw new Error('không thấy thư mục infra/services/ (mỗi dịch vụ một tệp <tên>.json)');
      const services = {};
      for (const f of fs.readdirSync(layout.services).filter((x) => x.endsWith('.json')).sort()) {
        try { services[f.slice(0, -'.json'.length)] = JSON.parse(fs.readFileSync(path.join(layout.services, f), 'utf8')); }
        catch (e) { throw new Error(`infra/services/${f}: không đọc được JSON (${e.message})`); }
      }
      return { schema: 1, services, platform: platform() };
    },
    /** Ghi tờ của ĐÚNG một dịch vụ; không đụng tờ của dịch vụ khác. */
    async save(name, declaration) {
      const file = path.join(layout.services, `${name}.json`);
      fs.writeFileSync(file + '.tmp', JSON.stringify(declaration, null, 2) + '\n');
      fs.renameSync(file + '.tmp', file);
    },
  };
}

module.exports = { makeFsDeclarations };
