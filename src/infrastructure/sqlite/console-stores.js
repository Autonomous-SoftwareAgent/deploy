'use strict';
// spec: BDK-S-005
// Bộ nối SQLite cho các cổng lưu của bảng điều khiển, cùng dùng một DB (console-db.js): cấu hình có phiên bản, sổ thao tác,
// thành viên, yêu cầu chờ duyệt, lịch sử lần chạy, môi trường do trang thêm. Mỗi cổng một hàm dựng; không cổng nào biết cổng khác.
const { transaction } = require('./console-db');

const json = (v) => JSON.stringify(v);
const bit = (v) => (v ? 1 : 0);

/** Cổng ConfigStore. Mỗi phiên bản một dòng; bảng phân quyền và bảng mức bảo vệ được ghi lại theo phiên bản mới nhất, cùng giao dịch. */
function makeSqliteConfigStore(db) {
  return {
    async load() {
      const rows = db.prepare('select version, at, by, note, config from config_versions order by version desc limit 50').all().reverse();
      if (!rows.length) return null;
      const history = rows.map((r) => ({ version: r.version, at: r.at, by: r.by, note: r.note, config: JSON.parse(r.config) }));
      const last = history[history.length - 1];
      return { schema: 1, version: last.version, config: last.config, history };
    },
    async save(record) {
      transaction(db, () => {
        const max = db.prepare('select coalesce(max(version), 0) v from config_versions').get().v;
        const add = db.prepare('insert into config_versions (version, at, by, note, config) values (?, ?, ?, ?, ?)');
        for (const h of record.history) if (h.version > max) add.run(h.version, h.at, h.by, h.note || '', json(h.config));
        db.exec('delete from permissions; delete from environment_protection');
        const perm = db.prepare('insert into permissions (environment, role, level) values (?, ?, ?)');
        const prot = db.prepare('insert into environment_protection (environment, approval, type_name, restrict_users, allowed_users, freeze_on, freeze_from, freeze_to) values (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const [env, roles] of Object.entries(record.config.permissions || {})) for (const [role, level] of Object.entries(roles)) perm.run(env, role, level);
        for (const [env, e] of Object.entries(record.config.environments || {})) {
          const p = e.protect;
          prot.run(env, bit(p.approval), bit(p.typeName), bit(p.restrict), json(p.allowedUsers || []), bit(p.freeze.on), p.freeze.from, p.freeze.to);
        }
      });
    },
  };
}

/** Cổng AuditLog: chỉ thêm. Lọc theo người, theo loại việc (tiền tố), theo chữ có trong đích hay chi tiết. */
function makeSqliteAuditLog(db) {
  const add = db.prepare('insert into audit (at, actor, action, target, detail, outcome) values (?, ?, ?, ?, ?, ?)');
  return {
    async append(e) { add.run(e.at, e.actor, e.action, e.target || '', e.detail || '', e.outcome || 'ok'); },
    async list(limit, filter = {}) {
      const where = []; const args = [];
      if (filter.actor) { where.push('actor = ?'); args.push(filter.actor); }
      if (filter.action) { where.push('action like ?'); args.push(`${filter.action.replace(/[%_]/g, '')}%`); }
      if (filter.outcome) { where.push('outcome = ?'); args.push(filter.outcome); }
      if (filter.q) { where.push("(target like ? escape '\\' or detail like ? escape '\\')"); const q = `%${filter.q.replace(/[\\%_]/g, '\\$&')}%`; args.push(q, q); }
      const sql = `select at, actor, action, target, detail, outcome from audit ${where.length ? `where ${where.join(' and ')}` : ''} order by id desc limit ?`;
      return db.prepare(sql).all(...args, limit).map((r) => ({ ...r }));
    },
  };
}

/** Cổng Members: người dùng ngoài admin. Mật khẩu chỉ ở dạng băm chậm có muối. */
function makeSqliteMembers(db) {
  const row = (r) => (r ? { name: r.name, role: r.role, salt: r.salt, hash: r.hash, createdAt: r.created_at } : null);
  return {
    async list() { return db.prepare('select * from members order by name').all().map(row); },
    async get(name) { return row(db.prepare('select * from members where name = ?').get(name)); },
    async put(m) {
      db.prepare('insert into members (name, role, salt, hash, created_at) values (?, ?, ?, ?, ?) on conflict (name) do update set role = excluded.role, salt = excluded.salt, hash = excluded.hash')
        .run(m.name, m.role, m.salt, m.hash, m.createdAt || null);
    },
    async remove(name) { return db.prepare('delete from members where name = ?').run(name).changes > 0; },
  };
}

/** Một bảng "mã -> đối tượng JSON" kèm một cột để sắp và một cột trạng thái: dùng cho yêu cầu chờ duyệt và lịch sử lần chạy. */
function documents(db, table, orderColumn, orderOf) {
  const put = db.prepare(`insert into ${table} (id, status, ${orderColumn}, data) values (?, ?, ?, ?) on conflict (id) do update set status = excluded.status, data = excluded.data`);
  return {
    async put(doc) { put.run(doc.id, doc.status, orderOf(doc), json(doc)); },
    /** Cũ trước, tối đa `limit` đối tượng mới nhất. */
    async recent(limit) { return db.prepare(`select data from ${table} order by ${orderColumn} desc, id desc limit ?`).all(limit).map((r) => JSON.parse(r.data)).reverse(); },
  };
}
const makeSqliteApprovalStore = (db) => documents(db, 'approvals', 'requested_at', (a) => a.requestedAt);
const makeSqliteRunStore = (db) => documents(db, 'runs', 'started_at', (r) => r.startedAt);

/** Cổng TargetStore: môi trường do trang thêm (máy đã có, hoặc máy do bảng điều khiển tạo: managed). */
function makeSqliteTargetStore(db) {
  const row = (r) => ({ name: r.name, spec: JSON.parse(r.spec), managed: !!r.managed, state: r.state, createdBy: r.created_by, createdAt: r.created_at, detail: r.detail });
  return {
    async list() { return db.prepare('select * from targets order by created_at, name').all().map(row); },
    async put(t) {
      db.prepare('insert into targets (name, spec, managed, state, created_by, created_at, detail) values (?, ?, ?, ?, ?, ?, ?) on conflict (name) do update set spec = excluded.spec, managed = excluded.managed, state = excluded.state, detail = excluded.detail')
        .run(t.name, json(t.spec), bit(t.managed), t.state, t.createdBy || null, t.createdAt || null, t.detail || '');
    },
    async remove(name) { return db.prepare('delete from targets where name = ?').run(name).changes > 0; },
  };
}

/** Dấu "đã làm một việc một lần" (ví dụ đã chép dữ liệu từ tệp cũ vào DB). */
function makeSqliteMeta(db) {
  return {
    async get(key) { const r = db.prepare('select value from meta where key = ?').get(key); return r ? r.value : null; },
    async set(key, value) { db.prepare('insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value').run(key, String(value)); },
  };
}

module.exports = { makeSqliteConfigStore, makeSqliteAuditLog, makeSqliteMembers, makeSqliteApprovalStore, makeSqliteRunStore, makeSqliteTargetStore, makeSqliteMeta };
