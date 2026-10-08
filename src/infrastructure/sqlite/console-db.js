'use strict';
// spec: BDK-S-005
// DB của bảng điều khiển: MỘT tệp SQLite nằm cạnh bảng điều khiển (local/.run/console.db, không vào git), mở bằng module
// node:sqlite có sẵn trong Node nên không cần thư viện ngoài (D-014). Tệp này chỉ mở DB và giữ lược đồ; mỗi cổng lưu có bộ nối
// riêng ở console-stores.js. Bí mật của dịch vụ KHÔNG bao giờ vào đây; mật khẩu chỉ ở dạng băm.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Mỗi phần tử là một bước nâng lược đồ; số bước đã chạy ghi ở PRAGMA user_version. Chỉ thêm bước mới, không sửa bước cũ.
const MIGRATIONS = [`
  create table config_versions (version integer primary key, at text not null, by text not null, note text not null default '', config text not null);
  create table permissions (environment text not null, role text not null, level integer not null, primary key (environment, role));
  create table environment_protection (environment text primary key, approval integer not null, type_name integer not null, restrict_users integer not null,
    allowed_users text not null, freeze_on integer not null, freeze_from text not null, freeze_to text not null);
  create table audit (id integer primary key autoincrement, at text not null, actor text not null, action text not null, target text not null default '',
    detail text not null default '', outcome text not null default 'ok');
  create index audit_by_actor on audit (actor, id);
  create table members (name text primary key, role text not null, salt text not null, hash text not null, created_at text);
  create table approvals (id text primary key, status text not null, requested_at text not null, data text not null);
  create table runs (id text primary key, started_at text not null, status text not null, data text not null);
  create index runs_by_start on runs (started_at);
  create table targets (name text primary key, spec text not null, managed integer not null, state text not null, created_by text, created_at text, detail text not null default '');
  create table meta (key text primary key, value text not null);
`];

/** Mở (và tạo nếu chưa có) DB ở `file`; ':memory:' cho test. Trả đối tượng DatabaseSync đã ở đúng lược đồ. */
function openConsoleDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // WAL: đọc không chặn ghi; một tiến trình bảng điều khiển ghi tại một thời điểm. foreign_keys bật sẵn cho các bước lược đồ sau này.
  if (file !== ':memory:') db.exec('pragma journal_mode = WAL');
  db.exec('pragma foreign_keys = ON; pragma busy_timeout = 5000');
  const at = db.prepare('pragma user_version').get().user_version;
  // Không mở được thì phải đóng tệp trước khi báo lỗi: tệp đang mở thì không ai xóa hay thay nó được.
  if (at > MIGRATIONS.length) { db.close(); throw new Error(`console.db has schema ${at}; this version understands up to ${MIGRATIONS.length}`); }
  for (let i = at; i < MIGRATIONS.length; i++) {
    db.exec('begin');
    try { db.exec(MIGRATIONS[i]); db.exec(`pragma user_version = ${i + 1}`); db.exec('commit'); }
    catch (e) { db.exec('rollback'); db.close(); throw e; }
  }
  return db;
}

/** Chạy fn trong một giao dịch: xong hết thì ghi, ném lỗi thì không ghi gì. */
function transaction(db, fn) {
  db.exec('begin immediate');
  try { const out = fn(); db.exec('commit'); return out; }
  catch (e) { db.exec('rollback'); throw e; }
}

module.exports = { openConsoleDb, transaction, SCHEMA_VERSION: MIGRATIONS.length };
