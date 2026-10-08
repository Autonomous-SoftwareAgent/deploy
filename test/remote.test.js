'use strict';
// ĐÍCH TỪ XA: bảng điều khiển ở máy này ra lệnh cho một máy khác qua cổng RemoteShell.
// Không cần mạng: đường SSH được thay bằng bản giả; "máy đích" trong test đầu-cuối là các ca sử dụng thật trên bộ nối trong bộ nhớ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { validateTarget, describeTarget } = require('../src/domain/target');
const { makeRemoteTarget, scripts, jsonLines } = require('../src/application/remote-target');
const { makeRemoteJobExecutor } = require('../src/application/remote-jobs');
const { makeGcloudSshShell } = require('../src/infrastructure/gcloud-ssh-shell');
const { makeFsTargets } = require('../src/infrastructure/fs-targets');
const { makeLayout } = require('../src/infrastructure/layout');
const { assemble, memoryPorts, buildRemoteConsole } = require('../src/composition');
const { sampleWorld, commit, BROKEN } = require('../src/infrastructure/memory/world');

const TARGET = { name: 'thu', transport: 'gcloud-ssh', configuration: 'bsn', instance: 'may-thu-1', zone: 'asia-southeast1-a', root: '/opt/bsn' };
const clock = { millis: () => Date.now(), now: () => new Date().toISOString() };
const random = { bytes: (n) => Buffer.alloc(n, 0xab) };
const noSleep = async () => {};

test('tờ khai đích: chỉ nhận ký tự an toàn cho dòng lệnh; đường dẫn cài phải tuyệt đối và không thoát ra ngoài', () => {
  assert.deepEqual(validateTarget(TARGET), []);
  assert.deepEqual(validateTarget({ ...TARGET, configuration: undefined }), [], 'không khai cấu hình gcloud thì dùng mặc định');
  for (const bad of [{ instance: 'a; rm -rf /' }, { zone: 'x y' }, { root: 'opt/bsn' }, { root: '/opt/../etc' }, { root: '/opt/bsn; id' }, { transport: 'telnet' }, { name: 'Tên' }, { configuration: '--flag' }]) {
    assert.notDeepEqual(validateTarget({ ...TARGET, ...bad }), [], JSON.stringify(bad));
  }
  assert.notDeepEqual(validateTarget(null), []);
  assert.match(describeTarget(TARGET), /may-thu-1.*asia-southeast1-a/);
});

test('tờ khai đích trên đĩa: thiếu tệp hoặc sai thì báo rõ; tên đích không được thoát khỏi thư mục targets/', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-target-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(makeLayout(root).base, 'targets');
  fs.mkdirSync(dir, { recursive: true });
  const { name, ...body } = TARGET;
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(body));
  fs.writeFileSync(path.join(dir, 'hong.json'), JSON.stringify({ ...body, zone: 'x y' }));
  const targets = makeFsTargets({ layout: makeLayout(root) });
  assert.deepEqual(targets.load('thu'), TARGET);
  assert.throws(() => targets.load('khong-co'), /không có tờ khai đích/);
  assert.throws(() => targets.load('hong'), /zone/);
  assert.throws(() => targets.load('../../etc/passwd'), /tên đích/);
});

