'use strict';
// Luật của một lần đưa lên: từ chối, không đổi gì, hay chuyển từ bản đang chạy sang bản khác; và hỏng thì bật lại bản nào.
// Thuần: mọi dữ kiện (đang chạy gì, đã có bản chưa, sổ ghi gì) do lớp application hỏi qua cổng rồi đưa vào.
const { OUTCOME } = require('./outcome');
const ledgerOf = require('./ledger');
const { short } = require('./naming');

const refuse = (outcome, reason, extra = {}) => ({ kind: 'refuse', outcome, reason, ...extra });
const noop = (from, to) => ({ kind: 'noop', from, to });
const change = (from, to) => ({ kind: 'switch', from, to });

/**
 * Deploy: đưa commit ĐÃ KHAI lên. Chỉ commit có bản đóng gói mới được đưa lên (khai báo trước, build sau: S-029).
 * facts: { name, declared, running, published, remote }
 */
function planDeploy({ name, declared, running, published, remote }) {
  if (!declared) return refuse(OUTCOME.NOT_DECLARED, `${name} chưa khai commit nào (chạy: node infra/bsn.js pin ${name} --apply)`);
  if (!published) return refuse(OUTCOME.WAITING_BUILD, `commit ${short(declared)} CHỜ BUILD: chưa có bản ${remote}. Không đổi gì. Bản sinh ra khi commit đó được đẩy lên main của dịch vụ và test qua.`, { from: running, to: declared });
  if (running === declared) return noop(running, declared);
  return change(running, declared);
}

/**
 * Rollback, bước 1: lùi về đâu. Lối đi riêng (S-023 mục 8): chỉ nhận bản ĐÃ TỪNG chạy khỏe trên đích này,
 * nên không chạy lại bước kiểm nào của bản mới.
 * facts: { name, ledger, running, ref }
 */
function planRollback({ name, ledger, running, ref }) {
  let to;
  if (ref) {
    to = ledgerOf.resolveRef(ledger, name, ref);
    if (!to) return refuse(OUTCOME.UNKNOWN_REF, `không tìm thấy đúng một commit "${ref}" trong sổ deploy của ${name} (chỉ lùi được về bản đã từng chạy ở đây)`, { from: running });
  } else {
    to = ledgerOf.previousCommit(ledger, name);
    if (!to) return refuse(OUTCOME.NO_PREVIOUS, `sổ deploy chưa ghi bản liền trước nào của ${name}: chưa có gì để lùi về`, { from: running });
  }
  if (!ledgerOf.ranOk(ledger, name, to)) return refuse(OUTCOME.NEVER_RAN_HERE, `commit ${short(to)} chưa từng chạy khỏe trên đích này; rollback chỉ lùi về bản đã từng chạy. Muốn chạy bản đó thì ghim rồi deploy.`, { from: running, to });
  if (running === to) return noop(running, to);
  return change(running, to);
}

/** Rollback, bước 2: bản để lùi về còn lấy được không (ở máy hoặc trên kho). */
function rollbackImageAvailable({ to, from, local, published }) {
  if (local || published) return null;
  return refuse(OUTCOME.IMAGE_GONE, `bản của ${short(to)} không còn ở máy và không còn trên Docker Hub (đã bị dọn). Chưa có cách build lại bằng workflow.`, { from, to });
}

/** Đưa bản mới lên hỏng: bật lại bản nào. Không có bản nào đang chạy trước đó thì không có gì để bật lại. */
const revertTarget = (from) => from || null;

module.exports = { planDeploy, planRollback, rollbackImageAvailable, revertTarget };
