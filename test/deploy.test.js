'use strict';
// deploy và rollback (chặng 5): đưa bản đã khai lên, kiểm sức khỏe, hỏng thì tự bật lại bản trước; lùi về bản đã từng chạy.
// Không cần Docker: lệnh docker được thay bằng một bản giả CÓ TRẠNG THÁI (ảnh ở máy, bản trên kho, container đang chạy);
// việc chờ khỏe được tiêm vào. git chạy thật trên repo tạm.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run: defaultRun } = require('../src/infrastructure/process-runner');
const { makeLayout } = require('../src/infrastructure/layout');
const { localPorts } = require('../src/composition');
const naming = require('../src/domain/naming');
const ledgerOf = require('../src/domain/ledger');

// Sổ deploy và khóa của một workspace, đọc qua đúng các bộ nối mà lệnh dùng.
const book = (ws) => localPorts({ root: ws.root }).ledger.read();
const locksOf = (ws) => localPorts({ root: ws.root }).locks;
const { main } = require('../bsn');

function sh(cwd, ...args) {
  const r = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const PLATFORM = { schema: 1, github: { org: 'acme', platformRepo: 'deploy', serviceRepoPrefix: 'svc-' }, registry: { namespace: 'acme', repoPrefix: 'svc-', branch: 'main', keep: 20 } };

// Workspace giả: dịch vụ "shop" có ba commit c[0], c[1], c[2]; tờ khai báo chưa ghim.
function makeWorkspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-deploy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  const repo = path.join(root, 'system_service', 'shop');
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, 'Dockerfile'), 'FROM scratch\n');
  sh(repo, 'git', 'init', '-q');
  const c = [];
  for (const v of ['v1', 'v2', 'v3']) {
    fs.writeFileSync(path.join(repo, 'app.txt'), v + '\n');
    sh(repo, 'git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
    sh(repo, 'git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', v);
    c.push(sh(repo, 'git', 'rev-parse', 'HEAD'));
  }
  const file = path.join(root, 'infra', 'services', 'shop.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const write = (commit) => fs.writeFileSync(file, JSON.stringify({ repo: 'system_service/shop', commit, port: { local: 8000, container: 8080 }, health: '/health', secretEnv: ['SHOP_TOKEN'], database: { name: 'shop', urlEnv: 'SHOP_DB', urlFormat: 'postgres://{user}:{password}@{host}:{port}/{db}' }, topics: ['shop.events'] }, null, 2));
  write(null);
  fs.writeFileSync(path.join(root, 'infra', 'platform.json'), JSON.stringify(PLATFORM));
  return { root, c, pin: write, pinned: () => JSON.parse(fs.readFileSync(file, 'utf8')).commit };
}

// Docker giả có trạng thái. local: nhãn ảnh ở máy -> commit ghi bên trong; remote: tên bản trên kho -> commit; running: tên container -> commit.
function world() {
  const w = { local: new Map(), remote: new Map(), running: new Map(), calls: [], bad: new Set() };
  w.run = (cmd, args, opts) => {
    if (cmd !== 'docker') return defaultRun(cmd, args, opts);
    w.calls.push(args.join(' '));
    const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
    const no = (stderr = 'not found') => ({ status: 1, stdout: '', stderr });
    if (args[0] === 'ps' && args[1] === '--filter') { const n = /\^(.+)\$/.exec(args[2])[1]; return ok(w.running.has(n) ? w.running.get(n) + '\n' : ''); }
    if (args[0] === 'ps') return ok([...w.running].map(([n, c]) => `${n}\t${c}\tUp 1 minute (healthy)`).join('\n'));
    if (args[0] === 'manifest') return w.remote.has(args[2]) ? ok('{}') : no('no such manifest');
    if (args[0] === 'image' && args[2] === '--format') { const c = w.local.get(args[4]); return c ? ok(args[3].includes('|') ? `${c}|${c}\n` : `${c}\n`) : no(); }
    if (args[0] === 'image') return w.local.has(args[2]) ? ok('[]') : no();
    if (args[0] === 'pull') { if (!w.remote.has(args[1])) return no('manifest unknown'); w.local.set(args[1], w.remote.get(args[1])); return ok(); }
    if (args[0] === 'tag') { w.local.set(args[2], w.local.get(args[1])); return ok(); }
    if (args[0] === 'exec') return ok('1\nshop.events  3\n');
    if (args[0] === 'compose' && args.includes('--env-file')) return ok(); // tầng dùng chung
    if (args[0] === 'compose') {
      const j = JSON.parse(fs.readFileSync(args[args.indexOf('-f') + 1], 'utf8'));
      for (const s of Object.values(j.services)) w.running.set(s.container_name, s.labels['bsn.commit']);
      return ok();
    }
    return ok();
  };
  // Chờ khỏe: commit đang chạy nằm trong w.bad thì coi như không khỏe.
  w.health = async () => { const c = w.running.get('bsn-shop'); if (w.bad.has(c)) throw new Error('không khỏe sau 1 giây (HTTP 500)'); return true; };
  w.publish = (commit) => w.remote.set(naming.remoteImage(PLATFORM, 'shop', commit), commit);
  return w;
}

const cli = (ws, w, argv, lines = []) => main(argv, { root: ws.root, run: w.run, health: w.health, healthSeconds: 1, log: (s) => lines.push(s) });

// Đưa hệ về trạng thái "c[i] đang chạy khỏe và sổ đã ghi" bằng chính lệnh deploy.
async function running(ws, w, commit) {
  w.publish(commit);
  ws.pin(commit);
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply']), 0);
  assert.equal(w.running.get('bsn-shop'), commit);
}

test('deploy không --apply: chỉ in kế hoạch, không kéo, không bật, không ghi sổ', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  ws.pin(ws.c[0]); w.publish(ws.c[0]);
  const lines = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop'], lines), 0);
  assert.match(lines.join('\n'), /Chưa làm gì/);
  assert.ok(!w.calls.some((c) => /^(pull|compose|tag|build)/.test(c)));
  assert.ok(!fs.existsSync(makeLayout(ws.root).ledger));
});

