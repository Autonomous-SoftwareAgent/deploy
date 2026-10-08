'use strict';
// Các tệp phụ của CI (S-023, S-029): quyết định có đóng gói không, quét bí mật trong ảnh, dọn bản cũ trên Docker Hub.
// Không cần mạng, không cần Docker. Token trong test được GHÉP lúc chạy để tệp này không chứa chuỗi nào giống token thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { decide, readDeclaration } = require('../decide');
const scan = require('../scan-image');
const prune = require('../prune-images');

const SHA = 'c14ccf45722e44adb0a75e4bb5fec6b2babcf10c';
const OTHER = 'f'.repeat(40);
// Mặc định: dịch vụ ĐÃ khai đúng commit đang chạy.
const base = (over = {}) => ({ event: 'push', ref: 'refs/heads/main', sha: SHA, repo: 'acme/svc-shop', prefix: 'svc-', config: { service: 'shop' }, declaration: { commit: SHA }, ...over });

test('decide: đẩy lên main đúng commit đã khai trong tờ khai báo thì đóng gói, nhãn là main-<12 ký tự commit>', () => {
  const d = decide(base({ config: { service: 'shop', dockerTarget: 'app' } }));
  assert.equal(d.build, true);
  assert.match(d.reason, /đúng là bản đã khai/);
  assert.equal(d.tag, 'main-c14ccf45722e');
  assert.equal(d.repoName, 'svc-shop');
  assert.equal(d.target, 'app');
  assert.equal(decide(base({ event: 'workflow_dispatch' })).build, true, 'chạy tay trên main (khai báo sau khi đẩy) cũng đóng gói');
});

test('decide: khai báo trước, build sau: commit KHÔNG phải bản đã khai thì chỉ chạy test, không đóng gói (không phải lỗi)', () => {
  for (const [over, re] of [
    [{ declaration: { commit: OTHER } }, /không phải bản đã khai \(tờ khai báo đang ghi ffffffffffff\)/],
    [{ declaration: { commit: null } }, /chưa ghim commit nào/],
    [{ declaration: undefined }, /chưa có tờ khai báo services\/shop\.json/],
  ]) {
    const d = decide(base(over));
    assert.equal(d.build, false);
    assert.ok(!d.error, 'không khai thì không build, nhưng test vẫn là kết quả của lần chạy');
    assert.match(d.reason, re);
  }
  assert.match(decide(base({ declaration: { commit: OTHER } })).reason, /ghim nó vào tờ khai báo.*chạy lại workflow/);
});

test('decide: khai commit nào thì đóng gói ĐÚNG commit đó, kể cả khi nó nằm dưới đầu nhánh; test cả đầu nhánh lẫn commit đó', () => {
  // Chế độ pin (workflow service-pin): đầu nhánh là SHA, tờ khai báo ghi OTHER, OTHER đã có trên nhánh và chưa có bản.
  const d = decide(base({ mode: 'pin', declaration: { commit: OTHER }, onBranch: true, imageExists: false }));
  assert.equal(d.build, true);
  assert.equal(d.commit, OTHER, 'đóng gói commit ĐÃ KHAI, không phải đầu nhánh');
  assert.equal(d.tag, 'main-ffffffffffff');
  assert.deepEqual(d.refs, [SHA, OTHER], 'bản chỉ sinh ra từ commit đã qua test: test cả hai');
  assert.match(d.reason, /nằm dưới đầu nhánh c14ccf45722e/);
  // Commit đã khai trùng đầu nhánh: chỉ một commit phải test.
  assert.deepEqual(decide(base({ mode: 'pin', onBranch: true })).refs, [SHA]);
  // Workflow service-image được chỉ đúng commit đó thì cũng đóng gói nó.
  const img = decide(base({ buildCommit: OTHER, declaration: { commit: OTHER }, onBranch: true }));
  assert.equal(img.build, true);
  assert.equal(img.commit, OTHER);
});

test('decide: commit đã khai chưa có trên nhánh, đã có bản, hoặc không phải commit được chỉ định thì KHÔNG đóng gói (không phải lỗi)', () => {
  const notPushed = decide(base({ mode: 'pin', declaration: { commit: OTHER }, onBranch: false }));
  assert.equal(notPushed.build, false);
  assert.ok(!notPushed.error);
  assert.match(notPushed.reason, /chưa có trên nhánh main vừa đẩy/);
  assert.deepEqual(notPushed.refs, [SHA], 'không đóng gói thì chỉ test commit đang chạy');
  const built = decide(base({ mode: 'pin', onBranch: true, imageExists: true }));
  assert.equal(built.build, false);
  assert.match(built.reason, /đã có bản đóng gói/);
  // Chỉ định một commit KHÁC commit đã khai: từ chối, dù commit đó có trên nhánh.
  const wrong = decide(base({ buildCommit: OTHER, declaration: { commit: SHA }, onBranch: true }));
  assert.equal(wrong.build, false);
  assert.match(wrong.reason, /không phải bản đã khai/);
  // Chế độ pin mà chưa ghim gì: xét commit đang chạy, không đóng gói.
  assert.equal(decide(base({ mode: 'pin', declaration: { commit: null } })).build, false);
  // Nhánh khác main: commit đã khai cũng không được đóng gói.
  assert.equal(decide(base({ mode: 'pin', ref: 'refs/heads/thu', declaration: { commit: OTHER }, onBranch: true })).build, false);
});

