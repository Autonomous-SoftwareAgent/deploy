'use strict';
// up [--pull] [dịch-vụ...]: bật tầng dùng chung và các dịch vụ từ bản đã ghim. --pull: kéo bản CI thay vì build tại chỗ.
const { pick } = require('../../../domain/declaration');

module.exports = {
  name: 'up',
  usage: 'up [--pull] [dịch-vụ...]',
  async run({ app, manifest, args, flags, apply, verbose, seconds, by, say }) {
    const res = await app.stack.start({ manifest, names: pick(manifest, args), apply, pull: flags.has('pull'), verbose, seconds, by, say });
    return res.ok ? 0 : 1;
  },
};
