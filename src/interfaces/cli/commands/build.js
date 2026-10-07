'use strict';
// build [dịch-vụ...]: build bản TỪ COMMIT ĐƯỢC GHIM (không đọc thư mục làm việc).
const { pick } = require('../../../domain/declaration');
const { runPlan } = require('../../../application/plan');

module.exports = {
  name: 'build',
  usage: 'build [dịch-vụ...]',
  async run({ app, manifest, args, apply, verbose, say }) {
    for (const n of pick(manifest, args)) { say(`== ${n}`); await runPlan(app.images.buildSteps(manifest, n, { verbose }), { apply, say }); }
    return 0;
  },
};