test('đoạn lệnh gửi sang máy đích: từ chối mọi giá trị sai dạng; việc được bắt đầu tách rời khỏi phiên SSH', () => {
  const sh = scripts('/opt/bsn');
  const ok = { id: 'abababababababab', action: 'deploy', service: 'shop', by: 'admin' };
  const start = sh.start(ok);
  assert.match(start, /setsid nohup sh -c 'BSN_ACTOR=admin node infra\/bsn\.js deploy shop --apply --json --events > .*abababababababab\.out/);
  assert.match(start, /echo \$\? > \/opt\/bsn\/infra\/local\/\.run\/jobs\/abababababababab\.code/);
  assert.match(sh.start({ ...ok, action: 'rollback', commit: 'abc1234' }), /rollback shop abc1234 --apply/);
  for (const bad of [{ service: 'shop; id' }, { service: '$(id)' }, { action: 'up' }, { by: 'a b' }, { by: "x'y" }, { id: '../x' }, { commit: 'abc; id' }, { commit: 'xyz' }]) {
    assert.throws(() => sh.start({ ...ok, ...bad }), /không hợp lệ/, JSON.stringify(bad));
  }
  assert.throws(() => sh.poll('x; id'), /không hợp lệ/);
  assert.deepEqual(jsonLines('Warning: lạ\n{"a":1}\nrác {\n {"b":2} \n'), [{ a: 1 }, { b: 2 }], 'bỏ qua dòng chữ SSH chen vào');
});

test('đọc trạng thái từ máy đích: một lần gọi cho cả check lẫn getStatus; tờ khai báo hỏng và mất kết nối đều thành lỗi có lời', async () => {
  const calls = [];
  let reply = { code: 0, stdout: 'Warning: Permanently added host\n' + JSON.stringify({ ok: true, dockerReachable: true, services: [{ service: 'shop', pinned: commit('a') }] }) + '\n', stderr: '' };
  const shell = { exec: async (s) => { calls.push(s); return reply; } };
  const remote = makeRemoteTarget({ shell, clock, root: '/opt/bsn' });
  const checked = await remote.check();
  assert.deepEqual([checked.ok, Object.keys(checked.manifest.services)], [true, ['shop']]);
  assert.equal((await remote.getStatus()).services[0].pinned, commit('a'));
  assert.deepEqual(calls, ['cd /opt/bsn && node infra/bsn.js status --json'], 'chỉ một lần gọi sang máy đích');
  remote.forget();
  reply = { code: 1, stdout: JSON.stringify({ ok: false, errors: ['services.shop: cổng local trùng'] }), stderr: '' };
  assert.match((await remote.check()).errors[0], /tờ khai báo trên máy đích không hợp lệ: services\.shop/);
  remote.forget();
  reply = { code: 255, stdout: '', stderr: 'ssh: connect to host 1.2.3.4 port 22: Connection timed out' };
  const lost = await remote.check();
  assert.deepEqual([lost.ok, lost.unreachable], [false, true], 'mất kết nối được phân biệt với tờ khai báo sai');
  assert.match(lost.errors[0], /không đọc được trạng thái từ máy đích \(mã thoát 255\).*Connection timed out/);
});

test('việc trên máy đích: hỏi lại tới khi xong; mạng chập chờn thì hỏi tiếp; lệnh không trả JSON thì báo kèm dòng lỗi', async () => {
  const sent = [];
  let polls = 0;
  const shell = {
    exec: async (s) => {
      sent.push(s);
      if (s.includes('setsid')) return { code: 0, stdout: '{"started":"abababababababab"}\n', stderr: '' };
      polls += 1;
      if (polls === 1) return { code: 0, stdout: '{"done":false}\n', stderr: '' };
      if (polls === 2) return { code: 255, stdout: '', stderr: 'mạng rớt' };
      return { code: 0, stdout: '{"done":true,"code":0}\n' + JSON.stringify({ ok: true, service: 'shop', action: 'deploy', to: commit('b'), log: ['ĐÃ DEPLOY'] }) + '\n\nERR: \n', stderr: '' };
    },
  };
  let settled = 0;
  const ex = makeRemoteJobExecutor({ shell, random, root: '/opt/bsn', sleep: noSleep, onSettled: () => { settled += 1; } });
  const res = await ex.run({ service: 'shop', action: 'deploy', commit: null, by: 'agent' });
  assert.deepEqual([res.ok, res.to, polls, settled], [true, commit('b'), 3, 1]);
  assert.match(sent[0], /BSN_ACTOR=agent node infra\/bsn\.js deploy shop --apply --json/);

  const silent = { exec: async (s) => (s.includes('setsid') ? { code: 0, stdout: '{"started":"abababababababab"}', stderr: '' } : { code: 0, stdout: '{"done":true,"code":1}\n\nERR: LỖI: sổ deploy có schema 2 \n', stderr: '' }) };
  const bad = await makeRemoteJobExecutor({ shell: silent, random, root: '/opt/bsn', sleep: noSleep }).run({ service: 'shop', action: 'deploy', by: 'agent' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /mã thoát 1.*sổ deploy có schema 2/);

  const dead = { exec: async () => ({ code: 255, stdout: '', stderr: 'ssh: Connection refused' }) };
  const no = await makeRemoteJobExecutor({ shell: dead, random, root: '/opt/bsn', sleep: noSleep }).run({ service: 'shop', action: 'deploy', by: 'agent' });
  assert.match(no.reason, /không bắt đầu được việc trên máy đích.*Connection refused/);

  let n = 0;
  const flaky = { exec: async (s) => (s.includes('setsid') ? { code: 0, stdout: '{"started":"abababababababab"}', stderr: '' } : (n += 1, { code: 255, stdout: '', stderr: 'rớt' })) };
  const gone = await makeRemoteJobExecutor({ shell: flaky, random, root: '/opt/bsn', sleep: noSleep }).run({ service: 'shop', action: 'deploy', by: 'agent' });
  assert.equal(n, 10);
  assert.match(gone.reason, /mất liên lạc.*có thể vẫn đang chạy/);
});

// Tiến trình con giả: ghi lại lệnh và tham số, trả đầu ra đã định.
function fakeSpawn(replies) {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    const call = { cmd, args, shell: !!opts.shell, input: null };
    child.stdin = { on() {}, end(text) { call.input = text; } };
    child.kill = () => {};
    calls.push(call);
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    setImmediate(() => { if (reply.stdout) child.stdout.emit('data', reply.stdout); if (reply.stderr) child.stderr.emit('data', reply.stderr); child.emit('close', reply.code); });
    return child;
  };
  return { spawnImpl, calls };
}

test('đường SSH: hỏi gcloud một lần rồi gọi thẳng ssh; đoạn lệnh đi qua đầu vào chuẩn; khóa máy chủ ghi theo tên máy', async () => {
  const dry = { code: 0, stdout: '"C:\\sdk\\putty.exe" -t -i C:\\Users\\X\\.ssh\\google_compute_engine.ppk NGUOI_DUNG@34.1.2.3\n', stderr: '' };
  const f = fakeSpawn([dry, { code: 0, stdout: 'kết quả 1', stderr: '' }, { code: 0, stdout: 'kết quả 2', stderr: '' }]);
  const shell = makeGcloudSshShell({ target: TARGET, stateDir: '/trang-thai', keyFile: '/khoa', spawnImpl: f.spawnImpl });
  const script = "echo 'có dấu nháy' && echo \"$HOME\" | cat";
  assert.equal((await shell.exec(script)).stdout, 'kết quả 1');
  assert.equal((await shell.exec('ls')).stdout, 'kết quả 2');
  assert.deepEqual(f.calls.map((c) => c.cmd), ['gcloud', 'ssh', 'ssh'], 'gcloud chỉ được hỏi một lần');
  const other = fakeSpawn([dry, { code: 0, stdout: '', stderr: '' }]);
  await makeGcloudSshShell({ target: TARGET, stateDir: '/s', sshBin: '/duong/toi/ssh', spawnImpl: other.spawnImpl }).exec('ls');
  assert.equal(other.calls[1].cmd, '/duong/toi/ssh', 'chọn được bản ssh khác (BSN_SSH)');
  assert.deepEqual(f.calls[0].args, ['--configuration', 'bsn', 'compute', 'ssh', 'may-thu-1', '--zone', 'asia-southeast1-a', '--quiet', '--dry-run']);
  const ssh = f.calls[1];
  assert.equal(ssh.shell, false, 'ssh được gọi không qua lớp vỏ nào');
  assert.equal(ssh.input, script, 'đoạn lệnh đi nguyên vẹn qua đầu vào chuẩn');
  assert.deepEqual(ssh.args.slice(-2), ['NGUOI_DUNG@34.1.2.3', 'bash -s']);
  assert.ok(ssh.args.includes('HostKeyAlias=bsn-asia-southeast1-a-may-thu-1') && ssh.args.includes('StrictHostKeyChecking=accept-new') && ssh.args.includes('BatchMode=yes'));
  assert.ok(ssh.args.includes('/khoa') && ssh.args.some((a) => a.startsWith('UserKnownHostsFile=') && a.includes('trang-thai')));
});

test('đường SSH: không nối được (máy vừa tắt bật, đổi địa chỉ) thì hỏi lại gcloud một lần; gcloud không trả địa chỉ thì báo lỗi có lời', async () => {
  const dry = (ip) => ({ code: 0, stdout: `x@${ip}`, stderr: '' });
  const f = fakeSpawn([dry('10.0.0.1'), { code: 255, stdout: '', stderr: 'timed out' }, dry('10.0.0.2'), { code: 0, stdout: 'được', stderr: '' }]);
  const shell = makeGcloudSshShell({ target: TARGET, stateDir: '/s', spawnImpl: f.spawnImpl });
  assert.equal((await shell.exec('ls')).stdout, 'được');
  assert.deepEqual(f.calls.map((c) => c.cmd), ['gcloud', 'ssh', 'gcloud', 'ssh']);
  assert.ok(f.calls[3].args.includes('x@10.0.0.2'));
  const g = fakeSpawn([{ code: 1, stdout: '', stderr: 'ERROR: (gcloud.compute.ssh) Could not fetch resource' }]);
  const res = await makeGcloudSshShell({ target: TARGET, stateDir: '/s', spawnImpl: g.spawnImpl }).exec('ls');
  assert.equal(res.code, 1);
  assert.match(res.stderr, /gcloud không cho biết địa chỉ của máy may-thu-1.*Could not fetch resource/);
});

// "Máy đích" trong bộ nhớ: nhận các đoạn lệnh như máy thật (status, images, bắt đầu việc, hỏi việc) và chạy các ca sử dụng thật.
function loopbackShell(world) {
  const ports = memoryPorts(world);
  const app = assemble(ports);
  const jobs = new Map();
  const manifest = () => ports.declarations.load();
  return {
    exec: async (script) => {
      if (script.endsWith('status --json')) return { code: 0, stdout: JSON.stringify(await app.getStatus({ manifest: await manifest() })), stderr: '' };
      if (script.endsWith('images --json')) return { code: 0, stdout: JSON.stringify(await app.getImages({ manifest: await manifest() })), stderr: '' };
      const start = /BSN_ACTOR=(\S+) node infra\/bsn\.js (deploy|rollback) (\S+?)(?: ([0-9a-f]+))? --apply --json --events > \S+\/([a-f0-9]+)\.out/.exec(script);
      if (start) {
        const [, by, action, name, ref, id] = start;
        const log = [];
        const input = { manifest: await manifest(), name, ref, apply: true, seconds: 2, by, say: (l) => log.push(l) };
        jobs.set(id, null);
        (action === 'deploy' ? app.deploy(input) : app.rollback(input)).then((r) => jobs.set(id, { ...r, log }));
        return { code: 0, stdout: `{"started":"${id}"}`, stderr: '' };
      }
      const poll = /\/([a-f0-9]+)\.code \]/.exec(script);
      if (poll) { const r = jobs.get(poll[1]); return { code: 0, stdout: r ? `{"done":true,"code":${r.ok ? 0 : 1}}\n${JSON.stringify(r)}\n\nERR: \n` : '{"done":false}\n', stderr: '' }; }
      return { code: 127, stdout: '', stderr: `máy đích giả không hiểu: ${script}` };
    },
  };
}