test('deploy từ chối commit đã khai mà CHƯA có bản (chờ build): mã thoát 1, không đổi gì', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  ws.pin(ws.c[1]); // khai c1 nhưng chưa có bản trên kho
  const lines = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply'], lines), 1);
  assert.match(lines.join('\n'), /CHỜ BUILD/);
  assert.equal(w.running.get('bsn-shop'), ws.c[0], 'bản đang chạy giữ nguyên');
  assert.equal((await book(ws)).services.shop.history.length, 1, 'lần bị từ chối không ghi vào sổ như một lần deploy');
});

test('deploy thành công: kéo bản, kiểm commit bên trong, bật, khỏe; sổ ghi bản đang chạy và bản liền trước; có --json', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  ws.pin(ws.c[1]); w.publish(ws.c[1]);
  const out = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply', '--json'], out), 0);
  assert.equal(out.length, 1, '--json in đúng một đối tượng');
  const j = JSON.parse(out[0]);
  assert.deepEqual({ ok: j.ok, action: j.action, from: j.from, to: j.to, healthy: j.healthy }, { ok: true, action: 'deploy', from: ws.c[0], to: ws.c[1], healthy: true });
  assert.equal(w.running.get('bsn-shop'), ws.c[1]);
  assert.ok(w.calls.includes(`pull acme/svc-shop:main-${ws.c[1].slice(0, 12)}`));
  const s = (await book(ws)).services.shop;
  assert.equal(s.current.commit, ws.c[1]);
  assert.equal(s.previous.commit, ws.c[0]);
  assert.ok(!w.calls.some((c) => c.includes('--remove-orphans')), 'deploy một dịch vụ không được dọn dịch vụ khác');
});

test('deploy bản hỏng: không khỏe thì tự bật lại bản đang chạy trước đó, mã thoát 1, sổ ghi cả lần hỏng lẫn lần bật lại', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  await running(ws, w, ws.c[1]);
  ws.pin(ws.c[2]); w.publish(ws.c[2]); w.bad.add(ws.c[2]);
  const out = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply', '--json'], out), 1);
  const j = JSON.parse(out[0]);
  assert.equal(j.ok, false);
  assert.equal(j.reverted, 'ok');
  assert.match(j.reason, /không khỏe/);
  assert.equal(w.running.get('bsn-shop'), ws.c[1], 'bản cũ đang chạy lại');
  const s = (await book(ws)).services.shop;
  assert.equal(s.current.commit, ws.c[1], 'sổ vẫn ghi bản cũ là bản đang chạy');
  assert.deepEqual(s.history.slice(-2).map((h) => `${h.action}:${h.result}`), ['deploy:failed', 'auto-revert:ok']);
  assert.equal(ws.pinned(), ws.c[2], 'tờ khai báo không bị sửa: status sẽ thấy chỗ lệch giữa bản muốn và bản chạy');
  assert.equal(ledgerOf.ranOk(await book(ws), 'shop', ws.c[2]), false);
});

