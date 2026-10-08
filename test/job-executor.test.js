'use strict';
// Bộ nối JobExecutor chạy việc trong tiến trình con: việc phải chạy tới cuối DÙ bảng điều khiển (tiến trình cha) chết giữa chừng.
// Lỗi thật đã gặp ngày 2026-10-07: thiếu cờ detached thì trên Windows tiến trình con chết theo cha, lần rollback dừng sau khi
// đã đổi container mà chưa ghi sổ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { makeChildProcessJobExecutor, makeDirectJobExecutor, lastJson } = require('../src/infrastructure/job-executors');

const EXECUTORS = path.join(__dirname, '..', 'src', 'infrastructure', 'job-executors.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function workdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-job-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  return dir;
}

test('tiến trình con: gọi đúng lệnh điều khiển, truyền người bấm qua BSN_ACTOR, trả đối tượng JSON ở dòng cuối', async (t) => {
  const dir = workdir(t);
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, "console.log('dòng diễn giải'); console.log(JSON.stringify({ ok: true, argv: process.argv.slice(2), by: process.env.BSN_ACTOR }));\n");
  const res = await makeChildProcessJobExecutor({ entry, cwd: dir }).run({ service: 'shop', action: 'rollback', commit: 'abc1234', by: 'admin' });
  assert.deepEqual(res, { ok: true, argv: ['rollback', 'shop', 'abc1234', '--apply', '--json'], by: 'admin' });
  const noCommit = await makeChildProcessJobExecutor({ entry, cwd: dir }).run({ service: 'shop', action: 'deploy', commit: null, by: 'agent' });
  assert.deepEqual(noCommit.argv, ['deploy', 'shop', '--apply', '--json']);
});

test('tiến trình con hỏng mà không in JSON: trả kết quả hỏng kèm mấy dòng cuối, không treo', async (t) => {
  const dir = workdir(t);
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, "process.stderr.write('LỖI: tờ khai báo hỏng\\n'); process.exitCode = 3;\n");
  const res = await makeChildProcessJobExecutor({ entry, cwd: dir }).run({ service: 'shop', action: 'deploy', by: 'agent' });
  assert.equal(res.ok, false);
  assert.match(res.reason, /mã thoát 3.*tờ khai báo hỏng/);
  assert.deepEqual(lastJson('a\n{"ok":1}\nb'), { ok: 1 }, 'lấy đối tượng JSON cuối cùng, bỏ qua dòng chữ');
});

test('bảng điều khiển chết giữa chừng: việc đang chạy trong tiến trình con vẫn chạy tới cuối', async (t) => {
  const dir = workdir(t);
  const marker = path.join(dir, 'xong.txt');
  const started = path.join(dir, 'bat-dau.txt');
  // "Lệnh điều khiển" giả: báo đã bắt đầu, làm việc 3 giây, rồi ghi dấu đã xong.
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, `const fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(started)}, 'x'); setTimeout(() => { fs.writeFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(" ")); }, 3000);\n`);
  // "Bảng điều khiển" giả: một tiến trình dùng đúng bộ nối thật để chạy việc, rồi bị giết.
  const parent = path.join(dir, 'parent.js');
  fs.writeFileSync(parent, `require(${JSON.stringify(EXECUTORS)}).makeChildProcessJobExecutor({ entry: ${JSON.stringify(entry)}, cwd: ${JSON.stringify(dir)} }).run({ service: 'shop', action: 'deploy', by: 'admin' }); setInterval(() => {}, 1000);\n`);
  const p = spawn(process.execPath, [parent], { stdio: 'ignore' });
  for (let i = 0; i < 100 && !fs.existsSync(started); i++) await sleep(50);
  assert.ok(fs.existsSync(started), 'việc đã bắt đầu');
  p.kill('SIGKILL');
  await new Promise((r) => p.once('exit', r));
  assert.ok(!fs.existsSync(marker), 'lúc bảng điều khiển chết, việc chưa xong');
  // Chờ tới khi tệp có NỘI DUNG: tệp có thể vừa được tạo mà chưa kịp ghi xong.
  const content = () => { try { return fs.readFileSync(marker, 'utf8'); } catch { return ''; } };
  for (let i = 0; i < 400 && !content(); i++) await sleep(50);
  assert.equal(content(), 'deploy shop --apply --json', 'việc vẫn chạy tới cuối sau khi tiến trình cha chết');
});

