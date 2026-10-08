'use strict';
// THÊM và GỠ MÔI TRƯỜNG từ bảng điều khiển (D-015): tạo máy trên cloud (bộ nối trong bộ nhớ và lệnh gcloud giả), chuẩn bị máy,
// môi trường mới hiện thành một cột chưa deploy gì, gỡ và xóa máy, quyền, xác nhận, và nối lại sau khi bảng điều khiển khởi động lại.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { buildMemoryConsole, memoryPorts } = require('../src/composition');
const { sampleWorld, emptyWorld } = require('../src/infrastructure/memory/world');
const { makeGcloudCompute } = require('../src/infrastructure/gcloud-compute');
const { makeProvision } = require('../src/application/provision');
const rules = require('../src/domain/provision');

async function boot(t) {
  const board = buildMemoryConsole({ world: sampleWorld(), port: 0, imagesTtlMs: 0 });
  await board.auth.ensure();
  const { port } = await board.server.listen();
  t.after(async () => { await board.provision.settle(); await board.runs.settle(); await board.jobs.settle(); await board.server.close(); });
  const password = /trình duyệt\): (\S+)/.exec(board.world.firstLogin)[1];
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
  const user = async (name, role) => basic(name, (await call(admin, 'POST', '/api/v1/users', { name, role })).body.password);
  return { board, call, admin, user };
}

test('luật thêm môi trường: tên, cỡ máy, vùng; tên đã có thì từ chối; tờ khai đích sinh ra đúng dạng', () => {
  const ok = { mode: 'create', name: 'thu-2', zone: 'asia-southeast1-a', machineType: 'e2-small' };
  assert.deepEqual(rules.requestErrors(ok, ['local']), []);
  assert.equal(rules.requestErrors(ok, ['thu-2']).length, 1);
  assert.equal(rules.requestErrors({ ...ok, name: 'Thu 2' }, []).length, 1);
  assert.equal(rules.requestErrors({ ...ok, machineType: 'n2-highmem-96' }, []).length, 1, 'chỉ nhận cỡ máy trong danh sách');
  assert.equal(rules.requestErrors({ ...ok, zone: 'a; rm -rf /' }, []).length, 1, 'vùng đi vào dòng lệnh nên chỉ nhận ký tự an toàn');
  assert.equal(rules.requestErrors({ mode: 'register', name: 'cu', instance: 'may-cu', zone: 'z-1' }, []).length, 0);
  assert.equal(rules.requestErrors({ mode: 'register', name: 'cu', zone: 'z-1' }, []).length, 1, 'khai máy đã có thì phải có tên máy');
  assert.deepEqual(rules.specOf({ name: 'thu-2', zone: 'z-1', configuration: 'bsn', machineType: 'e2-small' }), { transport: 'gcloud-ssh', configuration: 'bsn', instance: 'thu-2', zone: 'z-1', root: '/opt/bsn', machineType: 'e2-small' });
});

test('lệnh gcloud: tạo máy với đúng hệ điều hành, đĩa và nhãn; xóa kèm đĩa; máy không còn thì coi như đã xóa', async () => {
  const calls = [];
  const fake = (code, stderr = '') => (cmd, args) => { calls.push([cmd, ...args].join(' ')); const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); setImmediate(() => { if (stderr) c.stderr.emit('data', stderr); c.emit('close', code); }); return c; };
  const ok = makeGcloudCompute({ spawnImpl: fake(0) });
  assert.deepEqual(await ok.createInstance({ configuration: 'bsn', name: 'thu-2', zone: 'z-1', machineType: 'e2-small', labels: { 'created-by': 'bsn-console' } }), { ok: true });
  assert.equal(calls[0], 'gcloud --configuration bsn compute instances create thu-2 --zone z-1 --machine-type e2-small --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud --boot-disk-size 20GB --labels created-by=bsn-console --quiet');
  await ok.deleteInstance({ name: 'thu-2', zone: 'z-1' });
  assert.equal(calls[1], 'gcloud compute instances delete thu-2 --zone z-1 --delete-disks all --quiet');
  const gone = makeGcloudCompute({ spawnImpl: fake(1, "ERROR: The resource 'thu-2' was not found") });
  assert.deepEqual([await gone.deleteInstance({ name: 'thu-2', zone: 'z-1' }), await gone.instanceExists({ name: 'thu-2', zone: 'z-1' })], [{ ok: true }, false]);
  const denied = await makeGcloudCompute({ spawnImpl: fake(1, 'ERROR: Quota exceeded') }).createInstance({ name: 'x', zone: 'z', machineType: 'e2-small' });
  assert.deepEqual(denied, { ok: false, error: 'ERROR: Quota exceeded' });
});

