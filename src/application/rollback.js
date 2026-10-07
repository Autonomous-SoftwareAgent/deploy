'use strict';
// Ca sử dụng ROLLBACK: lùi một dịch vụ về bản liền trước, hoặc về một commit đã từng chạy khỏe trên đích này.
// Lùi xong thì ghi lại tờ khai báo để điều dịch vụ "muốn" khớp với thứ đang chạy (D-006).
// spec: DEP-S-001
const { short, localImage, remoteImage } = require('../domain/naming');
const policy = require('../domain/deploy-policy');
const { runSubSteps } = require('./plan');

/**
 * @param {{runtime: import('./ports').Runtime, registry: import('./ports').Registry, ledger: import('./ports').Ledger,
 *          declarations: import('./ports').Declarations, locks: import('./ports').Locks, serviceLock: object,
 *          tierSteps: Function, switchVersion: Function}} deps
 */
function makeRollback({ runtime, registry, ledger, declarations, locks, serviceLock, tierSteps, switchVersion }) {
  const base = (name) => ({ service: name, action: 'rollback' });
  const refused = (name, plan) => ({ ok: false, ...base(name), from: plan.from, ...(plan.to ? { to: plan.to } : {}), outcome: plan.outcome, reason: plan.reason });

  async function run({ manifest, name, seconds, by, say, verbose }, from, to) {
    const svc = manifest.services[name];
    const local = await runtime.hasImage(localImage(name, to));
    const published = local ? true : (await registry.lookup(remoteImage(manifest.platform, name, to))).present;
    const gone = policy.rollbackImageAvailable({ to, from, local, published });
    if (gone) return { ...refused(name, gone), healthy: false, reverted: null };
    const box = {};
    await locks.within('tier', () => runSubSteps(tierSteps(manifest, [name], box), say));
    const res = await switchVersion(manifest, name, from, to, { action: 'rollback', secrets: box.secrets, seconds, by, say, verbose });
    if (res.ok) {
      await declarations.save(name, { ...svc, commit: to });
      res.declarationUpdated = true;
      say(`ĐÃ LÙI ${name} về ${short(to)}: khỏe. Đã ghi commit này vào infra/services/${name}.json; nhớ commit và đẩy repo deploy để tờ khai báo trên GitHub khớp.`);
    }
    return res;
  }

  /** input: { manifest, name, ref?, apply, seconds, by, say, verbose? } */
  return async function rollback(input) {
    const { manifest, name, ref, apply, seconds, by, say } = input;
    const svc = manifest.services[name];
    const from = await runtime.runningCommit(name);
    const plan = policy.planRollback({ name, ledger: await ledger.read(), running: from, ref });
    if (plan.kind === 'refuse') return refused(name, plan);
    const to = plan.to;
    say(`${name}: đang chạy ${from ? short(from) : '(không chạy)'} -> lùi về ${short(to)}`);
    if (plan.kind === 'noop') {
      say(`${name} đang chạy đúng bản đó; không đổi gì.`);
      return { ok: true, noop: true, ...base(name), from, to, healthy: null, reverted: null, reason: '' };
    }
    if (!apply) {
      say(`(kế hoạch) 1. lấy bản ${short(to)}: dùng ảnh có ở máy, không có thì kéo từ Docker Hub (bản đã bị dọn thì dừng)`);
      say(`(kế hoạch) 2. bật ${name}, gọi ${svc.health} tối đa ${seconds} giây; không khỏe thì bật lại ${from ? short(from) : '(không có)'}`);
      say(`(kế hoạch) 3. khỏe thì ghi commit ${short(to)} vào infra/services/${name}.json để tờ khai báo khớp với thứ đang chạy`);
      say('Chưa làm gì. Thêm --apply để chạy thật.');
      return { ok: true, planned: true, ...base(name), from, to };
    }
    return serviceLock.exclusive({ name, action: 'rollback', by }, () => run(input, from, to));
  };
}

module.exports = { makeRollback };
