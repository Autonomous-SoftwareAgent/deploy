'use strict';
// Chuẩn bị dùng chung cho "bật cả hệ" và "deploy một dịch vụ": bí mật, tầng dùng chung, cơ sở dữ liệu và topic của các dịch vụ được nêu.
const { allSecretNames } = require('../domain/stack-plan');

/** @param {{secrets: import('./ports').Secrets, sharedTier: import('./ports').SharedTier}} ports */
function makePrepareTier({ secrets, sharedTier }) {
  /** Trả các bước; box.secrets có giá trị sau khi bước đầu chạy. */
  return function tierSteps(manifest, names, box) {
    const steps = [
      { text: 'sinh mật khẩu local nếu chưa có (infra/local/.run/secrets.env, không commit)', run: async () => { box.secrets = await secrets.ensure(allSecretNames(manifest, names)); } },
      { text: 'bật tầng dùng chung: PostgreSQL (127.0.0.1:55440) và broker (127.0.0.1:19192), chờ khỏe', run: () => sharedTier.ensureUp() },
    ];
    for (const n of names) {
      const svc = manifest.services[n];
      if (svc.database) steps.push({ text: `tạo cơ sở dữ liệu "${svc.database.name}" cho ${n} nếu chưa có`, run: () => sharedTier.ensureDatabase(svc.database.name) });
      if (svc.topics && svc.topics.length) steps.push({ text: `tạo topic cho ${n} nếu chưa có: ${svc.topics.join(', ')}`, run: () => sharedTier.ensureTopics(svc.topics) });
    }
    return steps;
  };
}

module.exports = { makePrepareTier };
