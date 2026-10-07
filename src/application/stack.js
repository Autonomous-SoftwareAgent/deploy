'use strict';
// Ca sử dụng BẬT và TẮT CẢ HỆ trên đích này: tầng dùng chung rồi các dịch vụ, từ bản của commit được ghim.
const { short, localImage, remoteImage } = require('../domain/naming');
const { composeFor, PG } = require('../domain/stack-plan');
const { runPlan, runSubSteps } = require('./plan');

const STACK_KEY = 'services';

/**
 * @param {{runtime: import('./ports').Runtime, configFiles: import('./ports').ConfigFiles, health: import('./ports').Health,
 *          ledger: import('./ports').Ledger, secrets: import('./ports').Secrets, sharedTier: import('./ports').SharedTier,
 *          clock: import('./ports').Clock, images: object, tierSteps: Function}} deps
 */
function makeStack({ runtime, configFiles, health, ledger, secrets, sharedTier, clock, images, tierSteps }) {
  function startSteps(manifest, names, { pull, verbose, say }) {
    const box = {};
    const steps = tierSteps(manifest, names, box);
    for (const n of names) {
      const svc = manifest.services[n];
      const img = svc.commit ? localImage(n, svc.commit) : '(chưa ghim)';
      steps.push({
        text: pull
          ? `ảnh ${img}: kéo bản CI ${svc.commit ? remoteImage(manifest.platform, n, svc.commit) : ''} từ Docker Hub nếu máy chưa có (không build ảnh chính tại chỗ)`
          : `ảnh ${img}: build từ commit được ghim nếu chưa có`,
        run: async () => {
          if (pull && !(await runtime.hasImage(img))) say(`   - đã kéo ${await images.fetch(manifest, n, { verbose })}`);
          // Tiến trình chạy kèm (đồ giả lập) không lên kho nên luôn build tại chỗ; tệp cấu hình luôn lấy từ commit được ghim.
          const missing = await images.missing(n, svc);
          if (missing.size || (await configFiles.stale(n, svc))) await runSubSteps(images.buildSteps(manifest, n, { only: missing, verbose }), say);
        },
      });
    }
    steps.push({
      text: `chạy ${names.map((n) => `${n} (127.0.0.1:${manifest.services[n].port.local})`).join(', ')} từ ảnh đã ghim`,
      run: async () => {
        try { await runtime.applyStack(STACK_KEY, composeFor(manifest, names, box.secrets, configFiles.hostPath), { removeOrphans: true }); }
        catch (e) { throw new Error(`bật dịch vụ hỏng: ${e.message}`); }
      },
    });
    return steps;
  }

  /** input: { manifest, names, apply, pull, verbose, seconds, by, say } */
  async function start(input) {
    const { manifest, names, apply, seconds, by, say } = input;
    for (const n of names) if (!manifest.services[n].commit) { say(`${n}: chưa ghim commit. Chạy: node infra/bsn.js pin ${n} --apply`); return { ok: false }; }
    await runPlan(startSteps(manifest, names, input), { apply, say });
    if (!apply) return { ok: true, planned: true };
    for (const n of names) {
      const svc = manifest.services[n];
      try { await health.waitHealthy({ port: svc.port.local, path: svc.health }, seconds); }
      catch (e) { say(`KHÔNG KHỎE: ${n}: ${e.message}. Xem: docker logs bsn-${n}`); return { ok: false }; }
      say(`khỏe: ${n} tại http://127.0.0.1:${svc.port.local}${svc.health} (commit ${short(svc.commit)})`);
      // Ghi vào sổ deploy để rollback biết bản nào đã từng chạy khỏe ở đây.
      await ledger.append(n, { action: 'up', commit: svc.commit, from: null, result: 'ok', at: clock.now(), by });
    }
    return { ok: true };
  }

  /** input: { apply, volumes, say } */
  async function stop({ apply, volumes, say }) {
    const steps = [];
    if (await runtime.hasStack(STACK_KEY)) {
      steps.push({ text: 'tắt các dịch vụ', run: async () => { try { await runtime.removeStack(STACK_KEY); } catch (e) { throw new Error(`tắt dịch vụ hỏng: ${e.message}`); } } });
    }
    steps.push({ text: `tắt tầng dùng chung${volumes ? ' và XÓA dữ liệu local (volume)' : ' (giữ dữ liệu)'}`, run: async () => { await secrets.ensure([PG.secret]); await sharedTier.down({ volumes }); } });
    await runPlan(steps, { apply, say });
    return { ok: true };
  }

  return { start, stop, startSteps };
}

module.exports = { makeStack };