test('gọi thẳng: chạy ca sử dụng trong tiến trình này, gom lời diễn giải vào trường log', async () => {
  const seen = [];
  const use = {
    loadManifest: async () => ({ services: { shop: {} } }),
    deploy: async (input) => { seen.push(['deploy', input.name, input.apply, input.by, input.seconds]); input.say('đang làm'); return { ok: true }; },
    rollback: async (input) => { seen.push(['rollback', input.name, input.ref]); return { ok: false, reason: 'x' }; },
  };
  const ex = makeDirectJobExecutor({ use, seconds: 7 });
  assert.deepEqual(await ex.run({ service: 'shop', action: 'deploy', by: 'agent' }), { ok: true, log: ['đang làm'] });
  assert.deepEqual(await ex.run({ service: 'shop', action: 'rollback', commit: 'abc1234', by: 'agent' }), { ok: false, reason: 'x', log: [] });
  assert.deepEqual(seen, [['deploy', 'shop', true, 'agent', 7], ['rollback', 'shop', 'abc1234']]);
});

// --- Tiến trình đến dần (đợt A4): bộ chạy việc báo từng bước và từng dòng qua onEvent ---

test('tiến trình con: có onEvent thì gọi lệnh kèm --events và báo dần từng dòng sự kiện, kể cả khi dữ liệu đến bị cắt giữa dòng', async (t) => {
  const dir = workdir(t);
  const entry = path.join(dir, 'entry.js');
  // In một sự kiện thành hai mảnh để kiểm việc ghép dòng, một dòng chữ thường, rồi kết quả.
  fs.writeFileSync(entry, "const w=(s)=>process.stdout.write(s);w('{\"event\":\"step\",\"step\":\"fetch\",');setTimeout(()=>{w('\"status\":\"running\",\"phase\":\"forward\"}\\n');w('dòng thường\\n');w(JSON.stringify({event:'log',text:'xin chào'})+'\\n');w(JSON.stringify({ok:true,argv:process.argv.slice(2)})+'\\n');},50);\n");
  const seen = [];
  const res = await makeChildProcessJobExecutor({ entry, cwd: dir }).run({ service: 'shop', action: 'deploy', commit: 'abc1234', by: 'admin' }, { onEvent: (e) => seen.push(e) });
  assert.deepEqual(res.argv, ['deploy', 'shop', 'abc1234', '--apply', '--json', '--events']);
  assert.deepEqual(seen, [{ event: 'step', step: 'fetch', status: 'running', phase: 'forward' }, { event: 'log', text: 'xin chào' }]);
  assert.equal(res.ok, true, 'kết quả vẫn là đối tượng cuối, không phải một sự kiện');
});

test('gọi thẳng: báo dòng diễn giải và bước qua onEvent; deploy nhận commit được chọn', async () => {
  const seen = []; const got = [];
  const use = {
    loadManifest: async () => ({ services: { shop: {} } }),
    deploy: async (input) => { got.push(input.commit); input.say('đang làm'); input.step('health', 'running', 'forward'); return { ok: true }; },
    rollback: async () => ({ ok: true }),
  };
  await makeDirectJobExecutor({ use }).run({ service: 'shop', action: 'deploy', commit: 'c'.repeat(40), by: 'agent' }, { onEvent: (e) => seen.push(e) });
  assert.deepEqual(got, ['c'.repeat(40)]);
  assert.deepEqual(seen, [{ event: 'log', text: 'đang làm' }, { event: 'step', step: 'health', status: 'running', phase: 'forward' }]);
});
