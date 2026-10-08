'use strict';
// Bảng điều khiển qua HTTP: đăng nhập, quyền, nút Deploy và Rollback, việc trùng dịch vụ, chạy song song.
// Máy chủ web chạy thật trên một cổng ngẫu nhiên của 127.0.0.1; phía sau là CÙNG các ca sử dụng với hệ thật,
// lắp trên bộ nối trong bộ nhớ (dữ liệu mẫu). Không cần Docker, không cần mạng, không đụng hệ nào.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { buildMemoryConsole } = require('../src/composition');
const { sampleWorld, BROKEN, commit } = require('../src/infrastructure/memory/world');

async function boot(t, { delayMs = 0 } = {}) {
  const board = buildMemoryConsole({ world: sampleWorld({ delayMs }), port: 0, imagesTtlMs: 0 });
  await board.auth.ensure();
  const { port } = await board.server.listen();
  t.after(async () => { await board.jobs.settle(); await board.server.close(); });
  const password = /trình duyệt\): (\S+)/.exec(board.world.firstLogin)[1];
  const token = /<token>"\): (\S+)/.exec(board.world.firstLogin)[1];
  // Gọi HTTP thô để tự đặt được header Host và Cookie.
  const call = (method, path, { body, headers = {}, host } = {}) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { host: host || `127.0.0.1:${port}`, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let text = ''; res.on('data', (d) => { text += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* không phải JSON */ } resolve({ status: res.statusCode, headers: res.headers, body: json, text }); });
    });
    req.on('error', reject);
    req.end(data || undefined);
  });
  const agent = { authorization: `Bearer ${token}` };
  const state = async () => (await call('GET', '/api/state', { headers: agent })).body;
  const svc = async (name) => (await state()).services.find((s) => s.service === name);
  const press = (name, action, body = {}) => call('POST', `/api/services/${name}/${action}`, { body, headers: agent });
  const finish = async (id) => { await board.jobs.settle(); return (await call('GET', `/api/jobs/${id}`, { headers: agent })).body.job; };
  return { board, world: board.world, password, token, call, agent, state, svc, press, finish };
}

test('chưa đăng nhập: trang, tệp giao diện và /healthz mở được; mọi đường /api có dữ liệu đều 401', async (t) => {
  const b = await boot(t);
  assert.equal((await b.call('GET', '/healthz')).status, 200);
  const page = await b.call('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.text, /Deploy Console/);
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(page.text) && !/<style/.test(page.text), 'trang không có mã viết trong HTML');
  assert.equal(page.headers['content-security-policy'].includes('unsafe-inline'), false);
  const js = await b.call('GET', '/web/main.js');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
  assert.equal((await b.call('GET', '/web/views/overview.js')).status, 200);
  assert.equal((await b.call('GET', '/api/state')).status, 401);
  assert.equal((await b.press('mau-tot', 'deploy')).status, 202, 'có token thì được');
  assert.equal((await b.call('POST', '/api/services/mau-tot/deploy', { body: {} })).status, 401);
  assert.equal((await b.call('GET', '/api/state', { headers: { authorization: 'Bearer sai' } })).status, 401);
});

test('phục vụ tệp giao diện: không ra khỏi thư mục giao diện, không phục vụ loại tệp lạ', async (t) => {
  const b = await boot(t);
  for (const p of ['/web/..%2Fserver.js', '/web/%2e%2e/%2e%2e/composition.js', '/web/../http/server.js', '/web/khong-co.js', '/web/index.htmlx', '/khac']) {
    assert.equal((await b.call('GET', p)).status, 404, p);
  }
});

test('tên máy lạ trong header Host bị từ chối (chặn trang ngoài trỏ tên miền về 127.0.0.1)', async (t) => {
  const b = await boot(t);
  assert.equal((await b.call('GET', '/api/state', { headers: b.agent, host: 'ke-xau.example:80' })).status, 421);
  assert.equal((await b.call('GET', '/', { host: 'ke-xau.example' })).status, 421);
});

test('nơi lưu chỉ giữ dạng băm; sinh lại thì mật khẩu và token cũ hết dùng', async (t) => {
  const b = await boot(t);
  const stored = JSON.stringify(b.world.credentials);
  assert.ok(!stored.includes(b.password) && !stored.includes(b.token), 'nơi lưu không chứa bản rõ');
  assert.equal((await b.board.auth.ensure()).created, false, 'lần gọi sau không sinh lại');
  await b.board.auth.ensure({ reset: true });
  assert.equal((await b.call('GET', '/api/state', { headers: b.agent })).status, 401, 'token cũ hết dùng');
});

