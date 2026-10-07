'use strict';
// Luật thuần của lớp domain: không tệp, không Docker, không mạng. Mỗi test là một bảng "dữ kiện -> quyết định".
const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../src/domain/deploy-policy');
const ledger = require('../src/domain/ledger');
const naming = require('../src/domain/naming');
const { OUTCOME } = require('../src/domain/outcome');

const A = 'a'.repeat(40); const B = 'b'.repeat(40); const C = 'c'.repeat(40);
const entry = (commit, result = 'ok', action = 'deploy') => ({ action, commit, from: null, result, at: 't', by: '' });
const book = (...entries) => { const l = ledger.empty(); for (const e of entries) ledger.record(l, 'shop', e); return l; };

test('deploy: chưa khai thì từ chối; chưa có bản thì chờ build; đang chạy đúng bản thì không đổi; còn lại là chuyển bản', () => {
  const facts = { name: 'shop', remote: 'acme/svc-shop:main-x' };
  assert.equal(policy.planDeploy({ ...facts, declared: null }).outcome, OUTCOME.NOT_DECLARED);
  const waiting = policy.planDeploy({ ...facts, declared: B, running: A, published: false });
  assert.deepEqual([waiting.kind, waiting.outcome, waiting.from, waiting.to], ['refuse', OUTCOME.WAITING_BUILD, A, B]);
  assert.match(waiting.reason, /CHỜ BUILD/);
  assert.deepEqual(policy.planDeploy({ ...facts, declared: A, running: A, published: true }), { kind: 'noop', from: A, to: A });
  assert.deepEqual(policy.planDeploy({ ...facts, declared: B, running: A, published: true }), { kind: 'switch', from: A, to: B });
  assert.deepEqual(policy.planDeploy({ ...facts, declared: B, running: null, published: true }), { kind: 'switch', from: null, to: B }, 'chưa có gì chạy vẫn deploy được');
  // Một commit đã khai mà chưa có bản thì từ chối DÙ nó đang là bản chạy (bản ở máy có thể là build tay).
  assert.equal(policy.planDeploy({ ...facts, declared: A, running: A, published: false }).outcome, OUTCOME.WAITING_BUILD);
});

test('rollback: mặc định về bản liền trước; theo tiền tố thì phải khớp đúng một commit; chỉ nhận bản đã từng chạy khỏe', () => {
  const l = book(entry(A), entry(B), entry(C, 'failed'));
  assert.deepEqual(policy.planRollback({ name: 'shop', ledger: l, running: B }), { kind: 'switch', from: B, to: A });
  assert.deepEqual(policy.planRollback({ name: 'shop', ledger: l, running: B, ref: A.slice(0, 8) }), { kind: 'switch', from: B, to: A });
  assert.equal(policy.planRollback({ name: 'shop', ledger: l, running: B, ref: C.slice(0, 8) }).outcome, OUTCOME.NEVER_RAN_HERE);
  assert.equal(policy.planRollback({ name: 'shop', ledger: l, running: B, ref: 'dddddddd' }).outcome, OUTCOME.UNKNOWN_REF);
  assert.equal(policy.planRollback({ name: 'shop', ledger: l, running: B, ref: 'xyz' }).outcome, OUTCOME.UNKNOWN_REF, 'không phải mã hệ 16');
  assert.equal(policy.planRollback({ name: 'shop', ledger: book(entry(A)), running: A }).outcome, OUTCOME.NO_PREVIOUS);
  assert.equal(policy.planRollback({ name: 'khac', ledger: l, running: null }).outcome, OUTCOME.NO_PREVIOUS, 'dịch vụ chưa có trong sổ');
  assert.equal(policy.planRollback({ name: 'shop', ledger: l, running: A }).kind, 'noop', 'đang chạy đúng bản liền trước');
  // Hai commit cùng tiền tố thì không đoán.
  const twins = book(entry('ab' + '1'.repeat(38)), entry('ab' + '2'.repeat(38)));
  assert.equal(policy.planRollback({ name: 'shop', ledger: twins, running: null, ref: 'ab' + '0'.repeat(5) }).outcome, OUTCOME.UNKNOWN_REF);
});

