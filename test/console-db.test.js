'use strict';
// DB của bảng điều khiển (SQLite, D-014): cùng một bộ kiểm cho bộ nối SQLite và bộ nối trong bộ nhớ của từng cổng lưu;
// dữ liệu còn nguyên sau khi mở lại tệp; chép một lần từ các tệp cũ; yêu cầu chờ duyệt và lịch sử lần chạy sống qua lần khởi động lại.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { memoryPorts } = require('../src/composition');
const { emptyWorld } = require('../src/infrastructure/memory/world');
const { openConsoleDb, transaction, SCHEMA_VERSION } = require('../src/infrastructure/sqlite/console-db');
const sqlite = require('../src/infrastructure/sqlite/console-stores');
const { makeFsConfigStore, makeFsAuditLog } = require('../src/infrastructure/fs-console-records');
const { makeImportRecords } = require('../src/application/import-records');
const { makeApprovals } = require('../src/application/approvals');
const { makeRuns } = require('../src/application/runs');
const { PORTS, assertPort } = require('../src/application/ports');
const access = require('../src/domain/access');

const sqliteStores = (db) => ({ configStore: sqlite.makeSqliteConfigStore(db), auditLog: sqlite.makeSqliteAuditLog(db), members: sqlite.makeSqliteMembers(db), approvalStore: sqlite.makeSqliteApprovalStore(db), runStore: sqlite.makeSqliteRunStore(db), targetStore: sqlite.makeSqliteTargetStore(db), meta: sqlite.makeSqliteMeta(db) });
const KINDS = [['SQLite', () => sqliteStores(openConsoleDb(':memory:'))], ['trong bộ nhớ', () => memoryPorts(emptyWorld())]];
const CONFIG = access.normalize({}, ['thu', 'that']);

for (const [kind, make] of KINDS) {
  test(`[${kind}] các cổng lưu của bảng điều khiển có đủ hàm đã khai`, () => {
    const p = make();
    for (const name of ['configStore', 'auditLog', 'members', 'approvalStore', 'runStore', 'targetStore', 'meta']) assert.doesNotThrow(() => assertPort(name, p[name]), name);
    assert.ok(PORTS.members && PORTS.targetStore);
  });

  test(`[${kind}] ConfigStore: mỗi phiên bản được giữ; đọc lại trả phiên bản mới nhất kèm lịch sử`, async () => {
    const { configStore } = make();
    assert.equal(await configStore.load(), null);
    const v1 = { version: 1, at: 't1', by: 'an', note: 'đầu', config: CONFIG };
    await configStore.save({ schema: 1, version: 1, config: CONFIG, history: [v1] });
    const next = JSON.parse(JSON.stringify(CONFIG)); next.permissions.that.Developer = 0;
    await configStore.save({ schema: 1, version: 2, config: next, history: [v1, { version: 2, at: 't2', by: 'binh', note: '', config: next }] });
    const got = await configStore.load();
    assert.deepEqual([got.version, got.config.permissions.that.Developer, got.history.map((h) => [h.version, h.by])], [2, 0, [[1, 'an'], [2, 'binh']]]);
  });

  test(`[${kind}] AuditLog: mới trước, có giới hạn, lọc theo người, loại việc, kết quả và chữ`, async () => {
    const { auditLog } = make();
    await auditLog.append({ at: 't1', actor: 'an', action: 'deploy.start', target: 'shop @ thu', detail: 'run 1', outcome: 'ok' });
    await auditLog.append({ at: 't2', actor: 'binh', action: 'deploy.refused', target: 'shop @ that', detail: 'FORBIDDEN', outcome: 'refused' });
    await auditLog.append({ at: 't3', actor: 'an', action: 'config.save', target: 'version 2', detail: '100% chắc', outcome: 'ok' });
    assert.deepEqual((await auditLog.list(2)).map((e) => e.at), ['t3', 't2']);
    assert.deepEqual((await auditLog.list(10, { actor: 'an' })).map((e) => e.at), ['t3', 't1']);
    assert.deepEqual((await auditLog.list(10, { action: 'deploy' })).map((e) => e.at), ['t2', 't1']);
    assert.deepEqual((await auditLog.list(10, { outcome: 'refused' })).map((e) => e.actor), ['binh']);
    assert.deepEqual((await auditLog.list(10, { q: 'THAT' })).map((e) => e.at), ['t2']);
    assert.deepEqual((await auditLog.list(10, { q: '%' })).map((e) => e.at), ['t3'], 'dấu % trong chữ tìm là chữ thường, không phải ký tự đại diện');
  });

  test(`[${kind}] Members: thêm, lấy theo tên, thay vai trò giữ ngày tạo, xóa; TargetStore và Meta ghi rồi đọc lại đúng`, async () => {
    const { members, targetStore, meta } = make();
    assert.equal(await members.get('lan'), null);
    await members.put({ name: 'lan', role: 'QA', salt: 's', hash: 'h', createdAt: 't1' });
    await members.put({ name: 'an', role: 'DevOps', salt: 's2', hash: 'h2', createdAt: 't2' });
    await members.put({ ...(await members.get('lan')), role: 'Tech lead' });
    assert.deepEqual((await members.list()).map((m) => [m.name, m.role, m.createdAt]), [['an', 'DevOps', 't2'], ['lan', 'Tech lead', 't1']]);
    assert.deepEqual([await members.remove('lan'), await members.remove('lan'), (await members.list()).length], [true, false, 1]);
    await targetStore.put({ name: 'thu-2', spec: { instance: 'thu-2', zone: 'z' }, managed: true, state: 'creating', createdBy: 'an', createdAt: 't1', detail: '' });
    await targetStore.put({ ...(await targetStore.list())[0], state: 'ready' });
    assert.deepEqual((await targetStore.list()).map((t) => [t.name, t.managed, t.state, t.spec.zone, t.createdBy]), [['thu-2', true, 'ready', 'z', 'an']]);
    assert.deepEqual([await targetStore.remove('thu-2'), (await targetStore.list()).length], [true, 0]);
    assert.equal(await meta.get('x'), null);
    await meta.set('x', '1'); await meta.set('x', '2');
    assert.equal(await meta.get('x'), '2');
  });

  test(`[${kind}] kho đối tượng (yêu cầu chờ duyệt, lần chạy): ghi đè theo mã; trả cũ trước và giới hạn theo số mới nhất`, async () => {
    const { approvalStore } = make();
    for (const n of [1, 2, 3]) await approvalStore.put({ id: `a${n}`, status: 'pending', requestedAt: `2026-01-0${n}` });
    await approvalStore.put({ id: 'a2', status: 'approved', requestedAt: '2026-01-02' });
    assert.deepEqual((await approvalStore.recent(2)).map((a) => [a.id, a.status]), [['a2', 'approved'], ['a3', 'pending']]);
  });
}

