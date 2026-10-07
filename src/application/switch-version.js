'use strict';
// Khung chung của deploy và rollback: bật ĐÚNG một commit của một dịch vụ, chờ khỏe; không được thì bật lại bản đang
// chạy trước đó; mọi kết quả ghi vào sổ deploy. Trả kết quả, không ném lỗi cho việc đã lường trước.
const { short, localImage } = require('../domain/naming');
const { composeFor } = require('../domain/stack-plan');
const { revertTarget } = require('../domain/deploy-policy');
const { OUTCOME } = require('../domain/outcome');
const { runSubSteps } = require('./plan');

/**
 * @param {{runtime: import('./ports').Runtime, configFiles: import('./ports').ConfigFiles, health: import('./ports').Health,
 *          ledger: import('./ports').Ledger, clock: import('./ports').Clock, images: ReturnType<import('./images').makeImages>}} ports
 */
function makeSwitchVersion({ runtime, configFiles, health, ledger, clock, images }) {
  /** Bật đúng một commit rồi chờ khỏe. Ném lỗi nếu không bật được hoặc không khỏe. */
  async function bringUp(manifest, name, commit, d) {
    const at = { ...manifest, services: { ...manifest.services, [name]: { ...manifest.services[name], commit } } };
    const svc = at.services[name];
    const main = localImage(name, commit);
    if (!(await runtime.hasImage(main))) d.say(`   - đã kéo ${await images.fetch(at, name, { verbose: d.verbose })}`);
    // Bản có sẵn ở máy cũng phải đúng commit: nhãn tên trùng chưa đủ.
    const inside = await runtime.imageCommit(main);
    if (inside !== commit) throw new Error(`ảnh ${main} ở máy ghi commit "${inside || '(không đọc được)'}", khác commit cần chạy ${commit}`);
    const missing = await images.missing(name, svc, { mainToo: false });
    if (missing.size || (await configFiles.stale(name, svc))) await runSubSteps(images.buildSteps(at, name, { only: missing, verbose: d.verbose }), d.say);
    // Mô tả chỉ có MỘT dịch vụ và không dọn "mồ côi": các dịch vụ khác phải được để yên.
    try { await runtime.applyStack(`deploy.${name}`, composeFor(at, [name], d.secrets, configFiles.hostPath)); }
    catch (e) { throw new Error(`bật ${name} hỏng: ${e.message}`); }
    await health.waitHealthy({ port: svc.port.local, path: svc.health }, d.seconds);
  }

  /**
   * Đưa `to` lên; không được thì bật lại `from` (nếu có).
   * d: { action: 'deploy'|'rollback', secrets, seconds, by, say, verbose? }
   */
  return async function switchVersion(manifest, name, from, to, d) {
    await ledger.read(); // sổ đọc không được (do bản mới hơn ghi) thì dừng TRƯỚC khi đổi gì
    const entry = (fields) => ledger.append(name, { ...fields, at: clock.now(), by: d.by });
    const out = { ok: false, service: name, action: d.action, from, to, healthy: false, reverted: null, reason: '' };
    try {
      await bringUp(manifest, name, to, d);
      await entry({ action: d.action, commit: to, from, result: 'ok' });
      return { ...out, ok: true, healthy: true };
    } catch (e) {
      out.reason = e.message;
      out.outcome = OUTCOME.SWITCH_FAILED;
      await entry({ action: d.action, commit: to, from, result: 'failed', reason: e.message });
      d.say(`KHÔNG ĐƯA LÊN ĐƯỢC ${name} ${short(to)}: ${e.message}`);
    }
    const back = revertTarget(from);
    if (!back) {
      out.reverted = 'none';
      d.say(`Không có bản nào đang chạy trước đó để bật lại. ${name} đang ở trạng thái hỏng: xem docker logs bsn-${name}.`);
      return out;
    }
    d.say(`Tự bật lại bản đang chạy trước đó: ${short(back)}`);
    try {
      await bringUp(manifest, name, back, d);
      await entry({ action: 'auto-revert', commit: back, from: to, result: 'ok' });
      out.reverted = 'ok';
      d.say(`Đã bật lại ${name} ${short(back)} và nó khỏe. Bản ${short(to)} KHÔNG được dùng.`);
    } catch (e2) {
      await entry({ action: 'auto-revert', commit: back, from: to, result: 'failed', reason: e2.message });
      out.reverted = 'failed';
      d.say(`BẬT LẠI BẢN CŨ CŨNG HỎNG: ${e2.message}. ${name} đang KHÔNG chạy đúng: xem docker logs bsn-${name}.`);
    }
    return out;
  };
}

module.exports = { makeSwitchVersion };