test('rollback: bản để lùi về phải còn ở máy hoặc trên kho; hỏng thì bật lại bản đang chạy trước đó (nếu có)', () => {
  assert.equal(policy.rollbackImageAvailable({ to: A, from: B, local: true, published: false }), null);
  assert.equal(policy.rollbackImageAvailable({ to: A, from: B, local: false, published: true }), null);
  assert.equal(policy.rollbackImageAvailable({ to: A, from: B, local: false, published: false }).outcome, OUTCOME.IMAGE_GONE);
  assert.equal(policy.revertTarget(A), A);
  assert.equal(policy.revertTarget(null), null);
});

test('sổ deploy: lần thành công đổi "đang chạy" và "liền trước"; lần hỏng chỉ thêm dòng; chạy lại đúng bản đang chạy không đổi "liền trước"', () => {
  const l = book(entry(A), entry(B, 'failed'), entry(A, 'ok', 'auto-revert'));
  assert.deepEqual([ledger.of(l, 'shop').current.commit, ledger.previousCommit(l, 'shop')], [A, null]);
  ledger.record(l, 'shop', entry(B));
  assert.deepEqual([ledger.of(l, 'shop').current.commit, ledger.previousCommit(l, 'shop')], [B, A]);
  assert.equal(ledger.ranOk(l, 'shop', B), true);
  assert.equal(ledger.ranOk(l, 'shop', C), false);
  assert.equal(ledger.lastRequested(l, 'shop').commit, B, 'không tính lần tự bật lại');
  assert.deepEqual(ledger.recent(l, 'shop', 2).map((h) => h.action), ['deploy', 'auto-revert'], 'mới trước');
});

test('sổ deploy: giữ tối đa 50 dòng; dữ liệu lạ coi là sổ trống; sổ của bản mới hơn thì từ chối', () => {
  const l = ledger.empty();
  for (let i = 0; i < 60; i++) ledger.record(l, 'shop', entry(String(i).padStart(40, '0'), 'failed'));
  assert.equal(ledger.of(l, 'shop').history.length, ledger.HISTORY_KEEP);
  assert.deepEqual(ledger.accept(null, 'x'), ledger.empty());
  assert.deepEqual(ledger.accept({ services: 'sai' }, 'x'), ledger.empty());
  assert.throws(() => ledger.accept({ schema: ledger.SCHEMA + 1, services: {} }, 'tệp-sổ'), /tệp-sổ có schema/);
});

test('đặt tên: bản ở máy, bản trên kho, và commit đọc từ nhãn của bản', () => {
  const platform = { registry: { namespace: 'acme', repoPrefix: 'svc-', branch: 'main' } };
  assert.equal(naming.localImage('shop', A), 'bsn-shop:aaaaaaaaaaaa');
  assert.equal(naming.remoteImage(platform, 'shop', A), 'acme/svc-shop:main-aaaaaaaaaaaa');
  assert.throws(() => naming.remoteImage(null, 'shop', A), /platform\.json/);
  assert.deepEqual(naming.imageTargets('shop', { commit: A, build: { target: 'app' }, sidecars: { sim: { target: 'sim' } } }), [
    { image: 'bsn-shop:aaaaaaaaaaaa', target: 'app', main: true }, { image: 'bsn-sim:aaaaaaaaaaaa', target: 'sim', main: false },
  ]);
  assert.equal(naming.commitFromLabels(A, B), A, 'nhãn chuẩn của CI được ưu tiên');
  assert.equal(naming.commitFromLabels('<no value>', B), B);
  assert.equal(naming.commitFromLabels('', 'rác'), '');
});