test('deploy lần đầu mà hỏng: không có bản trước để bật lại thì nói rõ, không giả vờ đã lùi', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  ws.pin(ws.c[0]); w.publish(ws.c[0]); w.bad.add(ws.c[0]);
  const out = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply', '--json'], out), 1);
  const j = JSON.parse(out[0]);
  assert.equal(j.reverted, 'none');
  assert.match(j.log.join('\n'), /Không có bản nào đang chạy trước đó/);
});

test('deploy khi đang chạy đúng bản đã khai: không đổi gì', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  const before = w.calls.length;
  const lines = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply'], lines), 0);
  assert.match(lines.join('\n'), /đang chạy đúng bản đã khai/);
  assert.ok(!w.calls.slice(before).some((c) => /^(pull|compose)/.test(c)));
});

test('ảnh có sẵn ở máy trùng nhãn nhưng bên trong ghi commit khác: không dùng, coi là hỏng và bật lại bản trước', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  ws.pin(ws.c[1]); w.publish(ws.c[1]);
  w.local.set(naming.localImage('shop', ws.c[1]), 'e'.repeat(40)); // ảnh giả mạo ở máy
  const out = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply', '--json'], out), 1);
  assert.match(JSON.parse(out[0]).reason, /khác commit cần chạy/);
  assert.equal(w.running.get('bsn-shop'), ws.c[0]);
});

test('rollback mặc định lùi về bản liền trước, ghi lại tờ khai báo; không --apply thì chỉ in kế hoạch', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  await running(ws, w, ws.c[1]);
  const plan = [];
  assert.equal(await cli(ws, w, ['rollback', 'shop'], plan), 0);
  assert.match(plan.join('\n'), /Chưa làm gì/);
  assert.equal(w.running.get('bsn-shop'), ws.c[1]);
  const lines = [];
  assert.equal(await cli(ws, w, ['rollback', 'shop', '--apply'], lines), 0);
  assert.equal(w.running.get('bsn-shop'), ws.c[0]);
  assert.equal(ws.pinned(), ws.c[0], 'tờ khai báo khớp với thứ đang chạy');
  assert.match(lines.join('\n'), /nhớ commit và đẩy repo deploy/);
  const s = (await book(ws)).services.shop;
  assert.equal(s.current.commit, ws.c[0]);
  assert.equal(s.previous.commit, ws.c[1]);
  assert.equal(s.history[s.history.length - 1].action, 'rollback');
});

test('rollback về một commit chỉ định bằng tiền tố; commit chưa từng chạy khỏe ở đây thì từ chối', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  await running(ws, w, ws.c[1]);
  await running(ws, w, ws.c[2]);
  assert.equal(await cli(ws, w, ['rollback', 'shop', ws.c[0].slice(0, 10), '--apply']), 0);
  assert.equal(w.running.get('bsn-shop'), ws.c[0]);
  const lines = [];
  assert.equal(await cli(ws, w, ['rollback', 'shop', 'd'.repeat(40), '--apply'], lines), 1);
  assert.match(lines.join('\n'), /chưa từng chạy khỏe/);
  assert.equal(w.running.get('bsn-shop'), ws.c[0]);
});

test('rollback khi chưa có bản liền trước, và khi bản cần lùi về đã bị dọn khỏi máy lẫn khỏi kho', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  const a = [];
  assert.equal(await cli(ws, w, ['rollback', 'shop', '--apply'], a), 1);
  assert.match(a.join('\n'), /chưa có gì để lùi về/);
  await running(ws, w, ws.c[1]);
  w.local.clear(); w.remote.delete(naming.remoteImage(PLATFORM, 'shop', ws.c[0])); // bản c0 bị dọn ở cả hai nơi
  const b = [];
  assert.equal(await cli(ws, w, ['rollback', 'shop', '--apply'], b), 1);
  assert.match(b.join('\n'), /đã bị dọn/);
  assert.equal(w.running.get('bsn-shop'), ws.c[1]);
  assert.equal(ws.pinned(), ws.c[1], 'lùi không thành thì tờ khai báo không đổi');
});