test('đầu-cuối: bảng điều khiển ở máy này, hệ ở máy đích: trạng thái ghi rõ đích; Deploy, bản hỏng tự lùi, Rollback đều chạy trên máy đích', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-remote-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  const world = sampleWorld();
  const board = buildRemoteConsole({ root, port: 0, target: TARGET, shell: loopbackShell(world), pollMs: 5 });
  await board.auth.ensure();
  const { port } = await board.server.listen();
  t.after(async () => { await board.jobs.settle(); await board.server.close(); });
  const token = /<token>"\): (\S+)/.exec(fs.readFileSync(path.join(makeLayout(root).run, 'console.first-login.txt'), 'utf8'))[1];
  const call = (method, p, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { authorization: `Bearer ${token}`, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let text = ''; res.on('data', (d) => { text += d; }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject); req.end(data || undefined);
  });
  const finish = async (id) => { await board.jobs.settle(); return (await call('GET', `/api/jobs/${id}`)).body.job; };

  const s = (await call('GET', '/api/state')).body;
  assert.match(s.target, /thu \(máy may-thu-1/);
  assert.deepEqual(s.services.map((x) => [x.service, x.image.present]), [['mau-tot', true], ['mau-hong', true], ['mau-cho-build', false]]);

  const ok = await finish((await call('POST', '/api/services/mau-tot/deploy', {})).body.job.id);
  assert.deepEqual([ok.ok, ok.result.to], [true, commit('b')]);
  assert.equal(world.running.get('bsn-mau-tot').commit, commit('b'), 'bản đổi trên MÁY ĐÍCH');
  assert.equal(world.ledger.services['mau-tot'].history.at(-1).by, 'agent', 'sổ deploy của máy đích ghi ai yêu cầu');

  const bad = await finish((await call('POST', '/api/services/mau-hong/deploy', {})).body.job.id);
  assert.deepEqual([bad.ok, bad.result.reverted], [false, 'ok']);
  assert.equal(world.running.get('bsn-mau-hong').commit, commit('c'));
  assert.equal(world.manifest.services['mau-hong'].commit, BROKEN, 'tờ khai báo trên máy đích không bị sửa');

  const back = await finish((await call('POST', '/api/services/mau-tot/rollback', { commit: commit('a').slice(0, 12) })).body.job.id);
  assert.deepEqual([back.ok, back.result.declarationUpdated], [true, true]);
  assert.equal(world.manifest.services['mau-tot'].commit, commit('a'), 'tờ khai báo được ghi lại TRÊN MÁY ĐÍCH');
  assert.equal((await call('POST', '/api/services/khong-co/deploy', {})).status, 404);
  assert.equal((await call('GET', '/api/state')).body.services[0].runningCommit, commit('a'), 'trạng thái đọc lại ngay sau khi việc xong');
});