test('decide: nhánh khác main và pull request KHÔNG đóng gói dù commit trùng bản đã khai', () => {
  for (const [over, re] of [
    [{ ref: 'refs/heads/feature/x' }, /chỉ nhánh main/],
    [{ event: 'pull_request' }, /chỉ chạy test/],
    [{ config: { service: 'shop', buildBranches: ['staging'] } }, /không khai main/],
  ]) {
    const d = decide(base(over));
    assert.equal(d.build, false);
    assert.ok(!d.error);
    assert.match(d.reason, re);
  }
});

test('decide: khai thêm nhánh ngoài main thì bị bỏ qua kèm ghi chú, main vẫn đóng gói', () => {
  const d = decide(base({ config: { service: 'shop', buildBranches: ['main', 'staging'] } }));
  assert.equal(d.build, true);
  assert.match(d.note, /staging.*chỉ nhánh main/);
});

test('decide: thiếu bsn.ci.json, tên dịch vụ sai, hoặc repo đẩy dưới tên dịch vụ khác đều là LỖI', () => {
  assert.match(decide(base({ config: null })).reason, /thiếu bsn\.ci\.json/);
  assert.match(decide(base({ config: { service: 'Shop!' } })).reason, /không hợp lệ/);
  const d = decide(base({ repo: 'acme/svc-feed' }));
  assert.equal(d.error, true);
  assert.match(d.reason, /tên repo phải là "svc-shop"/);
});

test('đọc tờ khai báo từ bản checkout của repo deploy: có commit, chưa ghim, không có tệp, tệp hỏng', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-decl-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'services'));
  fs.writeFileSync(path.join(dir, 'services', 'shop.json'), JSON.stringify({ repo: 'x', commit: SHA }));
  fs.writeFileSync(path.join(dir, 'services', 'feed.json'), JSON.stringify({ repo: 'x', commit: null }));
  fs.writeFileSync(path.join(dir, 'services', 'hong.json'), '{ khong phai json');
  assert.deepEqual(readDeclaration(dir, 'shop'), { commit: SHA });
  assert.deepEqual(readDeclaration(dir, 'feed'), { commit: null });
  assert.equal(readDeclaration(dir, 'khong-co'), undefined);
  assert.throws(() => readDeclaration(dir, 'hong'));
});

function tree(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-scan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [p, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), text); }
  return root;
}
const fakeHubToken = () => 'dckr_' + 'pat_' + 'x'.repeat(27);
const fakePem = () => '-----BEGIN ' + 'PRIVATE KEY-----\nabc\n';

test('quét ảnh: bắt token, khóa PEM, tệp .env, tệp khóa và thư mục .git trong phần của dịch vụ; không in giá trị', (t) => {
  const root = tree(t, {
    'app/src/config.js': `const a = 1;\nconst t = "${fakeHubToken()}";\n`,
    'app/certs/server.key': fakePem(),
    'app/.env': 'A=1\n',
    'app/.env.example': 'A=\n',
    'app/.git/HEAD': 'ref: refs/heads/main\n',
    'app/src/ok.js': 'module.exports = 1;\n',
  });
  const found = scan.scanDir(root);
  const kinds = found.map((f) => `${f.kind}@${f.file}`);
  assert.ok(kinds.includes('token Docker Hub@app/src/config.js'));
  assert.equal(found.find((f) => f.kind === 'token Docker Hub').line, 2);
  assert.ok(kinds.includes('tệp khóa@app/certs/server.key'));
  assert.ok(kinds.includes('khóa riêng dạng PEM@app/certs/server.key'));
  assert.ok(kinds.includes('tệp .env@app/.env'));
  assert.ok(!kinds.some((k) => k.endsWith('.env.example')), '.env.example là mẫu, không báo');
  assert.ok(kinds.some((k) => k.startsWith('thư mục .git')));
  assert.ok(!JSON.stringify(found).includes(fakeHubToken()), 'kết quả không chứa giá trị token');
});

