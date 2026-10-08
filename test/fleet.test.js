'use strict';
// Bảng điều khiển theo MÔI TRƯỜNG (design/deploy-console.api.md, đợt A): tổng quan, chi tiết dịch vụ, kiểm tra trước, lần chạy
// nhiều dịch vụ. Máy chủ web chạy thật trên 127.0.0.1; phía sau là cùng các ca sử dụng với hệ thật, lắp trên hai "thế giới"
// trong bộ nhớ (hai môi trường mẫu). Không cần Docker, không cần mạng.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { buildMemoryConsole } = require('../src/composition');
const { sampleWorld, BROKEN, commit } = require('../src/infrastructure/memory/world');
const fleet = require('../src/domain/fleet');
const run = require('../src/domain/run');

async function boot(t, { delayMs = 0 } = {}) {
  const board = buildMemoryConsole({ world: sampleWorld({ delayMs }), port: 0, imagesTtlMs: 0 });
  await board.auth.ensure();
  const { port } = await board.server.listen();
  t.after(async () => { await board.runs.settle(); await board.jobs.settle(); await board.server.close(); });
  const token = /<token>"\): (\S+)/.exec(board.world.firstLogin)[1];
  const call = (method, path, body, auth = true) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let text = ''; res.on('data', (d) => { text += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* không phải JSON */ } resolve({ status: res.statusCode, body: json }); });
    });
    req.on('error', reject);
    req.end(data || undefined);
  });
  const svcIn = (ov, name) => ov.groups.flatMap((g) => g.services).find((s) => s.name === name);
  return { board, call, svcIn };
}

test('luật tổng quan: sức khỏe từ dòng trạng thái, số commit lệch so với bản đã khai, điểm ưu tiên', () => {
  assert.equal(fleet.healthOf(null), null);
  assert.equal(fleet.healthOf({ running: false, deployed: null }), null, 'chưa deploy');
  assert.equal(fleet.healthOf({ running: false, deployed: { commit: 'x' } }), 'failed', 'sổ ghi đã deploy mà không chạy');
  assert.equal(fleet.healthOf({ running: true, containerStatus: 'Up 2 hours (healthy)' }), 'healthy');
  assert.equal(fleet.healthOf({ running: true, containerStatus: 'Up 5 seconds (health: starting)' }), 'deploying');
  assert.equal(fleet.healthOf({ running: true, containerStatus: 'Up 2 minutes (unhealthy)' }), 'failed');
  assert.equal(fleet.healthOf({ running: true, busy: { action: 'deploy' }, containerStatus: 'Up (healthy)' }), 'deploying');
  const shas = ['d', 'c', 'b', 'a']; // mới trước
  assert.equal(fleet.behindCount(shas, 'a', 'c'), 2);
  assert.equal(fleet.behindCount(shas, 'c', 'c'), 0);
  assert.equal(fleet.behindCount(shas, 'd', 'b'), 0, 'đang chạy bản mới hơn bản đã khai thì không tính là lệch');
  assert.equal(fleet.behindCount(shas, 'x', 'c'), 0, 'không thấy trong lịch sử thì không đoán');
  assert.equal(fleet.priorityScore([{ health: 'failed', behindCount: 1 }, { health: 'deploying' }, { health: 'healthy', behindCount: 200 }]), 1000 + 500 + 99);
  assert.deepEqual(fleet.changesBetween(shas, 'a', 'c'), { direction: 'forward', shas: ['c', 'b'] });
  assert.deepEqual(fleet.changesBetween(shas, 'd', 'b'), { direction: 'backward', shas: ['d', 'c'] });
  assert.equal(fleet.changesBetween(shas, 'a', 'zz'), null);
});