test('đăng nhập: thiếu header riêng bị từ chối; đúng thì có phiên; đăng xuất thì phiên hết; sai 5 lần thì khóa tạm rồi mở lại', async (t) => {
  const b = await boot(t);
  const H = { 'x-bsn-console': '1' };
  assert.equal((await b.call('POST', '/api/login', { body: { password: b.password } })).status, 400, 'thiếu header riêng');
  const ok = await b.call('POST', '/api/login', { body: { password: b.password }, headers: H });
  assert.equal(ok.status, 200);
  const cookie = ok.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  const sid = cookie.split(';')[0];
  const st = await b.call('GET', '/api/state', { headers: { cookie: sid } });
  assert.deepEqual([st.status, st.body.actor, st.body.memory], [200, 'admin', true]);
  assert.equal((await b.call('POST', '/api/services/mau-tot/deploy', { body: {}, headers: { cookie: sid } })).status, 400, 'phiên trình duyệt mà thiếu header riêng: coi như yêu cầu giả mạo');
  assert.equal((await b.call('POST', '/api/logout', { headers: { cookie: sid, ...H } })).status, 200);
  assert.equal((await b.call('GET', '/api/state', { headers: { cookie: sid } })).status, 401, 'đăng xuất thì phiên hết dùng');
  for (let i = 0; i < 5; i++) assert.equal((await b.call('POST', '/api/login', { body: { password: 'sai' }, headers: H })).status, 401);
  assert.equal((await b.call('POST', '/api/login', { body: { password: b.password }, headers: H })).status, 429, 'đang bị khóa tạm thì mật khẩu đúng cũng chưa vào được');
  b.world.time += 61000;
  assert.equal((await b.call('POST', '/api/login', { body: { password: b.password }, headers: H })).status, 200, 'hết thời gian khóa thì vào lại được');
});

test('phiên đăng nhập hết hạn sau 8 giờ', async (t) => {
  const b = await boot(t);
  const ok = await b.call('POST', '/api/login', { body: { password: b.password }, headers: { 'x-bsn-console': '1' } });
  const sid = ok.headers['set-cookie'][0].split(';')[0];
  b.world.time += 8 * 3600 * 1000 + 1000;
  assert.equal((await b.call('GET', '/api/state', { headers: { cookie: sid } })).status, 401);
});

test('trạng thái: mỗi dịch vụ có commit đã khai, bản đang chạy, đã có bản đóng gói chưa, lịch sử; đọc trạng thái không đổi gì', async (t) => {
  const b = await boot(t);
  const snapshot = () => JSON.stringify([[...b.world.running], b.world.ledger, b.world.manifest, [...b.world.images], [...b.world.locks]]);
  const before = snapshot();
  const s = await b.state();
  await b.state();
  assert.equal(snapshot(), before, 'đọc trạng thái là việc chỉ đọc');
  assert.deepEqual(s.services.map((x) => x.service), ['mau-tot', 'mau-hong', 'mau-cho-build']);
  const tot = s.services[0];
  assert.deepEqual({ declared: tot.declared, runningCommit: tot.runningCommit, matches: tot.matches, present: tot.image.present }, { declared: commit('b'), runningCommit: commit('a'), matches: false, present: true });
  assert.equal(s.services[2].image.present, false, 'bản chờ build');
  assert.equal(tot.history.length, 1);
});

test('nút Deploy: bản tốt lên và chạy; sổ ghi; ai bấm được ghi lại', async (t) => {
  const b = await boot(t);
  const r = await b.press('mau-tot', 'deploy');
  assert.equal(r.status, 202);
  const job = await b.finish(r.body.job.id);
  assert.deepEqual({ state: job.state, ok: job.ok, to: job.result.to }, { state: 'done', ok: true, to: commit('b') });
  assert.ok(job.result.log.some((l) => /ĐÃ DEPLOY mau-tot/.test(l)), 'kết quả kèm nhật ký của ca sử dụng');
  const s = await b.svc('mau-tot');
  assert.deepEqual({ runningCommit: s.runningCommit, matches: s.matches, previous: s.previous }, { runningCommit: commit('b'), matches: true, previous: commit('a') });
  assert.deepEqual({ action: s.history[0].action, by: s.history[0].by }, { action: 'deploy', by: 'agent' });
});

