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