test('luật kiểm tra trước: các mã chặn và cảnh báo', () => {
  const A = commit('a'); const B = commit('b'); const C = commit('c');
  const shas = [C, B, A];
  const row = (over = {}) => ({ running: true, runningCommit: A, busy: null, previous: null, history: [{ commit: A, result: 'ok' }], ...over });
  const pf = (over) => fleet.preflightItem({ kind: 'deploy', reachable: true, row: row(), target: B, shas, build: 'passed', name: 'shop', environmentName: 'thu', ...over });
  const codes = (r) => r.blockers.map((b) => b.code);
  const ok = pf({});
  assert.deepEqual([codes(ok), ok.direction, ok.changes], [[], 'forward', [B]]);
  assert.deepEqual(codes(pf({ reachable: false })), ['ENV_UNREACHABLE']);
  assert.deepEqual(codes(pf({ row: null })), ['NOT_IN_ENVIRONMENT']);
  assert.deepEqual(codes(pf({ target: A })), ['ALREADY_RUNNING']);
  assert.deepEqual(codes(pf({ build: 'none' })), ['BUILD_NOT_READY']);
  assert.deepEqual(codes(pf({ row: row({ busy: { action: 'deploy' } }) })), ['RUN_IN_PROGRESS']);
  assert.deepEqual(codes(pf({ target: null })), ['COMMIT_UNKNOWN']);
  assert.deepEqual(pf({ build: 'unknown' }).warnings.map((w) => w.code), ['BUILD_UNKNOWN'], 'không hỏi được kho thì cảnh báo, không chặn');
  assert.deepEqual(pf({ row: row({ runningCommit: C }), target: B }).warnings.map((w) => w.code), ['DEPLOY_OLDER_COMMIT']);
  // Rollback: chỉ về bản cũ hơn và đã từng chạy khỏe ở môi trường này; không đòi bản trên kho.
  const rb = (over) => pf({ kind: 'rollback', row: row({ runningCommit: B, history: [{ commit: B, result: 'ok' }, { commit: A, result: 'ok' }] }), target: A, build: 'none', ...over });
  assert.deepEqual(codes(rb({})), []);
  assert.deepEqual(codes(rb({ target: C })).sort(), ['NEVER_RAN_HERE', 'ROLLBACK_TARGET_NEWER']);
  assert.deepEqual(codes(rb({ target: null })), ['NOTHING_TO_ROLLBACK']);
  assert.deepEqual(codes(rb({ row: row({ running: false }) })), ['NOTHING_TO_ROLLBACK']);
});

test('luật lần chạy: sự kiện bước đổi trạng thái mục; hỏng rồi tự bật lại bản cũ thành rolled_back; hỏng hẳn là failed', () => {
  const it = run.newItem({ serviceId: 'shop', fromSha: 'a', toSha: 'b' });
  run.applyStep(it, { step: 'fetch', status: 'running', phase: 'forward' });
  run.applyStep(it, { step: 'fetch', status: 'succeeded', phase: 'forward' });
  run.applyStep(it, { step: 'health', status: 'failed', phase: 'forward' });
  run.applyStep(it, { step: 'buoc-la', status: 'running', phase: 'forward' });
  assert.deepEqual(it.steps.map((s) => s.status), ['succeeded', 'pending', 'failed', 'pending']);
  run.applyStep(it, { step: 'fetch', status: 'running', phase: 'revert' });
  assert.equal(it.status, 'rolling_back');
  assert.equal(it.steps[0].status, 'succeeded', 'bước của pha bật lại không ghi đè bước của lần đưa lên');
  run.applyResult(it, { ok: false, reverted: 'ok', reason: 'không khỏe' });
  assert.equal(it.status, 'rolled_back');
  const bad = run.applyResult(run.newItem({ serviceId: 'x', toSha: 'b' }), { ok: false, reverted: 'failed', reason: 'hỏng cả hai' });
  assert.equal(bad.status, 'failed');
  const good = run.applyResult(run.newItem({ serviceId: 'y', toSha: 'b' }), { ok: true });
  assert.deepEqual([good.status, good.steps.every((s) => s.status === 'succeeded')], ['succeeded', true]);
  assert.equal(run.runStatus([good, it]), 'rolled_back');
  assert.equal(run.runStatus([good, bad]), 'failed');
  assert.equal(run.runStatus([good]), 'succeeded');
  assert.equal(run.runStatus([good, run.newItem({ serviceId: 'z', toSha: 'b' })]), 'running');
});

