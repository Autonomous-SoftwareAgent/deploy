'use strict';
// BỘ TEST HỢP ĐỒNG của các cổng lưu trữ: cùng một bộ kiểm chạy cho bộ nối trên đĩa lẫn bộ nối trong bộ nhớ.
// Hai bộ nối lệch nhau thì đỏ ở đây; nhờ vậy ca sử dụng thử với bộ nhớ cũng đúng với hệ thật (nguyên tắc thay thế được).
// Cổng Runtime và Registry thật cần Docker nên không nằm ở đây: chúng được kiểm bằng lần thử thật, ghi ở README.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { localPorts, memoryPorts } = require('../src/composition');
const { emptyWorld } = require('../src/infrastructure/memory/world');
const { PORTS, assertPort } = require('../src/application/ports');
const ledgerOf = require('../src/domain/ledger');

const A = 'a'.repeat(40); const B = 'b'.repeat(40);
const SHOP = { repo: 'system_service/shop', commit: null, port: { local: 8000, container: 8080 }, health: '/health' };

/** Mỗi loại bộ nối: tên, và hàm dựng một bộ cổng mới tinh có sẵn tờ khai báo của dịch vụ "shop". */
const KINDS = [
  ['trên đĩa', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-contract-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
    fs.mkdirSync(path.join(root, 'infra', 'services'), { recursive: true });
    fs.writeFileSync(path.join(root, 'infra', 'services', 'shop.json'), JSON.stringify(SHOP));
    return localPorts({ root });
  }],
  ['trong bộ nhớ', () => { const w = emptyWorld(); w.manifest.services.shop = { ...SHOP }; return memoryPorts(w); }],
];

for (const [kind, make] of KINDS) {
  test(`[${kind}] mọi cổng có đủ hàm đã khai trong ports.js`, (t) => {
    const ports = make(t);
    for (const name of Object.keys(PORTS)) if (ports[name]) assert.doesNotThrow(() => assertPort(name, ports[name]), name);
    for (const name of ['declarations', 'source', 'configFiles', 'runtime', 'registry', 'sharedTier', 'secrets', 'ledger', 'locks', 'health', 'clock']) assert.ok(ports[name], `thiếu cổng ${name}`);
  });

  test(`[${kind}] Declarations: đọc mọi tờ; ghi tờ của một dịch vụ không đụng tờ khác; đối tượng trả về là bản sao`, async (t) => {
    const { declarations } = make(t);
    const m = await declarations.load();
    assert.deepEqual(Object.keys(m.services), ['shop']);
    m.services.shop.commit = B; // sửa bản sao không được làm đổi nơi lưu
    assert.equal((await declarations.load()).services.shop.commit, null);
    await declarations.save('feed', { ...SHOP, repo: 'system_service/feed', port: { local: 8001, container: 8080 } });
    await declarations.save('shop', { ...SHOP, commit: A });
    const after = await declarations.load();
    assert.deepEqual(Object.keys(after.services).sort(), ['feed', 'shop']);
    assert.deepEqual([after.services.shop.commit, after.services.feed.commit], [A, null]);
  });

  test(`[${kind}] Locks: một bên giữ thì bên sau bị từ chối kèm thông tin bên giữ; nhả rồi lấy lại được; within luôn nhả`, async (t) => {
    const { locks } = make(t);
    assert.equal(await locks.holder('deploy.shop'), null);
    assert.deepEqual(await locks.acquire('deploy.shop', { action: 'deploy', by: 'an' }), { ok: true });
    const second = await locks.acquire('deploy.shop', { action: 'rollback', by: 'binh' });
    assert.equal(second.ok, false);
    assert.deepEqual([second.holder.action, second.holder.by], ['deploy', 'an']);
    assert.equal((await locks.acquire('deploy.feed')).ok, true, 'khóa khác tên thì không liên quan');
    assert.equal((await locks.holder('deploy.shop')).by, 'an');
    await locks.release('deploy.shop');
    assert.equal(await locks.holder('deploy.shop'), null);
    assert.equal(await locks.within('tier', async () => 7), 7);
    await assert.rejects(locks.within('tier', async () => { throw new Error('hỏng giữa chừng'); }), /hỏng giữa chừng/);
    assert.equal(await locks.holder('tier'), null, 'lỗi trong fn vẫn nhả khóa');
  });

  test(`[${kind}] Ledger: sổ trống lúc đầu; ghi thêm không mất dòng khi nhiều bên ghi cùng lúc; khóa của sổ được nhả`, async (t) => {
    const { ledger, locks } = make(t);
    assert.deepEqual(await ledger.read(), ledgerOf.empty());
    const e = (commit) => ({ action: 'deploy', commit, from: null, result: 'ok', at: 't', by: '' });
    await Promise.all([ledger.append('shop', e(A)), ledger.append('feed', e(A)), ledger.append('shop', e(B)), ledger.append('feed', e(B))]);
    const book = await ledger.read();
    assert.equal(book.services.shop.history.length, 2);
    assert.equal(book.services.feed.history.length, 2);
    assert.equal(await locks.holder('ledger'), null);
    book.services.shop.history.length = 0; // sửa bản đọc ra không được làm đổi sổ
    assert.equal((await ledger.read()).services.shop.history.length, 2);
  });

  test(`[${kind}] Secrets: sinh cái còn thiếu, giữ nguyên cái đã có`, async (t) => {
    const { secrets } = make(t);
    const a = await secrets.ensure(['MOT']);
    const b = await secrets.ensure(['MOT', 'HAI']);
    assert.ok(a.MOT && a.MOT.length >= 32);
    assert.equal(b.MOT, a.MOT);
    assert.ok(b.HAI && b.HAI !== b.MOT);
  });

  test(`[${kind}] ConfigFiles: chưa trích thì cũ; trích xong thì mới; đổi commit thì lại cũ; không khai tệp thì không bao giờ cũ`, async (t) => {
    const { configFiles } = make(t);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-contract-src-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'conf'));
    fs.writeFileSync(path.join(dir, 'conf', 'run.json'), '{}');
    const decl = { ...SHOP, commit: A, files: [{ from: 'conf/run.json', to: '/config/run.json' }] };
    assert.equal(await configFiles.stale('shop', decl), true);
    await configFiles.install('shop', decl, dir);
    assert.equal(await configFiles.stale('shop', decl), false);
    assert.equal(await configFiles.stale('shop', { ...decl, commit: B }), true);
    assert.equal(await configFiles.stale('shop', { ...decl, files: [] }), false);
    assert.match(configFiles.hostPath('shop', 'conf/run.json'), /shop\/conf\/run\.json$/);
  });
}