test('SQLite: tệp DB mở lại vẫn còn dữ liệu; lược đồ mới hơn bản này thì từ chối mở; giao dịch hỏng thì không ghi gì', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-db-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  const file = path.join(dir, 'sub', 'console.db');
  let db = openConsoleDb(file);
  await sqliteStores(db).members.put({ name: 'lan', role: 'QA', salt: 's', hash: 'h', createdAt: 't' });
  assert.throws(() => transaction(db, () => { db.prepare("insert into meta (key, value) values ('k', 'v')").run(); throw new Error('giữa chừng'); }), /giữa chừng/);
  assert.equal(await sqliteStores(db).meta.get('k'), null, 'giao dịch hỏng không để lại gì');
  db.close();
  db = openConsoleDb(file);
  assert.equal((await sqliteStores(db).members.get('lan')).role, 'QA');
  db.exec(`pragma user_version = ${SCHEMA_VERSION + 1}`);
  db.close();
  assert.throws(() => openConsoleDb(file), /understands up to/);
});

test('chép dữ liệu từ tệp cũ sang DB: đúng một lần, giữ thứ tự sổ thao tác, không ghi đè người dùng đã có, tệp cũ còn nguyên', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-import-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const old = { configStore: makeFsConfigStore({ dir }), auditLog: makeFsAuditLog({ dir }), credentials: { load: async () => ({ users: [{ name: 'lan', role: 'QA', salt: 's', hash: 'h', createdAt: 't' }] }) } };
  await old.configStore.save({ schema: 1, version: 1, config: CONFIG, history: [{ version: 1, at: 't', by: 'an', note: 'cũ', config: CONFIG }] });
  for (const n of [1, 2, 3]) await old.auditLog.append({ at: `t${n}`, actor: 'an', action: 'x', target: '', detail: '', outcome: 'ok' });
  const to = sqliteStores(openConsoleDb(':memory:'));
  const run = makeImportRecords({ from: old, to, clock: { now: () => 'bây giờ' } });
  assert.deepEqual(await run(), { imported: true, versions: 1, auditEntries: 3, members: 1 });
  assert.deepEqual([(await to.configStore.load()).version, (await to.auditLog.list(10)).map((e) => e.at), (await to.members.get('lan')).role], [1, ['t3', 't2', 't1'], 'QA']);
  assert.deepEqual(await run(), { imported: false }, 'lần sau không chép lại');
  assert.equal((await to.auditLog.list(10)).length, 3);
  assert.ok(fs.existsSync(path.join(dir, 'console.audit.jsonl')) && fs.existsSync(path.join(dir, 'console.config.json')), 'tệp cũ không bị xóa');
});

