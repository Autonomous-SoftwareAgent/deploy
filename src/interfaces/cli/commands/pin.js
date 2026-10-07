'use strict';
// pin <dịch-vụ> [commit]: ghim một commit (mặc định HEAD) vào tờ khai báo của ĐÚNG dịch vụ đó.
module.exports = {
  name: 'pin',
  usage: 'pin <dịch-vụ> [commit]',
  async run({ app, manifest, args, apply, say }) {
    const [name, ref] = args;
    if (!name || !manifest.services[name]) { say(`Dùng: node infra/bsn.js pin <dịch-vụ> [commit] [--apply]. Có: ${Object.keys(manifest.services).join(', ')}`); return 1; }
    await app.pin({ manifest, name, ref, apply, say });
    return 0;
  },
};
