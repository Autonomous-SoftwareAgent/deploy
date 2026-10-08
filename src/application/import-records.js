'use strict';
// spec: BDK-S-005
// Chép MỘT LẦN dữ liệu của bảng điều khiển từ các tệp cũ (console.config.json, console.audit.jsonl, người dùng trong
// console.auth.json) sang các cổng lưu mới (DB). Tệp cũ được giữ nguyên, không xóa. Lần sau thấy dấu đã chép thì bỏ qua.
const MARK = 'imported_file_records';

/**
 * from: { configStore, auditLog, credentials } đọc tệp cũ; to: { configStore, auditLog, members, meta } là nơi lưu mới.
 * Trả { imported: false } nếu đã chép rồi, không thì { imported: true, versions, auditEntries, members }.
 */
function makeImportRecords({ from, to, clock }) {
  return async function importRecords() {
    if (await to.meta.get(MARK)) return { imported: false };
    const out = { imported: true, versions: 0, auditEntries: 0, members: 0 };
    const cfg = await from.configStore.load();
    if (cfg && cfg.config && !(await to.configStore.load())) { await to.configStore.save(cfg); out.versions = (cfg.history || []).length; }
    // Sổ cũ đọc mới trước; chép theo thứ tự cũ trước để thứ tự trong DB đúng với thời gian.
    for (const e of (await from.auditLog.list(100000)).reverse()) { await to.auditLog.append(e); out.auditEntries += 1; }
    const cred = await from.credentials.load();
    for (const u of (cred && cred.users) || []) if (!(await to.members.get(u.name))) { await to.members.put(u); out.members += 1; }
    await to.meta.set(MARK, clock.now());
    return out;
  };
}

module.exports = { makeImportRecords };
