'use strict';
// Ca sử dụng DEPLOY: đưa một commit của một dịch vụ lên chạy trên đích này (S-023 mục 8, S-029). Mặc định là commit ĐÃ KHAI;
// truyền `commit` thì đưa đúng commit đó lên (người vận hành chọn trên bảng điều khiển). Commit nào cũng phải đã có bản đóng gói.
// spec: DEP-S-001
const { short, remoteImage } = require('../domain/naming');
const policy = require('../domain/deploy-policy');
const { runSubSteps } = require('./plan');

/**
 * @param {{runtime: import('./ports').Runtime, registry: import('./ports').Registry, locks: import('./ports').Locks,
 *          serviceLock: object, tierSteps: Function, switchVersion: Function}} deps
 */
function makeDeploy({ runtime, registry, locks, serviceLock, tierSteps, switchVersion }) {
  const base = (name) => ({ service: name, action: 'deploy' });
  const refused = (name, plan) => ({ ok: false, ...base(name), ...(plan.to ? { from: plan.from, to: plan.to, healthy: false, reverted: null } : {}), outcome: plan.outcome, reason: plan.reason });

  async function run({ manifest, name, commit, seconds, by, say, step, verbose }) {
    const svc = manifest.services[name];
    const to = commit || svc.commit;
    const from = await runtime.runningCommit(name);
    const remote = remoteImage(manifest.platform, name, to);
    const { present } = await registry.lookup(remote);
    const plan = policy.planDeploy({ name, declared: to, running: from, published: present, remote, chosen: !!commit && commit !== svc.commit });
    if (plan.kind === 'refuse') return refused(name, plan);
    if (plan.kind === 'noop') {
      say(commit && commit !== svc.commit ? `${name} đang chạy đúng bản được chọn ${short(to)}; không đổi gì.` : `${name} đang chạy đúng bản đã khai; không đổi gì.`);
      return { ok: true, noop: true, ...base(name), from, to, healthy: null, reverted: null, reason: '' };
    }
    // Tầng dùng chung và tệp bí mật là của mọi dịch vụ: chuẩn bị trong khóa, để hai dịch vụ deploy cùng lúc không giẫm nhau.
    const box = {};
    await locks.within('tier', () => runSubSteps(tierSteps(manifest, [name], box), say));
    const res = await switchVersion(manifest, name, from, to, { action: 'deploy', secrets: box.secrets, seconds, by, say, step, verbose });
    if (res.ok) say(`ĐÃ DEPLOY ${name} ${short(to)}: khỏe tại http://127.0.0.1:${svc.port.local}${svc.health}`);
    return res;
  }

  /** input: { manifest, name, commit? (đủ 40 ký tự; bỏ trống: commit đã khai), apply, seconds, by, say, step?, verbose? } */
  return async function deploy(input) {
    const { manifest, name, apply, seconds, by, say } = input;
    const svc = manifest.services[name];
    const to = input.commit || svc.commit;
    if (!to) return refused(name, policy.planDeploy({ name, declared: null }));
    const from = await runtime.runningCommit(name);
    const remote = remoteImage(manifest.platform, name, to);
    say(`${name}: đang chạy ${from ? short(from) : '(không chạy)'} -> ${input.commit && input.commit !== svc.commit ? 'bản được chọn' : 'bản đã khai'} ${short(to)} (${remote})`);
    if (!apply) {
      say(`(kế hoạch) 1. kiểm bản ${remote} đã có trên Docker Hub; chưa có thì từ chối`);
      say('(kế hoạch) 2. bật tầng dùng chung nếu chưa bật, tạo cơ sở dữ liệu và topic còn thiếu');
      say(`(kế hoạch) 3. kéo bản, kiểm commit ghi bên trong bản, bật ${name}, gọi ${svc.health} tối đa ${seconds} giây`);
      say(`(kế hoạch) 4. không khỏe thì tự bật lại ${from ? short(from) : '(không có bản trước)'} và thoát mã 1`);
      say('Chưa làm gì. Thêm --apply để chạy thật.');
      return { ok: true, planned: true, ...base(name), from, to };
    }
    return serviceLock.exclusive({ name, action: 'deploy', by }, () => run(input));
  };
}

module.exports = { makeDeploy };