test('GET /api/v1/overview: cột sinh từ danh sách môi trường, nhóm theo dự án, dịch vụ cần chú ý đứng trước; bộ lọc', async (t) => {
  const b = await boot(t);
  assert.equal((await b.call('GET', '/api/v1/overview', undefined, false)).status, 401, 'phải đăng nhập');
  const ov = (await b.call('GET', '/api/v1/overview')).body;
  assert.deepEqual(ov.environments.map((e) => e.id), ['mau-thu', 'mau-that']);
  assert.ok(ov.environments.every((e) => /^#[0-9A-F]{6}$/i.test(e.color)));
  assert.deepEqual(ov.groups.map((g) => g.project.name).sort(), ['Sample group A', 'Sample group B']);
  assert.equal(ov.summary.services, 3);
  const tot = b.svcIn(ov, 'mau-tot');
  assert.deepEqual(Object.keys(tot.cells), ['mau-thu', 'mau-that']);
  const cell = tot.cells['mau-thu'];
  assert.deepEqual([cell.deployed, cell.health, cell.commit.sha, cell.head.sha, cell.behindCount], [true, 'healthy', commit('a'), commit('b'), 1]);
  assert.match(cell.commit.message, /mau-tot/);
  assert.equal(ov.summary.behind, 3, 'cả ba dịch vụ mẫu đều đang chạy bản cũ hơn bản đã khai');
  // Bộ lọc: theo dự án, theo môi trường (chỉ còn một cột), theo tên, theo trạng thái.
  const byProject = (await b.call('GET', `/api/v1/overview?projectId=${encodeURIComponent('Sample group B')}`)).body;
  assert.deepEqual(byProject.groups.flatMap((g) => g.services.map((s) => s.name)), ['mau-cho-build']);
  const oneEnv = (await b.call('GET', '/api/v1/overview?environmentId=mau-that')).body;
  assert.deepEqual(oneEnv.environments.map((e) => e.id), ['mau-that']);
  assert.deepEqual(Object.keys(b.svcIn(oneEnv, 'mau-tot').cells), ['mau-that']);
  assert.equal((await b.call('GET', '/api/v1/overview?q=hong')).body.groups.flatMap((g) => g.services).length, 1);
  assert.equal((await b.call('GET', '/api/v1/overview?status=failed')).body.groups.length, 0);
  assert.equal((await b.call('GET', '/api/v1/overview?status=behind')).body.groups.flatMap((g) => g.services).length, 3);
});

test('GET /api/v1/services/{id}: môi trường, commit kèm "đã có bản" và "đang chạy ở đâu", dòng thời gian; dịch vụ lạ là 404', async (t) => {
  const b = await boot(t);
  const d = (await b.call('GET', '/api/v1/services/mau-tot')).body;
  assert.equal(d.service.project, 'Sample group A');
  assert.equal(d.service.declared.sha, commit('b'));
  assert.deepEqual(d.environments.map((e) => e.environment.id), ['mau-thu', 'mau-that']);
  assert.deepEqual(d.commits.map((c) => [c.sha, c.build, c.declared, c.runningIn]), [[commit('b'), 'passed', true, []], [commit('a'), 'passed', false, ['mau-thu', 'mau-that']]]);
  assert.ok(d.deployments.length >= 2 && d.deployments.every((x) => x.environmentName && x.commit.sha));
  const wait = (await b.call('GET', '/api/v1/services/mau-cho-build')).body;
  assert.equal(wait.commits.find((c) => c.declared).build, 'none', 'commit đã khai mà chưa có bản');
  const missing = await b.call('GET', '/api/v1/services/khong-co');
  assert.deepEqual([missing.status, missing.body.error.code], [404, 'UNKNOWN_SERVICE']);
});

test('POST /api/v1/deployments/preflight: từ bản nào sang bản nào, thay đổi, gợi ý; chặn commit chưa có bản; không ghi gì', async (t) => {
  const b = await boot(t);
  const pre = (await b.call('POST', '/api/v1/deployments/preflight', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }, { serviceId: 'mau-cho-build' }] })).body;
  assert.equal(pre.canProceed, false, 'một mục bị chặn thì cả yêu cầu không đi tiếp được');
  const [tot, cho] = pre.items;
  assert.deepEqual([tot.from.sha, tot.to.sha, tot.to.build, tot.direction, tot.blockers.length], [commit('a'), commit('b'), 'passed', 'forward', 0]);
  assert.deepEqual(tot.changes.map((c) => c.sha), [commit('b')]);
  assert.equal(tot.suggestions[0].label, 'Declared commit');
  assert.deepEqual(cho.blockers.map((x) => x.code), ['BUILD_NOT_READY']);
  // Chọn đúng commit đang chạy; môi trường lạ; dịch vụ lạ; thiếu mục; mã commit sai dạng.
  const same = (await b.call('POST', '/api/v1/deployments/preflight', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot', targetSha: commit('a') }] })).body;
  assert.deepEqual(same.items[0].blockers.map((x) => x.code), ['ALREADY_RUNNING']);
  assert.equal((await b.call('POST', '/api/v1/deployments/preflight', { kind: 'deploy', environmentId: 'khong-co', items: [{ serviceId: 'mau-tot' }] })).status, 404);
  assert.equal((await b.call('POST', '/api/v1/deployments/preflight', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'la' }] })).status, 404);
  assert.equal((await b.call('POST', '/api/v1/deployments/preflight', { kind: 'deploy', environmentId: 'mau-thu', items: [] })).status, 400);
  assert.equal((await b.call('POST', '/api/v1/deployments/preflight', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot', targetSha: 'abc' }] })).status, 400);
  assert.equal((await b.call('POST', '/api/v1/deployments/preflight', { kind: 'xoa', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }] })).status, 400);
  assert.equal(b.board.world.running.get('bsn-mau-tot').commit, commit('a'), 'kiểm tra trước không đổi gì');
});