test('nút Deploy với bản hỏng: việc báo hỏng, bản cũ được bật lại, tờ khai báo không bị sửa', async (t) => {
  const b = await boot(t);
  const job = await b.finish((await b.press('mau-hong', 'deploy')).body.job.id);
  assert.deepEqual({ ok: job.ok, reverted: job.result.reverted }, { ok: false, reverted: 'ok' });
  const s = await b.svc('mau-hong');
  assert.deepEqual({ runningCommit: s.runningCommit, declared: s.declared, last: s.lastAttempt.result }, { runningCommit: commit('c'), declared: BROKEN, last: 'failed' });
  assert.deepEqual(s.history.map((h) => `${h.action}:${h.result}`), ['auto-revert:ok', 'deploy:failed', 'up:ok']);
});

test('nút Deploy với commit chờ build: bị từ chối kèm lý do, không đổi gì', async (t) => {
  const b = await boot(t);
  const job = await b.finish((await b.press('mau-cho-build', 'deploy')).body.job.id);
  assert.equal(job.ok, false);
  assert.equal(job.result.outcome, 'WAITING_BUILD');
  assert.match(job.result.reason, /CHỜ BUILD/);
  assert.equal((await b.svc('mau-cho-build')).runningCommit, commit('d'));
});

test('nút Rollback: về bản đã từng chạy, tờ khai báo được ghi lại; đầu vào sai, dịch vụ lạ, commit chưa từng khỏe đều bị từ chối', async (t) => {
  const b = await boot(t);
  await b.finish((await b.press('mau-tot', 'deploy')).body.job.id);
  const r = await b.press('mau-tot', 'rollback', { commit: commit('a').slice(0, 12) });
  assert.equal(r.status, 202);
  const job = await b.finish(r.body.job.id);
  assert.deepEqual({ ok: job.ok, to: job.result.to, declarationUpdated: job.result.declarationUpdated }, { ok: true, to: commit('a'), declarationUpdated: true });
  const s = await b.svc('mau-tot');
  assert.deepEqual({ runningCommit: s.runningCommit, declared: s.declared }, { runningCommit: commit('a'), declared: commit('a') });
  assert.equal((await b.press('mau-tot', 'rollback', { commit: 'abc; rm -rf /' })).status, 400);
  assert.equal((await b.press('mau-tot', 'deploy', { commit: commit('a') })).status, 400, 'deploy không nhận commit: chỉ đưa bản đã khai');
  assert.equal((await b.press('khong-co', 'deploy')).status, 404);
  assert.equal((await b.press('..%2Fx', 'deploy')).status, 400);
  await b.finish((await b.press('mau-hong', 'deploy')).body.job.id); // bản hỏng: có trong sổ nhưng chưa từng khỏe
  const no = await b.finish((await b.press('mau-hong', 'rollback', { commit: BROKEN.slice(0, 12) })).body.job.id);
  assert.equal(no.ok, false);
  assert.equal(no.result.outcome, 'NEVER_RAN_HERE');
});

test('cùng một dịch vụ: lần bấm thứ hai bị từ chối (409); hai dịch vụ khác nhau chạy song song và sổ không mất dòng nào', async (t) => {
  const b = await boot(t, { delayMs: 150 });
  const a = await b.press('mau-tot', 'deploy');
  const dup = await b.press('mau-tot', 'deploy');
  const other = await b.press('mau-hong', 'deploy');
  assert.deepEqual([a.status, dup.status, other.status], [202, 409, 202]);
  assert.match(dup.body.error, /chạy dở/);
  assert.equal(dup.body.job.id, a.body.job.id, 'câu từ chối chỉ ra việc đang chạy');
  const mid = await b.svc('mau-tot');
  assert.ok(mid.job && mid.busy, 'trạng thái cho biết dịch vụ đang có việc chạy dở và đang giữ khóa');
  const [ja, jo] = [await b.finish(a.body.job.id), await b.finish(other.body.job.id)];
  assert.deepEqual([ja.ok, jo.ok], [true, false]);
  assert.ok(jo.startedAt < ja.finishedAt && ja.startedAt < jo.finishedAt, 'hai việc chạy chồng thời gian lên nhau, không nối đuôi');
  assert.equal((await b.svc('mau-tot')).history[0].action, 'deploy');
  assert.equal((await b.svc('mau-hong')).history.length, 3, 'up, deploy hỏng, tự bật lại');
  assert.equal((await b.svc('mau-tot')).busy, null, 'xong thì nhả khóa');
});

test('tờ khai báo hỏng: bảng điều khiển báo lỗi rõ thay vì hiện trạng thái sai, và không nhận việc', async (t) => {
  const b = await boot(t);
  b.world.manifest.services['mau-tot'].port.local = 80;
  const r = await b.call('GET', '/api/state', { headers: b.agent });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /cổng local phải là số nguyên từ 8000/);
  assert.equal((await b.press('mau-tot', 'deploy')).status, 502);
});
