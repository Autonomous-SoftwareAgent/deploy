'use strict';
// Phần AN TOÀN và CẤU HÌNH của bảng điều khiển: người dùng và vai trò, quyền theo môi trường, gõ tên xác nhận, người thứ hai duyệt,
// khung giờ khóa, phiên bản cấu hình, ánh xạ nhánh, sổ thao tác. Máy chủ web chạy thật trên 127.0.0.1 với dữ liệu trong bộ nhớ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { buildMemoryConsole, memoryPorts } = require('../src/composition');
const { sampleWorld, emptyWorld, commit } = require('../src/infrastructure/memory/world');
const { makeFsConfigStore, makeFsAuditLog } = require('../src/infrastructure/fs-console-records');
const access = require('../src/domain/access');
const branches = require('../src/domain/branches');

async function boot(t) {
  const board = buildMemoryConsole({ world: sampleWorld(), port: 0, imagesTtlMs: 0 });
  await board.auth.ensure();
  const { port } = await board.server.listen();
  t.after(async () => { await board.runs.settle(); await board.jobs.settle(); await board.server.close(); });
  const password = /trình duyệt\): (\S+)/.exec(board.world.firstLogin)[1];
  const token = /<token>"\): (\S+)/.exec(board.world.firstLogin)[1];
  const basic = (user, pass) => ({ authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`, 'x-bsn-console': '1' });
  const call = (who, method, url, body) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: { host: `127.0.0.1:${port}`, ...who, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let text = ''; res.on('data', (d) => { text += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* không phải JSON */ } resolve({ status: res.statusCode, body: json }); });
    });
    req.on('error', reject);
    req.end(data || undefined);
  });
  const admin = basic('admin', password);
  const agent = { authorization: `Bearer ${token}` };
  /** Tạo một người dùng, trả header đăng nhập của người đó. */
  const user = async (name, role) => { const r = await call(admin, 'POST', '/api/v1/users', { name, role }); assert.equal(r.status, 201, JSON.stringify(r.body)); return basic(name, r.body.password); };
  /** Sửa cấu hình bằng một hàm đổi trên bản đang có, rồi lưu. */
  const configure = async (change, note = 'test') => { const cur = (await call(admin, 'GET', '/api/v1/config')).body; change(cur.config); return call(admin, 'PUT', '/api/v1/config', { config: cur.config, expectedVersion: cur.version, note }); };
  const deploy = (who, extra = {}) => call(who, 'POST', '/api/v1/deployments', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }], ...extra });
  return { board, call, admin, agent, user, configure, deploy, password };
}

test('luật an toàn: quyền theo vai trò, giới hạn theo tên, khung giờ khóa vắt qua cuối tuần, gõ tên, duyệt', () => {
  const cfg = access.normalize({}, ['thu', 'that']);
  assert.deepEqual(access.configErrors(cfg, ['thu', 'that']), []);
  const facts = (over) => ({ cfg, envId: 'that', envName: 'that', kind: 'deploy', actor: { name: 'an', role: 'Developer' }, minute: 0, serviceIds: ['shop'], ...over });
  assert.deepEqual(access.gate(facts()), { blockers: [], confirmation: null, approval: false }, 'mặc định không khóa gì');
  cfg.permissions.that.Developer = 1;
  assert.equal(access.gate(facts({ kind: 'rollback' })).blockers[0].code, 'FORBIDDEN', 'mức 1 chỉ deploy');
  assert.equal(access.gate(facts({ kind: 'rollback', actor: { name: 'admin', role: 'Admin' } })).blockers.length, 0, 'admin không nằm trong bảng');
  Object.assign(cfg.environments.that.protect, { restrict: true, allowedUsers: ['binh'], typeName: true, approval: true, freeze: { on: true, from: 'Fri 16:00', to: 'Mon 08:00' } });
  assert.equal(access.gate(facts()).blockers[0].code, 'NOT_ALLOWED_USER');
  const g = access.gate(facts({ actor: { name: 'binh', role: 'Developer' }, minute: access.weekMinute('Wed 10:00') }));
  assert.deepEqual([g.blockers.length, g.confirmation, g.approval], [0, 'shop', true]);
  assert.equal(access.gate(facts({ serviceIds: ['shop', 'feed'] })).confirmation, 'that', 'nhiều dịch vụ thì gõ tên môi trường');
  for (const [when, frozen] of [['Fri 15:59', false], ['Fri 16:00', true], ['Sun 23:00', true], ['Mon 07:59', true], ['Mon 08:00', false]]) {
    assert.equal(access.frozenAt(cfg.environments.that.protect.freeze, access.weekMinute(when)), frozen, when);
  }
  assert.equal(access.isProtected(cfg.environments.that.protect), true);
  assert.equal(access.canApprove(cfg, { name: 'binh', role: 'Tech lead' }, 'binh', 'that'), false, 'không tự duyệt');
  assert.equal(access.canApprove(cfg, { name: 'chi', role: 'Tech lead' }, 'binh', 'that'), true);
  cfg.environments.that.protect.freeze.from = 'thứ sáu';
  cfg.permissions.that.QA = 7;
  assert.equal(access.configErrors(cfg, ['thu', 'that']).length, 2);
});

test('luật ánh xạ nhánh: riêng của dịch vụ thắng mặc định của nhóm; mẫu có dấu sao; cảnh báo thiếu và trùng', () => {
  const b = { defaults: { Shop: { thu: { mode: 'auto', value: 'develop' }, that: { mode: 'pattern', value: 'release/*' } } }, services: { feed: { thu: { mode: 'auto', value: 'release/*' } } }, rules: [{ id: 'r1', pattern: 'hotfix/*', environmentId: 'thu' }] };
  assert.deepEqual(branches.resolve(b, 'shop', 'Shop', 'thu'), { mode: 'auto', value: 'develop', inherited: true });
  assert.equal(branches.resolve(b, 'feed', 'Shop', 'thu').inherited, false);
  assert.equal(branches.resolve(b, 'shop', 'Khac', 'thu').mode, 'none');
  assert.deepEqual([branches.globMatch('release/*', 'release/2.4'), branches.globMatch('release/*', 'main'), branches.globMatch('main', 'main'), branches.globMatch('a.b', 'aXb')], [true, false, true, false]);
  const rows = branches.matrix(b, [{ id: 'feed', project: 'Shop' }, { id: 'lone', project: 'Khac' }], ['thu', 'that']);
  assert.deepEqual(rows[0].shared, [{ branch: 'release/*', environments: ['thu', 'that'] }], 'một nhánh trỏ tới hai môi trường');
  assert.deepEqual(rows[1].missing, ['thu', 'that']);
  assert.deepEqual(branches.test(b, 'hotfix/x', null, ['thu', 'that']).rules.map((r) => r.id), ['r1']);
  assert.deepEqual(branches.test(b, 'release/9', { id: 'feed', project: 'Shop' }, ['thu', 'that']).environments, ['thu', 'that']);
});

for (const [kind, make] of [
  ['trên đĩa', (t) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-records-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return { configStore: makeFsConfigStore({ dir }), auditLog: makeFsAuditLog({ dir }), dir }; }],
  ['trong bộ nhớ', () => memoryPorts(emptyWorld())],
]) {
  test(`[${kind}] ConfigStore và AuditLog: chưa có thì rỗng; ghi rồi đọc lại đúng; sổ thao tác trả dòng mới trước và có giới hạn`, async (t) => {
    const p = make(t);
    assert.equal(await p.configStore.load(), null);
    await p.configStore.save({ schema: 1, version: 2, config: { a: 1 }, history: [] });
    assert.equal((await p.configStore.load()).version, 2);
    assert.deepEqual(await p.auditLog.list(10), []);
    for (const n of [1, 2, 3]) await p.auditLog.append({ at: `t${n}`, actor: 'an', action: 'x', n });
    assert.deepEqual((await p.auditLog.list(2)).map((e) => e.n), [3, 2]);
    if (p.dir) { fs.appendFileSync(path.join(p.dir, 'console.audit.jsonl'), '{"dở'); assert.equal((await p.auditLog.list(10)).length, 3, 'dòng ghi dở bị bỏ qua'); }
  });
}

test('người dùng: admin tạo, mật khẩu chỉ trả một lần và nơi lưu chỉ giữ băm; đổi vai trò, sinh lại mật khẩu, xóa; người thường không quản lý được', async (t) => {
  const b = await boot(t);
  const made = await b.call(b.admin, 'POST', '/api/v1/users', { name: 'lan', role: 'Developer' });
  assert.equal(made.status, 201);
  assert.ok(made.body.password.length >= 16);
  assert.ok(!JSON.stringify(b.board.world.credentials).includes(made.body.password), 'nơi lưu không giữ bản rõ');
  assert.ok(!JSON.stringify(b.board.world.audit).includes(made.body.password), 'sổ thao tác không giữ mật khẩu');
  const lan = { authorization: `Basic ${Buffer.from(`lan:${made.body.password}`).toString('base64')}`, 'x-bsn-console': '1' };
  assert.deepEqual((await b.call(lan, 'GET', '/api/v1/me')).body, { name: 'lan', role: 'Developer', canAdminister: false });
  for (const bad of [{ name: 'admin', role: 'QA' }, { name: 'agent', role: 'QA' }, { name: 'X', role: 'QA' }, { name: 'ok', role: 'Admin' }, { name: 'ok', role: 'Agent' }]) assert.equal((await b.call(b.admin, 'POST', '/api/v1/users', bad)).status, 400, JSON.stringify(bad));
  assert.equal((await b.call(b.admin, 'POST', '/api/v1/users', { name: 'lan', role: 'QA' })).status, 409);
  assert.equal((await b.call(lan, 'GET', '/api/v1/users')).status, 403);
  assert.equal((await b.call(lan, 'POST', '/api/v1/users', { name: 'ke', role: 'DevOps' })).status, 403);
  assert.equal((await b.call(lan, 'PUT', '/api/v1/config', { config: {}, expectedVersion: 0 })).status, 403);
  assert.equal((await b.call(b.admin, 'PATCH', '/api/v1/users/lan', { role: 'DevOps' })).status, 200);
  assert.equal((await b.call(lan, 'GET', '/api/v1/users')).status, 200, 'DevOps quản lý được');
  const again = await b.call(b.admin, 'POST', '/api/v1/users/lan/password', {});
  assert.equal((await b.call(lan, 'GET', '/api/v1/me')).status, 401, 'mật khẩu cũ hết dùng ngay');
  assert.notEqual(again.body.password, made.body.password);
  assert.equal((await b.call(b.admin, 'DELETE', '/api/v1/users/lan')).status, 200);
  assert.equal((await b.call(b.admin, 'DELETE', '/api/v1/users/lan')).status, 404);
  assert.deepEqual((await b.call(b.admin, 'GET', '/api/v1/users')).body.items, []);
  await b.board.auth.ensure({ reset: true });
});

test('quyền theo môi trường: vai trò không đủ mức bị chặn ở kiểm tra trước và ở lúc chạy (kể cả đường /api cũ); agent cũng theo bảng', async (t) => {
  const b = await boot(t);
  const dev = await b.user('dev1', 'Developer');
  assert.equal((await b.configure((c) => { c.permissions['mau-thu'].Developer = 0; c.permissions['mau-thu'].Agent = 1; })).status, 200);
  const pre = await b.call(dev, 'POST', '/api/v1/deployments/preflight', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }] });
  assert.deepEqual([pre.body.canProceed, pre.body.gate.blockers[0].code], [false, 'FORBIDDEN']);
  assert.equal((await b.deploy(dev)).status, 422);
  assert.equal((await b.call(dev, 'POST', '/api/services/mau-tot/deploy', {})).status, 403, 'đường /api cũ đi qua cùng cổng an toàn');
  assert.equal(b.board.worlds[0].running.get('bsn-mau-tot').commit, commit('a'), 'không có gì chạy');
  const rb = await b.call(b.agent, 'POST', '/api/v1/deployments/preflight', { kind: 'rollback', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }] });
  assert.equal(rb.body.gate.blockers[0].code, 'FORBIDDEN', 'agent mức 1: deploy được, rollback không');
  assert.equal((await b.deploy(b.agent)).status, 201);
  const other = await b.call(dev, 'POST', '/api/v1/deployments', { kind: 'deploy', environmentId: 'mau-that', items: [{ serviceId: 'mau-tot' }] });
  assert.equal(other.status, 201, 'môi trường khác vẫn theo quyền của nó');
  const log = (await b.call(b.admin, 'GET', '/api/v1/audit')).body.items;
  assert.ok(log.some((e) => e.actor === 'dev1' && e.action === 'deploy.refused' && e.outcome === 'refused'));
  assert.ok(log.some((e) => e.actor === 'agent' && e.action === 'deploy.start'));
});

test('gõ tên xác nhận và khung giờ khóa do máy chủ kiểm: thiếu hay sai tên thì 422; trong giờ khóa thì chặn; môi trường hiện là được bảo vệ', async (t) => {
  const b = await boot(t);
  await b.configure((c) => { c.environments['mau-thu'].protect.typeName = true; });
  const pre = await b.call(b.admin, 'POST', '/api/v1/deployments/preflight', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }] });
  assert.deepEqual([pre.body.canProceed, pre.body.gate.confirmation, pre.body.environment.protected], [true, 'mau-tot', true]);
  assert.equal((await b.deploy(b.admin)).body.error.code, 'CONFIRMATION_REQUIRED');
  assert.equal((await b.deploy(b.admin, { confirmation: 'mau-hong' })).status, 422);
  assert.equal((await b.call(b.agent, 'POST', '/api/services/mau-tot/deploy', {})).status, 403, 'đường /api cũ không phục vụ môi trường đòi gõ tên');
  assert.equal((await b.deploy(b.admin, { confirmation: 'mau-tot' })).status, 201);
  await b.board.runs.settle();
  // Khung giờ khóa phủ cả tuần trừ đúng một phút: lúc nào chạy test cũng đang bị khóa (trừ phút đó, khi đó dùng khung ngược lại).
  const now = access.weekMinuteOf(new Date(b.board.world.time));
  const label = (m) => `${access.DAYS[Math.floor(m / 1440)]} ${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  await b.configure((c) => { c.environments['mau-thu'].protect.freeze = { on: true, from: label(now), to: label((now + 60) % 10080) }; });
  const frozen = await b.call(b.admin, 'POST', '/api/v1/deployments/preflight', { kind: 'rollback', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }] });
  assert.equal(frozen.body.gate.blockers[0].code, 'FREEZE_WINDOW', 'giờ khóa chặn cả admin');
  assert.equal((await b.call(b.admin, 'POST', '/api/v1/deployments', { kind: 'rollback', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }], confirmation: 'mau-tot' })).status, 422);
});