test('tạo môi trường từ trang: phải gõ tên; máy được tạo và chuẩn bị qua bốn bước; cột mới chưa deploy gì và deploy vào đó được', async (t) => {
  const b = await boot(t);
  const opts = (await b.call(b.admin, 'GET', '/api/v1/environments/managed')).body;
  assert.deepEqual([opts.items, opts.options.defaultMachineType, opts.options.machineTypes.every((m) => m.usdPerDay > 0)], [[], 'e2-small', true]);
  const req = { mode: 'create', name: 'thu-2', machineType: 'e2-small', zone: 'sample-zone-a' };
  assert.equal((await b.call(b.admin, 'POST', '/api/v1/environments', req)).body.error.code, 'CONFIRMATION_REQUIRED');
  assert.equal(b.board.world.instances.size, 0, 'chưa gõ tên thì chưa tạo gì');
  const made = await b.call(b.admin, 'POST', '/api/v1/environments', { ...req, confirmation: 'thu-2' });
  assert.equal(made.status, 202);
  await b.board.provision.settle();
  const op = (await b.call(b.admin, 'GET', `/api/v1/environments/operations/${made.body.operation.id}`)).body;
  assert.deepEqual([op.status, op.steps.map((s) => `${s.name}:${s.status}`)], ['succeeded', ['machine:succeeded', 'ssh:succeeded', 'setup:succeeded', 'verify:succeeded']]);
  assert.deepEqual([...b.board.world.instances], [['thu-2', { zone: 'sample-zone-a', machineType: 'e2-small' }]]);
  const listed = (await b.call(b.admin, 'GET', '/api/v1/environments/managed')).body.items;
  assert.deepEqual(listed.map((e) => [e.name, e.managed, e.state, e.createdBy]), [['thu-2', true, 'ready', 'admin']]);
  const ov = (await b.call(b.admin, 'GET', '/api/v1/overview')).body;
  assert.deepEqual(ov.allEnvironments.map((e) => e.id), ['mau-thu', 'mau-that', 'thu-2']);
  assert.equal((await b.call(b.admin, 'GET', '/api/v1/config')).body.config.permissions['thu-2'].Developer, 2, 'môi trường mới nhận cấu hình mặc định');
  assert.equal((await b.call(b.admin, 'POST', '/api/v1/environments', { ...req, confirmation: 'thu-2' })).status, 400, 'tên đã có');
  const run = await b.call(b.admin, 'POST', '/api/v1/deployments', { kind: 'deploy', environmentId: 'thu-2', items: [{ serviceId: 'mau-tot' }] });
  assert.equal(run.status, 201, 'người vận hành deploy vào môi trường mới như mọi môi trường khác');
  const log = (await b.call(b.admin, 'GET', '/api/v1/audit?action=environment')).body.items;
  assert.deepEqual(log.map((e) => [e.action, e.target, e.outcome]), [['environment.create', 'thu-2', 'ok']]);
});

test('cloud từ chối tạo máy: môi trường ghi là hỏng kèm lý do, không có cột mới; gỡ được bản ghi hỏng', async (t) => {
  const b = await boot(t);
  b.board.world.cloudFails = 'Quota exceeded';
  const made = await b.call(b.admin, 'POST', '/api/v1/environments', { mode: 'create', name: 'thu-3', zone: 'sample-zone-a', confirmation: 'thu-3' });
  await b.board.provision.settle();
  const op = (await b.call(b.admin, 'GET', `/api/v1/environments/operations/${made.body.operation.id}`)).body;
  assert.deepEqual([op.status, op.steps[0].status, op.steps[1].status], ['failed', 'failed', 'pending']);
  const item = (await b.call(b.admin, 'GET', '/api/v1/environments/managed')).body.items[0];
  assert.deepEqual([item.state, /Quota exceeded/.test(item.detail)], ['failed', true]);
  assert.deepEqual((await b.call(b.admin, 'GET', '/api/v1/overview')).body.allEnvironments.map((e) => e.id), ['mau-thu', 'mau-that']);
  assert.equal((await b.call(b.admin, 'DELETE', '/api/v1/environments/thu-3', { confirmation: 'thu-3' })).status, 200);
  assert.deepEqual((await b.call(b.admin, 'GET', '/api/v1/environments/managed')).body.items, []);
});