test('đích từ xa: mỗi lần hỏi máy đích trả cả đầu ra từ đầu, bộ chạy việc chỉ báo các sự kiện MỚI', async () => {
  const { makeRemoteJobExecutor } = require('../src/application/remote-jobs');
  const e1 = JSON.stringify({ event: 'step', step: 'fetch', status: 'running', phase: 'forward' });
  const e2 = JSON.stringify({ event: 'log', text: 'đã kéo bản' });
  const result = JSON.stringify({ ok: true, service: 'shop', action: 'deploy' });
  const outs = [`${e1}\n\n{"done":false}\n`, `${e1}\n${e2}\n\n{"done":false}\n`, `${e1}\n${e2}\n${result}\n\n{"done":true,"code":0}\nERR: \n`];
  let n = 0;
  const shell = { exec: async (script) => (script.includes('setsid') ? { code: 0, stdout: /"started":"([a-f0-9]+)"/.exec(script) ? `{"started":"${/"started":"([a-f0-9]+)"/.exec(script)[1]}"}` : '', stderr: '' } : { code: 0, stdout: outs[Math.min(n++, outs.length - 1)], stderr: '' }) };
  const seen = [];
  const ex = makeRemoteJobExecutor({ shell, random: { bytes: (k) => Buffer.alloc(k, 0xab) }, root: '/opt/bsn', pollMs: 1, sleep: async () => {} });
  const res = await ex.run({ service: 'shop', action: 'deploy', by: 'admin' }, { onEvent: (e) => seen.push(e) });
  assert.equal(res.ok, true);
  assert.equal(res.event, undefined);
  assert.deepEqual(seen.map((e) => e.event + ':' + (e.step || e.text)), ['step:fetch', 'log:đã kéo bản'], 'không báo lặp sự kiện cũ');
});