test('môi trường đòi duyệt: yêu cầu nằm chờ (202), người gửi không tự duyệt, người không đủ quyền không duyệt được, duyệt xong mới chạy; từ chối thì không chạy', async (t) => {
  const b = await boot(t);
  const dev = await b.user('dev1', 'Developer');
  const lead = await b.user('lead1', 'Tech lead');
  const qa = await b.user('qa1', 'QA');
  await b.configure((c) => { c.environments['mau-thu'].protect.approval = true; c.permissions['mau-thu'].QA = 1; });
  const asked = await b.deploy(dev);
  assert.equal(asked.status, 202);
  const id = asked.body.approvalId;
  assert.deepEqual([asked.body.approval.status, asked.body.approval.requestedBy, asked.body.approval.items[0].targetSha], ['pending', 'dev1', commit('b')]);
  assert.equal(b.board.worlds[0].running.get('bsn-mau-tot').commit, commit('a'), 'chưa duyệt thì chưa chạy');
  assert.equal((await b.call(dev, 'GET', '/api/v1/approvals?status=pending')).body.items.length, 1);
  assert.equal((await b.call(dev, 'POST', `/api/v1/approvals/${id}/approve`, {})).status, 403, 'không tự duyệt');
  assert.equal((await b.call(qa, 'POST', `/api/v1/approvals/${id}/approve`, {})).status, 403, 'mức 1 không duyệt được');
  const ok = await b.call(lead, 'POST', `/api/v1/approvals/${id}/approve`, {});
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.approval.status, ok.body.approval.decidedBy, ok.body.run.requestedBy, ok.body.run.approvedBy], ['approved', 'lead1', 'dev1', 'lead1']);
  await b.board.runs.settle();
  assert.equal(b.board.worlds[0].running.get('bsn-mau-tot').commit, commit('b'));
  assert.equal((await b.call(lead, 'POST', `/api/v1/approvals/${id}/approve`, {})).status, 409, 'đã duyệt rồi thì không duyệt lại');
  const second = await b.call(dev, 'POST', '/api/v1/deployments', { kind: 'rollback', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }] });
  assert.equal((await b.call(lead, 'POST', `/api/v1/approvals/${second.body.approvalId}/reject`, {})).body.approval.status, 'rejected');
  await b.board.runs.settle();
  assert.equal(b.board.worlds[0].running.get('bsn-mau-tot').commit, commit('b'), 'bị từ chối thì không rollback');
  assert.equal((await b.call(lead, 'POST', '/api/v1/approvals/khong-co/approve', {})).status, 404);
  const actions = (await b.call(b.admin, 'GET', '/api/v1/audit')).body.items.map((e) => e.action);
  for (const a of ['approval.request', 'approval.approve', 'approval.reject']) assert.ok(actions.includes(a), a);
});

