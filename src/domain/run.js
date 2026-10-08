'use strict';
// Một LẦN CHẠY trên bảng điều khiển: nhiều mục, mỗi mục là một dịch vụ được đưa lên (hoặc lùi) ở một môi trường.
// Mỗi mục đi qua các bước thật của lệnh điều khiển; hỏng thì lệnh tự bật lại bản cũ (pha revert).
// Thuần: sự kiện do bộ chạy việc báo về, tệp này chỉ đổi chúng thành trạng thái để vẽ.

const STEP_NAMES = Object.freeze(['fetch', 'start', 'health', 'record']);
const ITEM = Object.freeze({ RUNNING: 'running', SUCCEEDED: 'succeeded', FAILED: 'failed', ROLLING_BACK: 'rolling_back', ROLLED_BACK: 'rolled_back' });
const TERMINAL = new Set([ITEM.SUCCEEDED, ITEM.FAILED, ITEM.ROLLED_BACK]);

const freshSteps = () => STEP_NAMES.map((name) => ({ name, status: 'pending' }));

function newItem({ serviceId, fromSha, toSha }) {
  return { serviceId, fromSha: fromSha || null, toSha, status: ITEM.RUNNING, steps: freshSteps(), reason: '' };
}

/** Áp một sự kiện bước {step, status, phase} vào mục. Bước lạ thì bỏ qua (bản lệnh mới hơn có thể thêm bước). */
function applyStep(item, { step, status, phase }) {
  if (phase === 'revert') {
    // Bản mới đã hỏng: mục chuyển sang "đang bật lại bản cũ"; các bước của lần đưa lên giữ nguyên để thấy hỏng ở đâu.
    if (item.status === ITEM.RUNNING) item.status = ITEM.ROLLING_BACK;
    return item;
  }
  const s = item.steps.find((x) => x.name === step);
  if (s && ['running', 'succeeded', 'failed'].includes(status)) s.status = status;
  return item;
}

/** Áp kết quả cuối của lệnh vào mục. */
function applyResult(item, result) {
  const r = result || {};
  if (r.ok) {
    item.status = ITEM.SUCCEEDED;
    // Lần "không đổi gì" hay bộ chạy việc không báo bước: coi mọi bước chưa hỏng là xong.
    for (const s of item.steps) if (s.status !== 'failed') s.status = 'succeeded';
    return item;
  }
  item.reason = r.reason || 'lệnh không trả lý do';
  item.outcome = r.outcome || null;
  item.status = r.reverted === 'ok' ? ITEM.ROLLED_BACK : ITEM.FAILED;
  for (const s of item.steps) if (s.status === 'running') s.status = 'failed';
  return item;
}

const itemDone = (item) => TERMINAL.has(item.status);

/** Trạng thái của cả lần chạy, từ các mục. */
function runStatus(items) {
  if (!items.every(itemDone)) return 'running';
  if (items.every((i) => i.status === ITEM.SUCCEEDED)) return 'succeeded';
  return items.some((i) => i.status === ITEM.FAILED) ? 'failed' : 'rolled_back';
}

module.exports = { STEP_NAMES, ITEM, newItem, applyStep, applyResult, itemDone, runStatus };