test('status nêu thông tin từ sổ deploy; sổ giữ tối đa 50 dòng', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  await running(ws, w, ws.c[1]);
  const lines = [];
  await cli(ws, w, ['status'], lines);
  assert.match(lines.join('\n'), new RegExp(`sổ deploy: đang chạy ${ws.c[1].slice(0, 12)} \\(deploy, .*bản liền trước ${ws.c[0].slice(0, 12)}`));
  const out = [];
  await cli(ws, w, ['status', '--json'], out);
  const row = JSON.parse(out[0]).services[0];
  assert.equal(row.deployed.commit, ws.c[1]);
  assert.equal(row.previous, ws.c[0]);
  const ledger = { schema: 1, services: {} };
  for (let i = 0; i < 60; i++) ledgerOf.record(ledger, 'shop', { action: 'deploy', commit: String(i).padStart(40, '0'), from: null, result: 'failed', at: 't', by: '' });
  assert.equal(ledger.services.shop.history.length, 50);
  assert.equal(ledger.services.shop.current, null, 'lần hỏng không đổi bản đang chạy');
});

test('khóa theo dịch vụ: đang có lần đưa lên chạy dở thì lần thứ hai bị từ chối, không đổi gì; khóa của tiến trình đã chết thì bỏ qua', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  ws.pin(ws.c[1]); w.publish(ws.c[1]);
  const locks = locksOf(ws);
  assert.equal(await locks.holder('deploy.shop'), null, 'lần deploy trước đã nhả khóa');
  assert.equal((await locks.acquire('deploy.shop', { action: 'deploy', by: 'người khác', at: 't0' })).ok, true);
  const out = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply', '--json'], out), 1);
  const j = JSON.parse(out[0]);
  assert.equal(j.locked, true);
  assert.match(j.reason, /chạy dở/);
  assert.equal(w.running.get('bsn-shop'), ws.c[0], 'bản đang chạy giữ nguyên');
  // chỉ in kế hoạch thì không cần khóa
  assert.equal(await cli(ws, w, ['deploy', 'shop']), 0);
  // status cho biết dịch vụ đang bận
  const st = [];
  await cli(ws, w, ['status', '--json'], st);
  assert.equal(JSON.parse(st[0]).services[0].busy.by, 'người khác');
  await locks.release('deploy.shop');
  // Khóa do một tiến trình đã chết để lại: coi như không có.
  fs.writeFileSync(makeLayout(ws.root).lock('deploy.shop'), JSON.stringify({ pid: 2147483646, action: 'deploy' }));
  assert.equal(await locks.holder('deploy.shop'), null);
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply']), 0);
  assert.equal(w.running.get('bsn-shop'), ws.c[1]);
  assert.equal(await locks.holder('deploy.shop'), null, 'xong thì nhả khóa');
});

test('sổ deploy: append đọc lại sổ trước khi ghi nên không mất dòng của bên khác; sổ của bản mới hơn thì từ chối thay vì ghi đè', async (t) => {
  const ws = makeWorkspace(t);
  const e = (commit) => ({ action: 'deploy', commit, from: null, result: 'ok', at: 't', by: '' });
  const { ledger, locks } = localPorts({ root: ws.root });
  await ledger.append('shop', e(ws.c[0]));
  // một tiến trình khác ghi thêm dịch vụ khac vào sổ giữa hai lần ghi của ta
  const other = await ledger.read(); ledgerOf.record(other, 'khac', e(ws.c[2])); fs.writeFileSync(makeLayout(ws.root).ledger, JSON.stringify(other));
  await ledger.append('shop', e(ws.c[1]));
  const led = await ledger.read();
  assert.equal(led.services.khac.current.commit, ws.c[2], 'dòng của bên khác còn nguyên');
  assert.deepEqual([led.services.shop.current.commit, led.services.shop.previous.commit], [ws.c[1], ws.c[0]]);
  assert.equal(await locks.holder('ledger'), null);
  fs.writeFileSync(makeLayout(ws.root).ledger, JSON.stringify({ schema: ledgerOf.SCHEMA + 1, services: {} }));
  await assert.rejects(ledger.read(), /schema/);
  await assert.rejects(ledger.append('shop', e(ws.c[2])), /schema/);
  assert.equal(JSON.parse(fs.readFileSync(makeLayout(ws.root).ledger, 'utf8')).schema, ledgerOf.SCHEMA + 1, 'sổ không bị ghi đè');
});