test('cấu hình: mỗi lần lưu là một phiên bản; lệch phiên bản thì 409; xem trước nêu thay đổi và lỗi; khôi phục và về mặc định; ánh xạ nhánh', async (t) => {
  const b = await boot(t);
  const first = (await b.call(b.admin, 'GET', '/api/v1/config')).body;
  assert.deepEqual([first.version, first.canEdit, Object.keys(first.config.environments)], [0, true, ['mau-thu', 'mau-that']]);
  const draft = JSON.parse(JSON.stringify(first.config));
  draft.environments['mau-that'].order = -1; draft.environments['mau-that'].color = '#B1275E';
  draft.branches.defaults['Sample group A'] = { 'mau-thu': { mode: 'auto', value: 'develop' } };
  draft.branches.rules.push({ id: 'r1', pattern: 'release/*', environmentId: 'mau-that' });
  const pv = await b.call(b.admin, 'POST', '/api/v1/config/preview', { config: draft });
  assert.deepEqual([pv.body.errors, pv.body.changes.some((c) => c.path === 'environments.mau-that.color')], [[], true]);
  assert.equal((await b.call(b.admin, 'PUT', '/api/v1/config', { config: draft, expectedVersion: 5 })).status, 409);
  const saved = await b.call(b.admin, 'PUT', '/api/v1/config', { config: draft, expectedVersion: 0, note: 'đổi thứ tự' });
  assert.deepEqual([saved.status, saved.body.version], [200, 1]);
  assert.equal((await b.call(b.admin, 'PUT', '/api/v1/config', { config: draft, expectedVersion: 1 })).status, 400, 'không đổi gì thì không sinh phiên bản');
  const ov = (await b.call(b.agent, 'GET', '/api/v1/overview')).body;
  assert.deepEqual(ov.environments.map((e) => [e.id, e.color]), [['mau-that', '#B1275E'], ['mau-thu', ov.environments[1].color]], 'thứ tự và màu theo cấu hình');
  assert.deepEqual(ov.groups.flatMap((g) => g.services).find((s) => s.id === 'mau-tot').cells['mau-thu'].mapping, { mode: 'auto', value: 'develop', inherited: true });
  const bad = JSON.parse(JSON.stringify(draft)); bad.environments['mau-thu'].color = 'đỏ';
  assert.equal((await b.call(b.admin, 'PUT', '/api/v1/config', { config: bad, expectedVersion: 1 })).status, 400);
  const matrix = (await b.call(b.agent, 'GET', '/api/v1/branches/matrix')).body.items;
  assert.deepEqual(matrix.find((r) => r.serviceId === 'mau-cho-build').missing, ['mau-thu', 'mau-that']);
  const tested = (await b.call(b.agent, 'POST', '/api/v1/branches/test', { branch: 'release/2.4', serviceId: 'mau-tot' })).body;
  assert.deepEqual([tested.rules.map((r) => r.id), tested.environments], [['r1'], []]);
  assert.equal((await b.call(b.admin, 'POST', '/api/v1/config/reset', {})).body.version, 2);
  assert.equal((await b.call(b.admin, 'POST', '/api/v1/config/restore', { version: 1 })).body.version, 3);
  const last = (await b.call(b.admin, 'GET', '/api/v1/config')).body;
  assert.deepEqual([last.config.environments['mau-that'].color, last.versions.map((v) => v.version), last.versions[0].note], ['#B1275E', [3, 2, 1], 'restored version 1']);
  assert.equal((await b.call(b.admin, 'POST', '/api/v1/config/restore', { version: 99 })).status, 404);
});