test('quét ảnh: bỏ qua thư viện và thư mục hệ thống của ảnh nền (chúng chứa khóa mẫu, chứng chỉ công khai)', (t) => {
  const root = tree(t, {
    'app/node_modules/lib/test/key.pem': fakePem(),
    'usr/lib/python3/site-packages/certifi/cacert.pem': 'cert\n',
    'etc/ssl/certs/ca.pem': 'cert\n',
    'app/src/ok.js': 'ok\n',
  });
  assert.deepEqual(scan.scanDir(root), []);
});

test('quét docker history: ENV/ARG tên như bí mật mà mang giá trị thì báo; tên thường hoặc giá trị rỗng thì không', () => {
  const found = scan.scanHistory(['ENV NODE_ENV=production', 'ARG NPM_TOKEN=abc123', 'ENV HUB_API_TOKEN=', 'ENV PYTHON_SHA256=f4b1', `RUN echo ${fakeHubToken()}`].join('\n'));
  assert.equal(found.length, 2);
  assert.match(found.map((f) => f.kind).join('|'), /biến NPM_TOKEN/);
  assert.match(found.map((f) => f.kind).join('|'), /token Docker Hub/);
});

const tags = (n) => Array.from({ length: n }, (_, i) => ({ name: `main-${String(i).padStart(12, '0')}`, last_updated: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));

test('dọn bản: giữ N bản mới nhất cùng bản đang ghim và bản ghim liền trước; nhãn không phải của nền thì không đụng', () => {
  const all = [...tags(10), { name: 'thu-nghiem', last_updated: '2020-01-01' }, { name: 'main-abc', last_updated: '2020-01-01' }];
  const p = prune.plan(all, 3, new Set(['main-000000000000', 'main-000000000001']));
  assert.deepEqual(p.keep.sort(), ['main-000000000000', 'main-000000000001', 'main-000000000007', 'main-000000000008', 'main-000000000009']);
  assert.equal(p.remove.length, 5);
  assert.ok(!p.remove.includes('main-000000000000'), 'bản đang ghim không bị xóa dù cũ nhất');
  assert.deepEqual(p.ignored.sort(), ['main-abc', 'thu-nghiem']);
});

function hubFake(repoTags) {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push(`${opts.method} ${url.replace('https://hub.docker.com/v2', '')}`);
    const res = (status, json) => ({ status, text: async () => (json ? JSON.stringify(json) : '') });
    if (url.endsWith('/users/login')) return res(200, { token: 'jwt' });
    const m = /repositories\/([^/]+\/[^/]+)\/tags\/(?:\?|([^/]+)\/$)/.exec(url);
    if (opts.method === 'DELETE') return res(204);
    return repoTags[m[1]] ? res(200, { results: repoTags[m[1]], next: null }) : res(404, { message: 'not found' });
  };
  return { fetchFn, calls };
}

function infraRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-prune-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'infra', 'services'), { recursive: true });
  fs.writeFileSync(path.join(root, 'infra', 'platform.json'), JSON.stringify({ schema: 1, github: { org: 'acme', platformRepo: 'platform' }, registry: { namespace: 'acme', repoPrefix: 'svc-', branch: 'main', keep: 2 } }));
  for (const n of ['shop', 'feed']) fs.writeFileSync(path.join(root, 'infra', 'services', `${n}.json`), JSON.stringify({ repo: `system_service/${n}`, commit: '0'.repeat(40), port: { local: 8000, container: 80 }, health: '/h' }));
  return root;
}

test('dọn bản: mặc định chỉ in kế hoạch, --apply mới gọi xóa; kho chưa có thì bỏ qua; thiếu token thì không làm gì', async (t) => {
  const root = infraRoot(t);
  const env = { DOCKERHUB_USERNAME: 'acme', DOCKERHUB_TOKEN: 'bi-mat-gia' };
  const pinned = () => new Set(['main-000000000000']);
  let h = hubFake({ 'acme/svc-shop': tags(5) });
  const lines = [];
  assert.equal(await prune.main([], { root, env, fetch: h.fetchFn, log: (s) => lines.push(s), pinnedTags: pinned }), 0);
  assert.ok(!h.calls.some((c) => c.startsWith('DELETE')), 'kế hoạch không xóa');
  assert.match(lines.join('\n'), /acme\/svc-feed: kho chưa có/);
  assert.match(lines.join('\n'), /acme\/svc-shop: 3 bản giữ .* 2 bản sẽ xóa/);
  assert.ok(!lines.join('\n').includes('bi-mat-gia'), 'không in token');
  h = hubFake({ 'acme/svc-shop': tags(5) });
  assert.equal(await prune.main(['--apply'], { root, env, fetch: h.fetchFn, log: () => {}, pinnedTags: pinned }), 0);
  assert.deepEqual(h.calls.filter((c) => c.startsWith('DELETE')).sort(), ['DELETE /repositories/acme/svc-shop/tags/main-000000000001/', 'DELETE /repositories/acme/svc-shop/tags/main-000000000002/']);
  h = hubFake({});
  assert.equal(await prune.main(['--apply'], { root, env: {}, fetch: h.fetchFn, log: () => {}, pinnedTags: pinned }), 0);
  assert.equal(h.calls.length, 0);
});