test('POST /api/v1/deployments: nhiều dịch vụ một lượt, mỗi mục độc lập (một bản tốt lên, một bản hỏng tự lùi); chỉ ở môi trường được chọn', async (t) => {
  const b = await boot(t);
  const res = await b.call('POST', '/api/v1/deployments', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }, { serviceId: 'mau-hong' }] });
  assert.equal(res.status, 201);
  await b.board.runs.settle();
  const done = (await b.call('GET', `/api/v1/runs/${res.body.runId}`)).body;
  const by = Object.fromEntries(done.items.map((i) => [i.serviceId, i]));
  assert.equal(done.status, 'rolled_back');
  assert.deepEqual([by['mau-tot'].status, by['mau-tot'].steps.map((s) => s.status)], ['succeeded', ['succeeded', 'succeeded', 'succeeded', 'succeeded']]);
  assert.equal(by['mau-hong'].status, 'rolled_back');
  assert.equal(by['mau-hong'].steps.find((s) => s.name === 'health').status, 'failed', 'thấy được bước nào hỏng');
  assert.equal(b.board.worlds[0].running.get('bsn-mau-tot').commit, commit('b'));
  assert.equal(b.board.worlds[0].running.get('bsn-mau-hong').commit, commit('c'), 'bản hỏng không ở lại');
  assert.equal(b.board.worlds[1].running.get('bsn-mau-tot').commit, commit('a'), 'môi trường kia không bị đụng');
  const logs = (await b.call('GET', `/api/v1/runs/${res.body.runId}/logs`)).body.items;
  assert.ok(logs.some((l) => l.serviceId === 'mau-tot' && /ĐÃ DEPLOY/.test(l.text)));
  assert.ok(logs.some((l) => l.serviceId === 'mau-hong' && l.level === 'warn'));
  const tail = (await b.call('GET', `/api/v1/runs/${res.body.runId}/logs?after=${logs[logs.length - 1].seq}`)).body.items;
  assert.equal(tail.length, 0, 'hỏi tiếp từ số thứ tự cuối thì không lấy lại dòng cũ');
  // Tổng quan phản ánh ngay: mau-tot ở mau-thu hết lệch.
  const ov = (await b.call('GET', '/api/v1/overview')).body;
  assert.equal(b.svcIn(ov, 'mau-tot').cells['mau-thu'].behindCount, 0);
  assert.equal(b.svcIn(ov, 'mau-tot').cells['mau-that'].behindCount, 1);
  // Rollback về bản liền trước qua cùng đường.
  const rb = await b.call('POST', '/api/v1/deployments', { kind: 'rollback', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }] });
  assert.equal(rb.status, 201);
  await b.board.runs.settle();
  assert.equal(b.board.worlds[0].running.get('bsn-mau-tot').commit, commit('a'));
});

test('POST /api/v1/deployments: có mục bị chặn thì 422 và KHÔNG mục nào chạy; đang chạy dở thì 409; hủy giữa chừng bị từ chối có lý do', async (t) => {
  const b = await boot(t, { delayMs: 150 });
  const blocked = await b.call('POST', '/api/v1/deployments', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }, { serviceId: 'mau-cho-build' }] });
  assert.deepEqual([blocked.status, blocked.body.error.code], [422, 'BLOCKED']);
  assert.equal(blocked.body.error.details.preflight.items[1].blockers[0].code, 'BUILD_NOT_READY');
  assert.equal(b.board.worlds[0].running.get('bsn-mau-tot').commit, commit('a'), 'tất cả hoặc không');
  const first = await b.call('POST', '/api/v1/deployments', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }] });
  assert.equal(first.status, 201);
  const again = await b.call('POST', '/api/v1/deployments', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }] });
  assert.deepEqual([again.status, again.body.error.code], [409, 'RUN_IN_PROGRESS']);
  const other = await b.call('POST', '/api/v1/deployments', { kind: 'deploy', environmentId: 'mau-that', items: [{ serviceId: 'mau-tot' }] });
  assert.equal(other.status, 201, 'cùng dịch vụ ở môi trường khác thì chạy song song');
  assert.equal((await b.call('GET', '/api/v1/runs?status=active')).body.items.length, 2);
  const cancel = await b.call('POST', `/api/v1/runs/${first.body.runId}/cancel`, {});
  assert.deepEqual([cancel.status, cancel.body.error.code], [409, 'NOT_CANCELLABLE']);
  await b.board.runs.settle();
  assert.equal((await b.call('GET', '/api/v1/runs?status=active')).body.items.length, 0);
  assert.equal((await b.call('GET', '/api/v1/runs/khong-co')).status, 404);
  assert.equal(BROKEN.length, 40);
});

