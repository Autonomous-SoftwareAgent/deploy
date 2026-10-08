'use strict';
// spec: BDK-S-004
// Ca sử dụng CẤU HÌNH của bảng điều khiển: màu, thứ tự, mức bảo vệ của từng môi trường, bảng phân quyền theo vai trò, ánh xạ nhánh.
// Mỗi lần lưu là một PHIÊN BẢN mới (ai, lúc nào, ghi chú); lưu phải kèm số phiên bản đang sửa, lệch thì từ chối để hai người
// cùng sửa không ghi đè nhau. Khôi phục một phiên bản cũ cũng là lưu một phiên bản mới. Cấu hình không chứa bí mật nào.
const access = require('../domain/access');
const branches = require('../domain/branches');

const SCHEMA = 1;
const KEEP = 50;
const refuse = (outcome, reason, extra = {}) => ({ ok: false, outcome, reason, ...extra });

/** Mọi lá của một đối tượng thành "đường.dẫn" -> giá trị, để so hai bản cấu hình. */
function flatten(value, at = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) for (const k of Object.keys(value)) flatten(value[k], at ? `${at}.${k}` : k, out);
  else out[at] = JSON.stringify(value === undefined ? null : value);
  return out;
}

/** Khác nhau giữa hai bản cấu hình: [{path, from, to}] (from, to là chuỗi JSON; null khi không có). */
function diff(before, after) {
  const a = flatten(before); const b = flatten(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter((k) => a[k] !== b[k]).map((k) => ({ path: k, from: a[k] === undefined ? null : a[k], to: b[k] === undefined ? null : b[k] }));
}

/**
 * @param {{configStore: import('./ports').ConfigStore, clock: import('./ports').Clock, environmentIds: () => string[],
 *          services: () => Promise<{id: string, project: string}[]>, audit: {record: Function}}} deps
 */
function makeSettings({ configStore, clock, environmentIds, services, audit }) {
  async function load() {
    const rec = await configStore.load();
    if (rec && Number(rec.schema) > SCHEMA) throw new Error(`console configuration has schema ${rec.schema}; this version understands up to ${SCHEMA}`);
    return rec && rec.config ? rec : { schema: SCHEMA, version: 0, config: {}, history: [] };
  }
  const meta = (h) => ({ version: h.version, at: h.at, by: h.by, note: h.note || '' });

  /** Cấu hình đang có hiệu lực, đã bù mặc định cho môi trường chưa được đặt gì. */
  async function get() {
    const rec = await load();
    return { version: rec.version, config: access.normalize(rec.config, environmentIds()), versions: rec.history.map(meta).reverse() };
  }

  async function write(rec, config, by, note) {
    const version = rec.version + 1;
    const history = [...rec.history, { version, at: clock.now(), by, note: String(note || '').slice(0, 200), config }].slice(-KEEP);
    await configStore.save({ schema: SCHEMA, version, config, history });
    return version;
  }

  /** Xem trước: bản nháp có hợp lệ không và đổi những gì so với bản đang có hiệu lực. Không ghi gì. */
  async function preview(draft) {
    const rec = await load();
    const ids = environmentIds();
    const next = access.normalize(draft, ids);
    return { ok: true, errors: access.configErrors(next, ids), changes: diff(access.normalize(rec.config, ids), next), version: rec.version };
  }

  async function save({ config, expectedVersion, by, note }) {
    const rec = await load();
    if (expectedVersion !== rec.version) return refuse('CONFLICT', `the configuration changed while you were editing (now version ${rec.version}); reload and apply your changes again`, { version: rec.version });
    const ids = environmentIds();
    const next = access.normalize(config, ids);
    const errors = access.configErrors(next, ids);
    if (errors.length) return refuse('BAD_INPUT', `invalid configuration: ${errors.join('; ')}`, { errors });
    const changes = diff(access.normalize(rec.config, ids), next);
    if (!changes.length) return refuse('BAD_INPUT', 'nothing changed');
    const version = await write(rec, next, by, note);
    await audit.record({ actor: by, action: 'config.save', target: `version ${version}`, detail: `${changes.length} change(s)${note ? `: ${note}` : ''}` });
    return { ok: true, version, changes };
  }

  /** Lấy lại nội dung của một phiên bản cũ, ghi thành phiên bản mới nhất. */
  async function restore(version, by) {
    const rec = await load();
    const old = rec.history.find((h) => h.version === version);
    if (!old) return refuse('NOT_FOUND', `version ${version} is not in the history (the last ${KEEP} versions are kept)`);
    const next = await write(rec, access.normalize(old.config, environmentIds()), by, `restored version ${version}`);
    await audit.record({ actor: by, action: 'config.restore', target: `version ${next}`, detail: `from version ${version}` });
    return { ok: true, version: next };
  }

  /** Về mặc định: không môi trường nào bị khóa, vai trò nào cũng deploy và rollback được, không ánh xạ nhánh. */
  async function reset(by) {
    const rec = await load();
    const version = await write(rec, access.normalize({}, environmentIds()), by, 'reset to defaults');
    await audit.record({ actor: by, action: 'config.reset', target: `version ${version}`, detail: '' });
    return { ok: true, version };
  }

  /** Bảng dịch vụ x môi trường của ánh xạ nhánh, và kết quả thử một tên nhánh. */
  async function branchMatrix() {
    const { config } = await get();
    return branches.matrix(config.branches, await services(), environmentIds());
  }
  async function testBranch(branch, serviceId) {
    if (typeof branch !== 'string' || !branch.trim() || branch.length > 200) return refuse('BAD_INPUT', 'branch: a non-empty name');
    const { config } = await get();
    const svc = serviceId ? (await services()).find((s) => s.id === serviceId) || null : null;
    if (serviceId && !svc) return refuse('UNKNOWN_SERVICE', `unknown service ${serviceId}`);
    return { ok: true, branch: branch.trim(), ...branches.test(config.branches, branch.trim(), svc, environmentIds()) };
  }

  return { get, preview, save, restore, reset, branchMatrix, testBranch };
}

module.exports = { makeSettings, diff };