// --- Đợt A của bảng điều khiển theo design: deploy đúng commit được chọn; lệnh báo tiến trình từng bước ---

test('deploy <dịch-vụ> <commit>: đưa đúng commit được chọn lên (không phải commit đã khai), không sửa tờ khai báo; chưa có bản thì từ chối', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  ws.pin(ws.c[1]); w.publish(ws.c[1]); w.publish(ws.c[2]);
  const out = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', ws.c[2], '--apply', '--json'], out), 0);
  const j = JSON.parse(out[0]);
  assert.deepEqual({ ok: j.ok, from: j.from, to: j.to }, { ok: true, from: ws.c[0], to: ws.c[2] });
  assert.equal(w.running.get('bsn-shop'), ws.c[2], 'chạy commit được chọn');
  assert.equal(ws.pinned(), ws.c[1], 'tờ khai báo (commit được phép đóng gói) không bị sửa');
  assert.match(j.log.join('\n'), /bản được chọn/);
  // Tiền tố cũng nhận được khi máy có repo của dịch vụ.
  const back = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', ws.c[1].slice(0, 10), '--apply', '--json'], back), 0);
  assert.equal(w.running.get('bsn-shop'), ws.c[1]);
  // Commit được chọn mà chưa có bản: từ chối như mọi commit khác, nêu cách có bản.
  const ws2 = makeWorkspace(t); const w2 = world();
  await running(ws2, w2, ws2.c[0]);
  const lines = [];
  assert.equal(await cli(ws2, w2, ['deploy', 'shop', ws2.c[2], '--apply'], lines), 1);
  assert.match(lines.join('\n'), /CHỜ BUILD[\s\S]*ghim commit đó/);
  assert.equal(w2.running.get('bsn-shop'), ws2.c[0]);
  // Mã không hợp lệ.
  const bad = [];
  assert.equal(await cli(ws2, w2, ['deploy', 'shop', 'xyz', '--apply'], bad), 1);
  assert.match(bad.join('\n'), /không hợp lệ/);
});

test('--json --events: mỗi bước và mỗi dòng diễn giải được in ngay thành một dòng JSON; dòng cuối vẫn là kết quả', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  ws.pin(ws.c[1]); w.publish(ws.c[1]);
  const out = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply', '--json', '--events'], out), 0);
  const objs = out.map((l) => JSON.parse(l));
  const steps = objs.filter((o) => o.event === 'step').map((o) => `${o.phase}:${o.step}:${o.status}`);
  assert.deepEqual(steps, ['forward:fetch:running', 'forward:fetch:succeeded', 'forward:start:running', 'forward:start:succeeded', 'forward:health:running', 'forward:health:succeeded', 'forward:record:running', 'forward:record:succeeded']);
  assert.ok(objs.some((o) => o.event === 'log' && /ĐÃ DEPLOY/.test(o.text)));
  const last = objs[objs.length - 1];
  assert.equal(last.ok, true);
  assert.equal(last.event, undefined, 'dòng cuối là kết quả, không phải sự kiện');
});

test('--events khi bản mới không khỏe: bước kiểm sức khỏe báo hỏng, rồi các bước bật lại bản cũ ở pha revert', async (t) => {
  const ws = makeWorkspace(t); const w = world();
  await running(ws, w, ws.c[0]);
  ws.pin(ws.c[1]); w.publish(ws.c[1]); w.bad.add(ws.c[1]);
  const out = [];
  assert.equal(await cli(ws, w, ['deploy', 'shop', '--apply', '--json', '--events'], out), 1);
  const steps = out.map((l) => JSON.parse(l)).filter((o) => o.event === 'step').map((o) => `${o.phase}:${o.step}:${o.status}`);
  assert.ok(steps.includes('forward:health:failed'), steps.join(' '));
  assert.ok(!steps.includes('forward:record:running'), 'bản hỏng không tới bước ghi sổ của lần đưa lên');
  assert.ok(steps.includes('revert:health:succeeded'), 'bản cũ được bật lại và khỏe');
  assert.equal(w.running.get('bsn-shop'), ws.c[0]);
});