test('gỡ môi trường: phải gõ tên; gỡ khỏi bảng điều khiển thì máy còn; xóa máy chỉ với máy do bảng điều khiển tạo; môi trường khai bằng tệp không gỡ được', async (t) => {
  const b = await boot(t);
  const create = async (name) => { await b.call(b.admin, 'POST', '/api/v1/environments', { mode: 'create', name, zone: 'sample-zone-a', confirmation: name }); await b.board.provision.settle(); };
  await create('thu-2'); await create('thu-3');
  assert.equal((await b.call(b.admin, 'DELETE', '/api/v1/environments/thu-2', { deleteMachine: true })).body.error.code, 'CONFIRMATION_REQUIRED');
  assert.equal((await b.call(b.admin, 'DELETE', '/api/v1/environments/mau-thu', { confirmation: 'mau-thu' })).status, 404, 'môi trường có sẵn của bảng điều khiển không gỡ được từ trang');
  const kept = await b.call(b.admin, 'DELETE', '/api/v1/environments/thu-2', { confirmation: 'thu-2' });
  assert.deepEqual([kept.status, b.board.world.instances.has('thu-2')], [200, true], 'chỉ gỡ khỏi bảng điều khiển: máy còn nguyên');
  const gone = await b.call(b.admin, 'DELETE', '/api/v1/environments/thu-3', { confirmation: 'thu-3', deleteMachine: true });
  assert.equal(gone.status, 200);
  await b.board.provision.settle();
  assert.deepEqual([b.board.world.instances.has('thu-3'), (await b.call(b.admin, 'GET', '/api/v1/environments/managed')).body.items.length], [false, 0]);
  assert.deepEqual((await b.call(b.admin, 'GET', '/api/v1/overview')).body.allEnvironments.map((e) => e.id), ['mau-thu', 'mau-that']);
  const reg = await b.call(b.admin, 'POST', '/api/v1/environments', { mode: 'register', name: 'cu', instance: 'may-cu', zone: 'sample-zone-a' });
  assert.equal(reg.status, 202);
  assert.equal((await b.call(b.admin, 'DELETE', '/api/v1/environments/cu', { confirmation: 'cu', deleteMachine: true })).status, 400, 'máy chỉ được khai thì bảng điều khiển không xóa');
  assert.equal((await b.call(b.admin, 'DELETE', '/api/v1/environments/cu', { confirmation: 'cu' })).status, 200);
});

test('chỉ Admin và DevOps thêm, gỡ được môi trường; người khác bị từ chối và sổ thao tác ghi lại', async (t) => {
  const b = await boot(t);
  const dev = await b.user('dev1', 'Developer');
  const ops = await b.user('ops1', 'DevOps');
  assert.equal((await b.call(dev, 'POST', '/api/v1/environments', { mode: 'create', name: 'thu-2', zone: 'sample-zone-a', confirmation: 'thu-2' })).status, 403);
  assert.equal(b.board.world.instances.size, 0);
  assert.equal((await b.call(dev, 'GET', '/api/v1/environments/managed')).status, 200, 'xem thì ai đăng nhập cũng xem được');
  assert.equal((await b.call(ops, 'POST', '/api/v1/environments', { mode: 'create', name: 'thu-2', zone: 'sample-zone-a', confirmation: 'thu-2' })).status, 202);
  await b.board.provision.settle();
  assert.equal((await b.call(dev, 'DELETE', '/api/v1/environments/thu-2', { confirmation: 'thu-2', deleteMachine: true })).status, 403);
  assert.ok((await b.call(b.admin, 'GET', '/api/v1/audit?actor=dev1&outcome=refused')).body.items.some((e) => e.action === 'environment.add'));
});

test('bảng điều khiển khởi động lại: môi trường đã sẵn sàng được nối lại; việc tạo đang dở ghi là hỏng để người vận hành xử lý', async () => {
  const ports = memoryPorts(emptyWorld());
  await ports.targetStore.put({ name: 'san-sang', spec: rules.specOf({ name: 'san-sang', zone: 'z-1' }), managed: true, state: 'ready', createdBy: 'an', createdAt: 't1', detail: '' });
  await ports.targetStore.put({ name: 'dang-tao', spec: rules.specOf({ name: 'dang-tao', zone: 'z-1' }), managed: true, state: 'creating', createdBy: 'an', createdAt: 't2', detail: '' });
  const added = [];
  const p = makeProvision({ cloud: ports.cloud, targetStore: ports.targetStore, setupScript: ports.setupScript, connector: { connect: (target) => ({ id: target.name }), shell: () => null },
    registry: { ids: () => added.map((m) => m.id), add: (m) => added.push(m), remove: () => true }, audit: { record: async () => {} }, clock: ports.clock, random: { bytes: () => Buffer.from('abcdef') } });
  await p.restore();
  assert.deepEqual(added.map((m) => m.id), ['san-sang']);
  const items = (await p.list()).items;
  assert.deepEqual(items.map((i) => [i.name, i.state]), [['san-sang', 'ready'], ['dang-tao', 'failed']]);
  assert.match(items[1].detail, /restarted/);
});