test('log runtime và biến môi trường của dịch vụ: log theo môi trường, có giới hạn dòng; bí mật chỉ hiện tên, không bao giờ có giá trị', async (t) => {
  const b = await boot(t);
  const logs = await b.call('GET', '/api/v1/services/mau-tot/logs?environmentId=mau-thu&tail=3');
  assert.equal(logs.status, 200);
  assert.deepEqual([logs.body.lines.length, logs.body.lines[0].at, /sample log line 1 of mau-tot at aaaaaaa/.test(logs.body.lines[0].text)], [3, '2026-01-01T00:00:00.000000000Z', true]);
  assert.equal((await b.call('GET', '/api/v1/services/khong-co/logs?environmentId=mau-thu')).status, 404);
  assert.equal((await b.call('GET', '/api/v1/services/mau-tot/logs?environmentId=khong-co')).status, 404);
  assert.equal((await b.call('GET', '/api/v1/services/mau-tot/logs?environmentId=mau-thu', undefined, false)).status, 401);
  const vars = fleet.variablesOf({ env: { LOG_LEVEL: 'info' }, secretEnv: ['API_KEY'], database: { urlEnv: 'DATABASE_URL' } });
  assert.deepEqual(vars, [
    { name: 'API_KEY', value: null, secret: true, source: 'secretEnv' },
    { name: 'DATABASE_URL', value: null, secret: true, source: 'database' },
    { name: 'LOG_LEVEL', value: 'info', secret: false, source: 'env' },
  ]);
  assert.deepEqual((await b.call('GET', '/api/v1/services/mau-tot')).body.variables, []);
});

test('so sánh theo tệp giữa hai commit: danh sách tệp kèm số dòng thêm bớt và tổng; commit lạ hay sai dạng thì báo rõ', async (t) => {
  const b = await boot(t);
  const d = await b.call('GET', `/api/v1/services/mau-tot/diff?from=${commit('a')}&to=${commit('b')}`);
  assert.equal(d.status, 200);
  assert.deepEqual([d.body.files.length, d.body.totals, d.body.files[0].path], [1, { files: 1, added: 10, removed: 0 }, 'src/sample-bbbb.js']);
  assert.equal((await b.call('GET', `/api/v1/services/mau-tot/diff?from=${commit('a')}&to=${'9'.repeat(40)}`)).body.error.code, 'NO_HISTORY');
  assert.equal((await b.call('GET', '/api/v1/services/mau-tot/diff?from=abc&to=def')).status, 400);
  assert.equal((await b.call('GET', `/api/v1/services/khong-co/diff?from=${commit('a')}&to=${commit('b')}`)).status, 404);
});

test('dòng sự kiện (SSE): phải đăng nhập; lần chạy đổi thì trang nhận tên chủ đề "runs"; máy chủ tắt được dù còn trang đang nghe', async (t) => {
  const b = await boot(t);
  const { port } = b.board.server.server.address();
  const token = /<token>"\): (\S+)/.exec(b.board.world.firstLogin)[1];
  const open = (headers) => new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port, path: '/api/v1/events', headers: { host: `127.0.0.1:${port}`, ...headers } }, resolve); req.on('error', reject); req.end(); });
  const denied = await open({}); denied.resume();
  assert.equal(denied.statusCode, 401);
  const res = await open({ authorization: `Bearer ${token}` });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/event-stream/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff', 'dòng sự kiện vẫn mang các header bảo vệ');
  let text = ''; res.on('data', (c) => { text += c; });
  assert.equal(b.board.changes.listeners(), 1);
  await b.call('POST', '/api/v1/deployments', { kind: 'deploy', environmentId: 'mau-thu', items: [{ serviceId: 'mau-tot' }] });
  await b.board.runs.settle();
  await new Promise((r) => setTimeout(r, 50));
  assert.match(text, /^retry: 3000\n\n/);
  assert.ok(text.includes('data: runs\n\n'), 'có tin báo lần chạy đổi');
  assert.ok(!/aaaa|bbbb|mau-tot/.test(text), 'chỉ gửi tên chủ đề, không gửi dữ liệu');
  // t.after của boot đóng máy chủ trong lúc kết nối này còn mở: nếu máy chủ không tự đóng các dòng sự kiện thì test treo ở đây.
});