test('khởi động lại bảng điều khiển: yêu cầu chờ duyệt vẫn còn và duyệt được; lần chạy cũ xem lại được, lần đang dở hiện là interrupted', async () => {
  const stores = sqliteStores(openConsoleDb(':memory:'));
  let time = Date.parse('2026-01-01T00:00:00Z'); let n = 0;
  const clock = { now: () => new Date(time).toISOString(), millis: () => time };
  const random = { bytes: () => Buffer.from(String(n += 1).padStart(12, '0')) };
  const settings = { get: async () => ({ config: CONFIG }) };
  const audit = { record: async () => {} };
  const started = [];
  const fakeRuns = { start: async (input) => (input.approvedBy ? (started.push(input), { ok: true, run: { id: 'r1' } }) : { ok: false, outcome: 'APPROVAL_REQUIRED', reason: 'cần duyệt', preflight: { environment: { id: 'that', name: 'that' }, items: [{ serviceId: 'shop', from: null, to: { sha: 'b'.repeat(40), message: 'm' } }] } }) };
  const first = makeApprovals({ runs: fakeRuns, settings, audit, approvalStore: stores.approvalStore, clock, random });
  const asked = await first.submit({ kind: 'deploy', environmentId: 'that', items: [{ serviceId: 'shop' }], actor: { name: 'an', role: 'Developer' }, confirmation: 'shop' });
  // "Khởi động lại": một ca sử dụng mới trên cùng nơi lưu.
  const second = makeApprovals({ runs: fakeRuns, settings, audit, approvalStore: stores.approvalStore, clock, random });
  assert.deepEqual((await second.list({ pendingOnly: true })).map((a) => [a.id, a.requestedBy]), [[asked.approval.id, 'an']]);
  const ok = await second.decide(asked.approval.id, { approve: true, actor: { name: 'chi', role: 'Tech lead' } });
  assert.deepEqual([ok.ok, started[0].confirmation, started[0].actor.name, started[0].approvedBy], [true, 'shop', 'an', 'chi'], 'chạy với đúng người gửi và chuỗi xác nhận đã lưu');
  time += 25 * 3600 * 1000;
  const late = await first.submit({ kind: 'deploy', environmentId: 'that', items: [{ serviceId: 'shop' }], actor: { name: 'an', role: 'Developer' } });
  time += 25 * 3600 * 1000;
  const third = makeApprovals({ runs: fakeRuns, settings, audit, approvalStore: stores.approvalStore, clock, random });
  assert.equal((await third.list()).find((a) => a.id === late.approval.id).status, 'expired', 'quá 24 giờ thì hết hạn, kể cả sau khi khởi động lại');

  // Lần chạy: một lần xong và một lần còn dở lúc "tắt".
  await stores.runStore.put({ id: 'xong', status: 'succeeded', startedAt: '2026-01-01T00:00:00Z', view: { id: 'xong', status: 'succeeded', items: [] }, log: [{ seq: 1, text: 'dòng cũ' }] });
  await stores.runStore.put({ id: 'do', status: 'running', startedAt: '2026-01-02T00:00:00Z', view: { id: 'do', status: 'running', items: [] }, log: [] });
  const runs = makeRuns({ fleet: {}, executors: new Map(), runStore: stores.runStore, clock, random });
  assert.deepEqual((await runs.list()).map((r) => [r.id, r.status]), [['do', 'interrupted'], ['xong', 'succeeded']]);
  assert.deepEqual([(await runs.get('xong')).status, (await runs.logs('xong')).map((l) => l.text), await runs.get('khong-co'), (await runs.list({ activeOnly: true })).length], ['succeeded', ['dòng cũ'], null, 0]);
});
