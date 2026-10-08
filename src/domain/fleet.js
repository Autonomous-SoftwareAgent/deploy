'use strict';
// Luật của màn TỔNG QUAN và của bước KIỂM TRA TRƯỚC trên bảng điều khiển: một dịch vụ ở một môi trường đang ra sao,
// lệch bao nhiêu commit so với bản đã khai, dịch vụ nào cần chú ý trước, và một yêu cầu deploy hay rollback có bị chặn không.
// Thuần: mọi dữ kiện (trạng thái của môi trường, lịch sử commit, nhãn trên kho) do lớp application hỏi qua cổng rồi đưa vào.
// Môi trường là dữ liệu: tệp này không biết tên môi trường nào.
const { short } = require('./naming');

const HEALTH = Object.freeze({ HEALTHY: 'healthy', DEPLOYING: 'deploying', FAILED: 'failed' });
const BUILD = Object.freeze({ PASSED: 'passed', NONE: 'none', UNKNOWN: 'unknown' });

const BLOCK = Object.freeze({
  ENV_UNREACHABLE: 'ENV_UNREACHABLE', // không hỏi được môi trường
  NOT_IN_ENVIRONMENT: 'NOT_IN_ENVIRONMENT', // môi trường không có dịch vụ này
  COMMIT_UNKNOWN: 'COMMIT_UNKNOWN', // không xác định được commit đích
  ALREADY_RUNNING: 'ALREADY_RUNNING', // commit đích đang chạy
  BUILD_NOT_READY: 'BUILD_NOT_READY', // commit đích chưa có bản đóng gói (S-029)
  NOTHING_TO_ROLLBACK: 'NOTHING_TO_ROLLBACK', // chưa có bản đang chạy hoặc chưa có bản liền trước
  ROLLBACK_TARGET_NEWER: 'ROLLBACK_TARGET_NEWER', // lùi về commit mới hơn bản đang chạy
  NEVER_RAN_HERE: 'NEVER_RAN_HERE', // rollback chỉ về bản đã từng chạy khỏe ở môi trường này
  RUN_IN_PROGRESS: 'RUN_IN_PROGRESS', // dịch vụ đang có một lần đưa lên chạy dở ở môi trường này
});
const WARN = Object.freeze({
  DEPLOY_OLDER_COMMIT: 'DEPLOY_OLDER_COMMIT', // deploy một commit cũ hơn bản đang chạy
  NOT_IN_HISTORY: 'NOT_IN_HISTORY', // không thấy commit trong lịch sử ở máy này nên không liệt kê được thay đổi
  BUILD_UNKNOWN: 'BUILD_UNKNOWN', // không hỏi được kho bản; lệnh deploy sẽ tự kiểm lại
});

/** Sức khỏe của một dịch vụ ở một môi trường, từ một dòng trạng thái của môi trường đó. Chưa deploy: null. */
function healthOf(row) {
  if (!row) return null;
  if (row.busy) return HEALTH.DEPLOYING;
  if (!row.running) return row.deployed ? HEALTH.FAILED : null;
  const s = String(row.containerStatus || '').toLowerCase();
  if (s.includes('unhealthy')) return HEALTH.FAILED;
  if (s.includes('starting')) return HEALTH.DEPLOYING;
  return HEALTH.HEALTHY;
}

/** Số commit từ bản đang chạy (không tính) tới bản đã khai (có tính), theo lịch sử mới trước. Không so được: 0. */
function behindCount(shas, running, declared) {
  if (!running || !declared || running === declared) return 0;
  const d = shas.indexOf(declared); const r = shas.indexOf(running);
  return d >= 0 && r >= 0 && d < r ? r - d : 0;
}

/** Điểm ưu tiên: hỏng trước, rồi đang đưa lên, rồi lệch phiên bản. cells: [{health, behindCount}]. */
function priorityScore(cells) {
  let failed = 0; let deploying = 0; let behind = 0;
  for (const c of cells) {
    if (c.health === HEALTH.FAILED) failed += 1;
    if (c.health === HEALTH.DEPLOYING) deploying += 1;
    behind += c.behindCount || 0;
  }
  return failed * 1000 + deploying * 500 + Math.min(behind, 99);
}

/** Bản của một commit đã có trên kho chưa. tags: Set các nhãn, hoặc null khi không hỏi được kho. */
function buildOf(tags, branch, commit) {
  if (!tags) return BUILD.UNKNOWN;
  return tags.has(`${branch}-${short(commit)}`) ? BUILD.PASSED : BUILD.NONE;
}

/**
 * Các commit nằm giữa bản đang chạy và commit đích. shas: lịch sử mới trước.
 * Trả { direction: 'forward' (sẽ được đưa lên) | 'backward' (sẽ bị gỡ) | 'same', shas: [...] } hoặc null khi không so được.
 */