// --- Chạy thử bản đóng gói trước khi đẩy (ci/smoke.js) ---
const smoke = require('../smoke');

test('chạy thử: lệnh docker sinh từ tờ khai báo, cùng biến môi trường như lúc chạy trong hệ; không bật đồ giả lập', () => {
  const svc = { port: { local: 8000, container: 8080 }, health: '/health', env: { MODE: 'x' }, secretEnv: ['API_TOKEN'],
    database: { name: 'shop', urlEnv: 'DB_URL', urlFormat: 'postgres://{user}:{password}@{host}:{port}/{db}' },
    broker: { bootstrapEnv: 'KAFKA' }, topics: ['a.b'], files: [{ from: 'conf/app.json', to: '/config/app.json' }], sidecars: { 'fake-gw': {} } };
  const p = smoke.plan(svc, { id: 'ab12', image: 'bsn-local:abc', source: '/src/shop', secrets: { BSN_PG_PASSWORD: 'pw', API_TOKEN: 'tok' } });
  assert.deepEqual(p.containers.map((c) => c.role), ['postgres', 'broker', 'service']);
  assert.equal(p.env.DB_URL, 'postgres://bsn:pw@postgres:5432/shop');
  assert.equal(p.env.KAFKA, 'redpanda:9092');
  assert.equal(p.env.API_TOKEN, 'tok');
  const run = p.containers[2].args;
  assert.equal(run[run.length - 1], 'bsn-local:abc', 'bản được chạy thử là đúng bản vừa đóng gói');
  assert.ok(run.includes('127.0.0.1::8080'), 'cổng chỉ mở trên máy chạy thử, do Docker chọn');
  assert.ok(run.some((a) => /conf\/app\.json:\/config\/app\.json:ro$/.test(a)), 'tệp cấu hình lấy từ mã của dịch vụ, gắn chỉ đọc');
  assert.ok(!JSON.stringify(p).includes('fake-gw'), 'đồ giả lập không được bật');
  assert.deepEqual(p.topics, ['a.b']);
  assert.deepEqual(p.health, { containerPort: 8080, path: '/health' });
  // Dịch vụ không khai cơ sở dữ liệu và broker thì chỉ có chính nó.
  const alone = smoke.plan({ port: { container: 80 }, health: '/' }, { id: 'x', image: 'i', source: '.', secrets: { BSN_PG_PASSWORD: 'pw' } });
  assert.deepEqual(alone.containers.map((c) => c.role), ['service']);
  assert.deepEqual(alone.topics, []);
});

test('chạy thử: PostgreSQL và broker cùng phiên bản với tầng dùng chung; tham số sai thì từ chối', () => {
  const compose = fs.readFileSync(path.join(__dirname, '..', '..', 'local', 'docker-compose.yml'), 'utf8');
  for (const image of Object.values(smoke.IMAGES)) assert.ok(compose.includes(`image: ${image}`), `local/docker-compose.yml phải dùng ${image}`);
  assert.deepEqual(smoke.parseArgs(['--service', 'shop', '--image', 'i:1', '--source', '.']), { seconds: 120, service: 'shop', image: 'i:1', source: '.' });
  assert.throws(() => smoke.parseArgs(['--service', 'Shop; rm', '--image', 'i', '--source', '.']), /cần --service/);
  assert.throws(() => smoke.parseArgs(['--bogus', '1']), /tham số không hợp lệ/);
});

test('workflow dùng chung: đóng gói commit được chỉ định, thiếu secret thì đỏ, chạy thử trước khi đẩy', () => {
  const wf = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'service-image.yml'), 'utf8');
  assert.ok(!wf.includes('$GITHUB_SHA'), 'không được đóng gói theo commit đang chạy: phải theo commit do decide.js trả về');
  assert.match(wf, /ref: \$\{\{ inputs\.commit \}\}/);
  assert.match(wf, /Thiếu DOCKERHUB_USERNAME hoặc DOCKERHUB_TOKEN[\s\S]{0,200}exit 1/);
  assert.ok(wf.indexOf('ci/smoke.js') > wf.indexOf('ci/scan-image.js') && wf.indexOf('ci/smoke.js') < wf.indexOf('docker push'), 'chạy thử sau khi quét, trước khi đẩy');
  const pin = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'service-pin.yml'), 'utf8');
  assert.match(pin, /BSN_MODE: pin/);
  assert.match(pin, /fetch-depth: 0/);
});
