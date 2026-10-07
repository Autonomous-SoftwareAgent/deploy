'use strict';
// Sổ deploy của MỘT đích, như một giá trị: đang chạy bản nào, bản liền trước, và nhật ký các lần đưa lên.
// Tờ khai báo nói dịch vụ MUỐN chạy gì; sổ nói điều ĐÃ XẢY RA trên đích (D-006). Thuần: cách lưu là việc của bộ nối.
const { COMMIT_RE, COMMIT_PREFIX_RE } = require('./naming');

const SCHEMA = 1;
const HISTORY_KEEP = 50;

const empty = () => ({ schema: SCHEMA, services: {} });

/**
 * Dữ liệu đọc từ nơi lưu có dùng được không. Không phải sổ thì coi là sổ trống; sổ do bản MỚI HƠN ghi thì ném lỗi,
 * để bản cũ không coi nó là trống rồi ghi đè (sổ chỉ đổi theo kiểu thêm vào).
 */
function accept(raw, where) {
  if (!raw || !raw.services || typeof raw.services !== 'object') return empty();
  if (Number(raw.schema) > SCHEMA) throw new Error(`sổ deploy ở ${where} có schema ${raw.schema}, bản lệnh này chỉ hiểu tới ${SCHEMA}: cập nhật repo deploy trước khi chạy`);
  return raw;
}

/** Ghi một dòng. Lần thành công thì cập nhật "đang chạy" và "liền trước". entry: {action, commit, from, result, reason?, at, by}. */
function record(ledger, name, entry) {
  const s = ledger.services[name] || (ledger.services[name] = { current: null, previous: null, history: [] });
  s.history.push(entry);
  if (s.history.length > HISTORY_KEEP) s.history.splice(0, s.history.length - HISTORY_KEEP);
  if (entry.result === 'ok' && (!s.current || s.current.commit !== entry.commit)) {
    if (s.current) s.previous = s.current;
    s.current = { commit: entry.commit, at: entry.at, action: entry.action };
  }
  return s;
}

const of = (ledger, name) => ledger.services[name] || null;

/** Commit này đã từng chạy và khỏe trên đích này chưa. */
const ranOk = (ledger, name, commit) => !!(of(ledger, name) && of(ledger, name).history.some((h) => h.commit === commit && h.result === 'ok'));

/** Đủ 40 ký tự của một commit từ tiền tố, trong số commit sổ đã ghi. Không thấy hoặc trùng nhiều: null. */
function resolveRef(ledger, name, ref) {
  if (COMMIT_RE.test(ref || '')) return ref;
  if (!COMMIT_PREFIX_RE.test(ref || '')) return null;
  const all = [...new Set(((of(ledger, name) || {}).history || []).map((h) => h.commit))].filter((c) => c.startsWith(ref));
  return all.length === 1 ? all[0] : null;
}

const previousCommit = (ledger, name) => (of(ledger, name) && of(ledger, name).previous ? of(ledger, name).previous.commit : null);

/** Lần đưa lên gần nhất do người hay agent yêu cầu (không tính lần tự bật lại bản cũ đi kèm nó). */
function lastRequested(ledger, name) {
  const s = of(ledger, name);
  return s ? [...s.history].reverse().find((h) => h.action === 'deploy' || h.action === 'rollback') || null : null;
}

/** Các dòng gần nhất, mới trước. */
const recent = (ledger, name, n) => (of(ledger, name) ? of(ledger, name).history.slice(-n).reverse() : []);

module.exports = { SCHEMA, HISTORY_KEEP, empty, accept, record, of, ranOk, resolveRef, previousCommit, lastRequested, recent };
