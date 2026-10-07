'use strict';
// infra/bsn.js (S-017, S-023): tờ khai báo của từng dịch vụ hợp lệ, build chỉ từ commit được ghim, lệnh mặc định chỉ in kế hoạch.
// Test không cần Docker: lệnh docker được thay bằng bản giả ghi lại lời gọi; git và tar chạy thật trên repo tạm.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run: defaultRun } = require('../src/infrastructure/process-runner');
const { makeLayout } = require('../src/infrastructure/layout');
const { localPorts, buildLocalApp } = require('../src/composition');
const { validate } = require('../src/domain/declaration');
const naming = require('../src/domain/naming');
const stackPlan = require('../src/domain/stack-plan');
const { main } = require('../bsn');

const REAL_ROOT = path.resolve(__dirname, '..', '..');

function sh(cwd, ...args) {
  const r = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

// Một workspace giả: infra/services/shop.json, infra/platform.json và một dịch vụ là repo git có một commit.
function makeWorkspace(t, manifestPatch = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-infra-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  const repo = path.join(root, 'system_service', 'shop');
  fs.mkdirSync(path.join(repo, 'conf'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'app.txt'), 'da-commit\n');
  fs.writeFileSync(path.join(repo, 'conf', 'run.json'), '{"ok":true}\n');
  fs.writeFileSync(path.join(repo, 'Dockerfile'), 'FROM scratch\n');
  sh(repo, 'git', 'init', '-q');
  sh(repo, 'git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
  sh(repo, 'git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'ban dau');
  const head = sh(repo, 'git', 'rev-parse', 'HEAD');
  const shop = {
    repo: 'system_service/shop', commit: null, port: { local: 8000, container: 8080 }, health: '/health',
    env: { MODE: 'local' }, secretEnv: ['SHOP_TOKEN'],
    database: { name: 'shop', urlEnv: 'SHOP_DB', urlFormat: 'postgres://{user}:{password}@{host}:{port}/{db}' },
    broker: { bootstrapEnv: 'SHOP_KAFKA' }, topics: ['shop.events'], aliases: ['shop-api'],
    files: [{ from: 'conf/run.json', to: '/config/run.json' }],
    sidecars: { 'shop-sim': { target: 'sim', port: { local: 8100, container: 9000 }, env: { PLAIN: 'x', KEY: { secret: 'SHOP_TOKEN' } } } },
    ...manifestPatch,
  };
  const file = path.join(root, 'infra', 'services', 'shop.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(shop, null, 2));
  fs.writeFileSync(path.join(root, 'infra', 'platform.json'), JSON.stringify(PLATFORM));
  return { root, repo, head, file, manifest: () => ({ services: { shop: JSON.parse(fs.readFileSync(file, 'utf8')) } }) };
}

const PLATFORM = { schema: 1, github: { org: 'acme', platformRepo: 'platform', serviceRepoPrefix: 'svc-' }, registry: { namespace: 'acme', repoPrefix: 'svc-', branch: 'main', keep: 20 } };

// Bản giả của `run`: git và tar chạy thật; docker chỉ ghi lại lời gọi (và cho xem thư mục build lúc được gọi).
function fakeRun(onDocker) {
  const calls = [];
  const run = (cmd, args, opts) => {
    if (cmd === 'docker') { calls.push(args); return (onDocker && onDocker(args)) || { status: 0, stdout: '', stderr: '' }; }
    return defaultRun(cmd, args, opts);
  };
  return { run, calls };
}

const logTo = (lines) => (s) => lines.push(s);

test('tờ khai báo thật của BSN_ hợp lệ: cổng local từ 8000, không trùng, không có nhãn latest', async () => {
  // Máy của GitHub chỉ có repo nền: khi đó chỉ kiểm nội dung tờ khai báo, không đòi repo của dịch vụ.
  const checked = await buildLocalApp({ root: REAL_ROOT }).check({ requireRepos: 'if-present' });
  const m = checked.manifest;
  assert.deepEqual(checked.errors, []);
  assert.ok(m.platform, 'có infra/platform.json');
  const ports = Object.values(m.services).map((s) => s.port.local);
  assert.ok(ports.every((p) => p >= 8000));
  assert.equal(new Set(ports).size, ports.length);
});

test('tầng dùng chung không dùng nhãn latest và ảnh nào cũng ghim phiên bản', () => {
  const y = fs.readFileSync(makeLayout(REAL_ROOT).tierCompose, 'utf8');
  const images = [...y.matchAll(/^\s*image:\s*(\S+)/gm)].map((x) => x[1]);
  assert.ok(images.length >= 2);
  for (const i of images) { assert.match(i, /:[^:]+$/, `${i} phải có nhãn phiên bản`); assert.doesNotMatch(i, /:latest$/); }
});

test('validate: trùng cổng, cổng dưới 8000, commit không đủ 40 ký tự, nhãn latest, repo thoát ra ngoài đều bị báo', () => {
  const base = () => ({ services: {
    a: { repo: 'x/a', commit: null, port: { local: 8000, container: 80 }, health: '/h' },
    b: { repo: 'x/b', commit: null, port: { local: 8001, container: 80 }, health: '/h' },
  } });
  assert.deepEqual(validate(base()), []);
  let m = base(); m.services.b.port.local = 8000;
  assert.match(validate(m).join('\n'), /cổng local 8000 trùng/);
  m = base(); m.services.a.port.local = 7999;
  assert.match(validate(m).join('\n'), /từ 8000/);
  m = base(); m.services.a.commit = 'abc123';
  assert.match(validate(m).join('\n'), /40 ký tự/);
  m = base(); m.services.a.env = { IMG: 'redis:latest' };
  assert.match(validate(m).join('\n'), /latest/);
  m = base(); m.services.a.repo = '../ngoai';
  assert.match(validate(m).join('\n'), /tương đối trong workspace/);
  m = base(); m.services.a.env = { TOKEN: { v: 1 } };
  assert.match(validate(m).join('\n'), /phải là chuỗi/);
  m = base(); m.services.a.sidecars = { sim: { port: { local: 8001, container: 1 } } };
  assert.match(validate(m).join('\n'), /cổng local 8001 trùng/);
});

test('trích commit: tệp sửa dở và tệp chưa theo dõi KHÔNG có trong thư mục build', async (t) => {
  const w = makeWorkspace(t);
  fs.writeFileSync(path.join(w.repo, 'app.txt'), 'DANG-SUA-DO\n');      // sửa mà chưa commit
  fs.writeFileSync(path.join(w.repo, 'moi.txt'), 'chua-theo-doi\n');     // tệp mới chưa add
  const { source } = localPorts({ root: w.root });
  const dest = await source.extract('system_service/shop', w.head, 'shop-test');
  t.after(() => source.discard(dest));
  assert.equal(fs.readFileSync(path.join(dest, 'app.txt'), 'utf8'), 'da-commit\n');
  assert.ok(!fs.existsSync(path.join(dest, 'moi.txt')));
  assert.ok(!fs.existsSync(path.join(dest, '.git')), 'không mang theo .git');
  // Thư mục làm việc của phiên đang sửa không bị đụng tới.
  assert.equal(fs.readFileSync(path.join(w.repo, 'app.txt'), 'utf8'), 'DANG-SUA-DO\n');
  assert.equal(sh(w.repo, 'git', 'status', '--porcelain').split('\n').length, 2);
  await assert.rejects(source.extract('system_service/shop', 'HEAD', 'shop-test'), /40 ký tự/);
});

test('pin: mặc định chỉ in kế hoạch; --apply mới ghi; commit không có thì từ chối', async (t) => {
  const w = makeWorkspace(t);
  const { run } = fakeRun();
  const lines = [];
  assert.equal(await main(['pin', 'shop'], { root: w.root, run, log: logTo(lines) }), 0);
  assert.equal(w.manifest().services.shop.commit, null, 'chưa --apply thì không ghi');
  assert.match(lines.join('\n'), /Chưa làm gì/);
  assert.equal(await main(['pin', 'shop', '--apply'], { root: w.root, run, log: logTo(lines) }), 0);
  assert.equal(w.manifest().services.shop.commit, w.head);
  await assert.rejects(main(['pin', 'shop', 'khong-co-commit-nay', '--apply'], { root: w.root, run, log: logTo(lines) }), /không có commit/);
  assert.equal(w.manifest().services.shop.commit, w.head, 'lỗi thì bản ghim cũ giữ nguyên');
});

test('pin báo rõ số tệp chưa commit không nằm trong bản ghim', async (t) => {
  const w = makeWorkspace(t);
  fs.writeFileSync(path.join(w.repo, 'app.txt'), 'sua\n');
  const lines = [];
  await main(['pin', 'shop'], { root: w.root, run: fakeRun().run, log: logTo(lines) });
  assert.match(lines.join('\n'), /1 tệp chưa commit .* KHÔNG nằm trong bản ghim/);
});

test('build: docker nhận thư mục tạm chứa đúng commit được ghim, nhãn ảnh là mã commit; không --apply thì không gọi docker', async (t) => {
  const w = makeWorkspace(t);
  await main(['pin', 'shop', '--apply'], { root: w.root, run: fakeRun().run, log: () => {} });
  fs.writeFileSync(path.join(w.repo, 'app.txt'), 'DANG-SUA-DO\n');
  const seen = [];
  const { run, calls } = fakeRun((args) => {
    if (args[0] === 'build') seen.push({ args, content: fs.readFileSync(path.join(args[args.length - 1], 'app.txt'), 'utf8') });
  });
  await main(['build', 'shop'], { root: w.root, run, log: () => {} });
  assert.equal(calls.length, 0, 'chế độ kế hoạch không gọi docker');
  await main(['build', 'shop', '--apply'], { root: w.root, run, log: () => {} });
  assert.equal(seen.length, 2, 'dịch vụ và sidecar');
  for (const s of seen) {
    assert.equal(s.content, 'da-commit\n', 'nội dung build là bản đã commit, không phải bản đang sửa dở');
    assert.ok(!path.resolve(s.args[s.args.length - 1]).startsWith(path.resolve(w.repo)), 'không build từ thư mục làm việc');
    assert.ok(s.args.includes(`bsn.commit=${w.head}`));
  }
  assert.ok(seen[0].args.includes(`bsn-shop:${w.head.slice(0, 12)}`));
  assert.ok(seen[1].args.includes(`bsn-shop-sim:${w.head.slice(0, 12)}`) && seen[1].args.includes('sim'));
  // Tệp cấu hình khai ở files được lấy từ commit được ghim, không từ thư mục làm việc.
  assert.equal(fs.readFileSync(path.join(makeLayout(w.root).run, 'files', 'shop', 'conf', 'run.json'), 'utf8'), '{"ok":true}\n');
  assert.ok(!fs.existsSync(path.join(os.tmpdir(), 'bsn-build', `shop-${w.head.slice(0, 12)}`)), 'thư mục tạm được dọn');
});

test('build và up từ chối dịch vụ chưa ghim commit', async (t) => {
  const w = makeWorkspace(t);
  const { run, calls } = fakeRun();
  const lines = [];
  await assert.rejects(main(['build', 'shop', '--apply'], { root: w.root, run, log: logTo(lines) }), /chưa ghim commit/);
  assert.equal(await main(['up', 'shop', '--apply'], { root: w.root, run, log: logTo(lines) }), 1);
  assert.match(lines.join('\n'), /chưa ghim commit/);
  assert.equal(calls.length, 0);
});

test('bí mật local: sinh một lần, giữ nguyên lần sau, không nằm trong tệp khai báo', async (t) => {
  const w = makeWorkspace(t);
  const { secrets: store } = localPorts({ root: w.root });
  const a = await store.ensure(['SHOP_TOKEN', stackPlan.PG.secret]);
  const b = await store.ensure(['SHOP_TOKEN', stackPlan.PG.secret, 'KHAC']);
  assert.equal(a.SHOP_TOKEN, b.SHOP_TOKEN);
  assert.match(a.SHOP_TOKEN, /^[0-9a-f]{48}$/);
  assert.ok(b.KHAC && b.KHAC !== b.SHOP_TOKEN);
  assert.ok(!fs.readFileSync(w.file, 'utf8').includes(a.SHOP_TOKEN));
});

test('compose của dịch vụ: ảnh theo commit, cổng local theo tệp khai báo, địa chỉ DB và broker do infra cấp, sidecar dùng chung bí mật', (t) => {
  const w = makeWorkspace(t);
  const m = w.manifest();
  const { hostPath } = localPorts({ root: w.root }).configFiles;
  assert.throws(() => stackPlan.composeFor(m, ['shop'], {}, hostPath), /chưa ghim commit/);
  m.services.shop.commit = w.head;
  const secrets = { SHOP_TOKEN: 'tok', [stackPlan.PG.secret]: 'pw' };
  const c = stackPlan.composeFor(m, ['shop'], secrets, hostPath);
  const s = c.services.shop;
  assert.equal(s.image, `bsn-shop:${w.head.slice(0, 12)}`);
  assert.deepEqual(s.ports, ['127.0.0.1:8000:8080']);
  assert.equal(s.environment.SHOP_DB, 'postgres://bsn:pw@postgres:5432/shop');
  assert.equal(s.environment.SHOP_KAFKA, 'redpanda:9092');
  assert.equal(s.environment.SHOP_TOKEN, 'tok');
  assert.equal(s.environment.MODE, 'local');
  assert.deepEqual(s.networks.default.aliases, ['shop-api']);
  assert.match(s.volumes[0], /files\/shop\/conf\/run\.json:\/config\/run\.json:ro$/);
  assert.equal(c.services['shop-sim'].environment.KEY, 'tok');
  assert.deepEqual(c.services['shop-sim'].ports, ['127.0.0.1:8100:9000']);
  assert.equal(c.networks.default.external, true);
  for (const svc of Object.values(c.services)) assert.ok(svc.ports.every((p) => p.startsWith('127.0.0.1:')), 'chỉ mở cổng trên máy local');
});

test('up không --apply chỉ in kế hoạch và không gọi docker; down cũng vậy', async (t) => {
  const w = makeWorkspace(t);
  await main(['pin', 'shop', '--apply'], { root: w.root, run: fakeRun().run, log: () => {} });
  const { run, calls } = fakeRun();
  const lines = [];
  assert.equal(await main(['up'], { root: w.root, run, log: logTo(lines) }), 0);
  assert.equal(await main(['down', '--volumes'], { root: w.root, run, log: logTo(lines) }), 0);
  assert.equal(calls.length, 0);
  const out = lines.join('\n');
  assert.match(out, /tạo cơ sở dữ liệu "shop"/);
  assert.match(out, /shop \(127\.0\.0\.1:8000\)/);
  assert.match(out, /XÓA dữ liệu local/);
  assert.ok(!fs.existsSync(makeLayout(w.root).secrets), 'kế hoạch không sinh bí mật');
});

test('status: nêu bản ghim, HEAD khác bản ghim và số tệp chưa commit', async (t) => {
  const w = makeWorkspace(t);
  await main(['pin', 'shop', '--apply'], { root: w.root, run: fakeRun().run, log: () => {} });
  fs.writeFileSync(path.join(w.repo, 'app.txt'), 'v2\n');
  sh(w.repo, 'git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-am', 'v2');
  fs.writeFileSync(path.join(w.repo, 'moi.txt'), 'x\n');
  const lines = [];
  await main(['status'], { root: w.root, run: fakeRun().run, log: logTo(lines) });
  const out = lines.join('\n');
  assert.match(out, new RegExp(`shop: ghim ${w.head.slice(0, 12)}, HEAD là [0-9a-f]{12}`));
  assert.match(out, /1 tệp chưa commit \(không vào ảnh\)/);
  assert.match(out, /cổng local 8000/);
});

test('check trả mã 1 và nêu lỗi khi tệp khai báo sai', async (t) => {
  const w = makeWorkspace(t, { port: { local: 80, container: 8080 } });
  const lines = [];
  assert.equal(await main(['check'], { root: w.root, run: fakeRun().run, log: logTo(lines) }), 1);
  assert.match(lines.join('\n'), /LỖI: .*từ 8000/);
});

test('mỗi dịch vụ một tờ khai báo: pin chỉ ghi tờ của đúng dịch vụ đó, tờ của dịch vụ khác không đổi một byte', async (t) => {
  const w = makeWorkspace(t);
  const other = path.join(w.root, 'infra', 'services', 'feed.json');
  const otherText = JSON.stringify({ repo: 'system_service/shop', commit: null, port: { local: 8001, container: 80 }, health: '/h' }) + '\n\n';
  fs.writeFileSync(other, otherText);
  assert.deepEqual(Object.keys((await localPorts({ root: w.root }).declarations.load()).services), ['feed', 'shop'], 'tên tệp là tên dịch vụ');
  assert.equal(await main(['pin', 'shop', '--apply'], { root: w.root, run: fakeRun().run, log: () => {} }), 0);
  assert.equal(w.manifest().services.shop.commit, w.head);
  assert.equal(fs.readFileSync(other, 'utf8'), otherText);
  assert.ok(!fs.existsSync(path.join(w.root, 'infra', 'services.json')), 'không sinh lại tệp chung cũ');
});

test('check trên máy không có repo của dịch vụ (máy của GitHub): vẫn kiểm nội dung, nói rõ đã bỏ phần kiểm repo; có --json', async (t) => {
  const w = makeWorkspace(t);
  fs.rmSync(path.join(w.root, 'system_service'), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  const lines = [];
  assert.equal(await main(['check'], { root: w.root, run: fakeRun().run, log: logTo(lines) }), 0);
  assert.match(lines.join('\n'), /bỏ qua phần kiểm repo/);
  const out = [];
  assert.equal(await main(['check', '--json'], { root: w.root, run: fakeRun().run, log: logTo(out) }), 0);
  assert.deepEqual(JSON.parse(out.join('')), { ok: true, errors: [], reposChecked: false, services: ['shop'] });
  // Lệnh cần mã của dịch vụ thì vẫn từ chối khi thiếu repo.
  const st = [];
  assert.equal(await main(['status'], { root: w.root, run: fakeRun().run, log: logTo(st) }), 1);
  assert.match(st.join('\n'), /không thấy repo git/);
});

test('platform.json sai bị check báo: thiếu tài khoản Docker Hub, nhánh khác main', async (t) => {
  const w = makeWorkspace(t);
  fs.writeFileSync(path.join(w.root, 'infra', 'platform.json'), JSON.stringify({ ...PLATFORM, registry: { repoPrefix: 'svc-', branch: 'staging', keep: 20 } }));
  const lines = [];
  assert.equal(await main(['check'], { root: w.root, run: fakeRun().run, log: logTo(lines) }), 1);
  assert.match(lines.join('\n'), /registry\.namespace/);
  assert.match(lines.join('\n'), /chỉ nhận "main"/);
});

test('tên bản trên Docker Hub: <tài-khoản>/<tiền-tố><dịch-vụ>:main-<12 ký tự commit>', () => {
  assert.equal(naming.remoteImage(PLATFORM, 'shop', 'a'.repeat(40)), 'acme/svc-shop:main-aaaaaaaaaaaa');
  assert.throws(() => naming.remoteImage(null, 'shop', 'a'.repeat(40)), /platform\.json/);
});

test('up --pull: kéo bản CI, kiểm commit ghi bên trong bản, gắn nhãn cục bộ; ảnh chính không build tại chỗ, sidecar vẫn build', async (t) => {
  const w = makeWorkspace(t);
  await main(['pin', 'shop', '--apply'], { root: w.root, run: fakeRun().run, log: () => {} });
  const tag = w.head.slice(0, 12);
  const have = new Set();
  const { run, calls } = fakeRun((a) => {
    if (a[0] === 'image' && a[1] === 'inspect' && a[2] === '--format') return { status: 0, stdout: w.head + '\n', stderr: '' };
    if (a[0] === 'image' && a[1] === 'inspect') return { status: have.has(a[2]) ? 0 : 1, stdout: '', stderr: '' };
    if (a[0] === 'tag') have.add(a[2]);
    if (a[0] === 'build') have.add(a[a.indexOf('-t') + 1]);
    if (a[0] === 'exec') return { status: 0, stdout: '1\nshop.events  3\n', stderr: '' };
  });
  const app = buildLocalApp({ root: w.root, run });
  const up = app.stack.startSteps(await app.ports.declarations.load(), ['shop'], { pull: true, say: () => {} });
  for (const s of up) await s.run();
  const flat = calls.map((c) => c.join(' '));
  assert.ok(flat.includes(`pull acme/svc-shop:main-${tag}`), 'kéo đúng tên bản');
  assert.ok(flat.includes(`tag acme/svc-shop:main-${tag} bsn-shop:${tag}`), 'gắn nhãn cục bộ');
  const builds = calls.filter((c) => c[0] === 'build').map((c) => c[c.indexOf('-t') + 1]);
  assert.deepEqual(builds, [`bsn-shop-sim:${tag}`], 'chỉ sidecar được build tại chỗ');
  assert.equal(fs.readFileSync(path.join(makeLayout(w.root).run, 'files', 'shop', 'conf', 'run.json'), 'utf8'), '{"ok":true}\n', 'tệp cấu hình vẫn lấy từ commit được ghim');
  assert.equal(await app.ports.configFiles.stale('shop', w.manifest().services.shop), false);
});

test('up --pull từ chối bản mà commit ghi bên trong khác commit được ghim, và nói rõ khi không kéo được', async (t) => {
  const w = makeWorkspace(t);
  await main(['pin', 'shop', '--apply'], { root: w.root, run: fakeRun().run, log: () => {} });
  const m = await localPorts({ root: w.root }).declarations.load();
  const fetchWith = (run) => buildLocalApp({ root: w.root, run }).images.fetch(m, 'shop');
  let r = fakeRun((a) => (a[0] === 'image' && a[2] === '--format' ? { status: 0, stdout: 'f'.repeat(40) + '\n', stderr: '' } : undefined));
  await assert.rejects(fetchWith(r.run), /khác commit được ghim/);
  assert.ok(!r.calls.some((c) => c[0] === 'tag'), 'bản sai không được gắn nhãn cục bộ');
  r = fakeRun((a) => (a[0] === 'pull' ? { status: 1, stdout: '', stderr: 'manifest unknown' } : undefined));
  await assert.rejects(fetchWith(r.run), /không kéo được acme\/svc-shop:main-.*manifest unknown/s);
});

test('đổi bản ghim thì tệp cấu hình trích từ commit cũ bị coi là cũ', async (t) => {
  const w = makeWorkspace(t);
  await main(['pin', 'shop', '--apply'], { root: w.root, run: fakeRun().run, log: () => {} });
  const svc = w.manifest().services.shop;
  const stale = (decl) => localPorts({ root: w.root }).configFiles.stale('shop', decl);
  assert.equal(await stale(svc), true, 'chưa trích lần nào');
  await main(['build', 'shop', '--apply'], { root: w.root, run: fakeRun().run, log: () => {} });
  assert.equal(await stale(svc), false);
  assert.equal(await stale({ ...svc, commit: 'b'.repeat(40) }), true);
  assert.equal(await stale({ ...svc, files: [] }), false, 'không khai tệp thì không có gì để cũ');
});

test('images: có bản thì CÓ; commit đã khai mà chưa có bản là CHỜ BUILD (mã thoát 0), --strict mới thoát 1; có --json', async (t) => {
  const w = makeWorkspace(t);
  await main(['pin', 'shop', '--apply'], { root: w.root, run: fakeRun().run, log: () => {} });
  const image = `acme/svc-shop:main-${w.head.slice(0, 12)}`;
  let r = fakeRun();
  const ok = [];
  assert.equal(await main(['images', '--json'], { root: w.root, run: r.run, log: logTo(ok) }), 0);
  assert.deepEqual(r.calls, [['manifest', 'inspect', image]], 'chỉ hỏi, không kéo về');
  assert.equal(JSON.parse(ok.join('')).images[0].present, true);
  r = fakeRun(() => ({ status: 1, stdout: '', stderr: 'no such manifest' }));
  const lines = [];
  assert.equal(await main(['images'], { root: w.root, run: r.run, log: logTo(lines) }), 0, 'khai báo đi trước bản đóng gói: chờ build không phải lỗi');
  assert.match(lines.join('\n'), new RegExp(`shop: CHỜ BUILD ${image.replace('/', '\\/')}`));
  assert.equal(await main(['images', '--strict'], { root: w.root, run: r.run, log: () => {} }), 1, 'trước khi deploy thì thiếu bản là dừng');
  const wait = [];
  await main(['images', '--json'], { root: w.root, run: r.run, log: logTo(wait) });
  assert.deepEqual(JSON.parse(wait.join('')).waiting, ['shop']);
  assert.equal(JSON.parse(wait.join('')).ok, false);
});

test('status --json: in đúng một đối tượng JSON, có bản ghim, HEAD và số tệp chưa commit', async (t) => {
  const w = makeWorkspace(t);
  await main(['pin', 'shop', '--apply'], { root: w.root, run: fakeRun().run, log: () => {} });
  fs.writeFileSync(path.join(w.repo, 'moi.txt'), 'x\n');
  const out = [];
  assert.equal(await main(['status', '--json'], { root: w.root, run: fakeRun().run, log: logTo(out) }), 0);
  assert.equal(out.length, 1, 'không kèm dòng chữ nào khác');
  const j = JSON.parse(out[0]);
  assert.equal(j.services[0].service, 'shop');
  assert.equal(j.services[0].pinned, w.head);
  assert.equal(j.services[0].pinnedIsHead, true);
  assert.equal(j.services[0].uncommittedFiles, 1);
  assert.equal(j.services[0].portLocal, 8000);
});