function changesBetween(shas, from, to) {
  const f = shas.indexOf(from); const t = shas.indexOf(to);
  if (f < 0 || t < 0) return null;
  if (f === t) return { direction: 'same', shas: [] };
  return t < f ? { direction: 'forward', shas: shas.slice(t, f) } : { direction: 'backward', shas: shas.slice(f, t) };
}

/** Các commit đã từng chạy khỏe ở môi trường (từ các dòng sổ mà môi trường trả về), mới trước, không lặp. */
function ranOkCommits(row) {
  const out = [];
  for (const h of (row && row.history) || []) if (h.result === 'ok' && !out.includes(h.commit)) out.push(h.commit);
  return out;
}

/**
 * Kiểm tra trước MỘT mục. facts:
 *   kind 'deploy'|'rollback'; reachable: hỏi được môi trường không; row: dòng trạng thái của dịch vụ ở môi trường (hoặc null);
 *   target: commit đích đủ 40 ký tự (hoặc null); shas: lịch sử mới trước; build: BUILD.*; localImage: bản đã có sẵn ở môi trường không.
 * Trả { from, to, firstDeploy, direction, changes: [sha], blockers: [{code, message}], warnings: [{code, message}] }.
 */
function preflightItem({ kind, reachable, row, target, shas, build, name, environmentName }) {
  const blockers = []; const warnings = [];
  const block = (code, message) => blockers.push({ code, message });
  const warn = (code, message) => warnings.push({ code, message });
  const from = row && row.running ? row.runningCommit || null : null;
  const out = { from, to: target || null, firstDeploy: !from, direction: 'same', changes: [], blockers, warnings };
  if (!reachable) { block(BLOCK.ENV_UNREACHABLE, `Không hỏi được môi trường ${environmentName}.`); return out; }
  if (!row) { block(BLOCK.NOT_IN_ENVIRONMENT, `Môi trường ${environmentName} không có dịch vụ ${name}.`); return out; }
  if (row.busy) block(BLOCK.RUN_IN_PROGRESS, `${name} đang có một lần đưa lên chạy dở ở ${environmentName}.`);
  if (kind === 'rollback' && !from) { block(BLOCK.NOTHING_TO_ROLLBACK, `Chưa có bản đang chạy ở ${environmentName} để rollback.`); return out; }
  if (!target) { block(kind === 'rollback' ? BLOCK.NOTHING_TO_ROLLBACK : BLOCK.COMMIT_UNKNOWN, kind === 'rollback' ? `Sổ deploy của ${environmentName} chưa ghi bản liền trước nào của ${name}.` : `${name} chưa khai commit nào để deploy.`); return out; }
  if (from === target) { block(BLOCK.ALREADY_RUNNING, `Commit ${short(target)} đang chạy ở ${environmentName}.`); return out; }
  const diff = from ? changesBetween(shas, from, target) : null;
  if (diff) { out.direction = diff.direction; out.changes = diff.shas; }
  else if (from) warn(WARN.NOT_IN_HISTORY, 'Không thấy cả hai commit trong lịch sử ở máy này nên không liệt kê được thay đổi.');
  if (kind === 'rollback') {
    if (diff && diff.direction === 'forward') block(BLOCK.ROLLBACK_TARGET_NEWER, 'Commit đích mới hơn bản đang chạy. Rollback phải về commit cũ hơn.');
    if (!ranOkCommits(row).includes(target)) block(BLOCK.NEVER_RAN_HERE, `Commit ${short(target)} chưa từng chạy khỏe ở ${environmentName}; rollback chỉ lùi về bản đã từng chạy ở đó.`);
    return out;
  }
  if (build === BUILD.NONE) block(BLOCK.BUILD_NOT_READY, `Commit ${short(target)} chưa có bản đóng gói. Bản chỉ sinh ra cho commit được khai trong tờ khai báo và đã qua CI.`);
  if (build === BUILD.UNKNOWN) warn(WARN.BUILD_UNKNOWN, 'Không hỏi được kho bản đóng gói; lệnh deploy sẽ tự kiểm lại và từ chối nếu chưa có bản.');
  if (diff && diff.direction === 'backward') warn(WARN.DEPLOY_OLDER_COMMIT, 'Commit đích cũ hơn bản đang chạy: thao tác này lùi phiên bản. Dùng Rollback nếu muốn ghi nhận đúng loại.');
  return out;
}

module.exports = { HEALTH, BUILD, BLOCK, WARN, healthOf, behindCount, priorityScore, buildOf, changesBetween, ranOkCommits, preflightItem };
