'use strict';
// TEST GIAO DIỆN bằng trình duyệt thật chạy ngầm, với bảng điều khiển trong bộ nhớ (dữ liệu mẫu, không đụng hệ nào).
// Máy không có Edge hay Chrome thì test tự BỎ QUA và nói rõ (bỏ qua không phải là đạt). Tắt hẳn: đặt BSN_SKIP_UI=1.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMemoryConsole } = require('../src/composition');
const { sampleWorld } = require('../src/infrastructure/memory/world');
const { findBrowser, openBrowser } = require('./support/browser');

const executable = process.env.BSN_SKIP_UI === '1' ? null : findBrowser();
const skip = executable ? false : 'không tìm thấy Edge hay Chrome trên máy này (hoặc BSN_SKIP_UI=1): giao diện CHƯA được kiểm';

async function open(t) {
  const board = buildMemoryConsole({ world: sampleWorld({ delayMs: 150 }), port: 0 });
  await board.auth.ensure();
  const { port } = await board.server.listen();
  const password = /trình duyệt\): (\S+)/.exec(board.world.firstLogin)[1];
  const page = await openBrowser({ executable, headers: { Authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}` } });
  t.after(async () => { await page.close(); await board.provision.settle(); await board.runs.settle(); await board.server.close(); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.until("document.querySelectorAll('.trow .svcn').length >= 3", 'bảng dịch vụ');
  const side = "document.querySelector('.side')";
  const title = (text) => page.until(`document.querySelector('.h1') && document.querySelector('.h1').textContent === ${JSON.stringify(text)}`, `tiêu đề ${text}`);
  /** Gõ vào ô nhập có nhãn `label` (ô nhập giữ giá trị qua sự kiện input). */
  const type = (label, value) => page.js(`(() => { const l = [...document.querySelectorAll('.main label.fld, .modal label.fld')].find((x) => x.querySelector('span') && x.querySelector('span').textContent === ${JSON.stringify(label)}); if (!l) return false; const i = l.querySelector('input'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const deployButtonOf = (name) => `[...document.querySelectorAll('.trow')].find((r) => r.querySelector('.svcn') && r.querySelector('.svcn').textContent === ${JSON.stringify(name)}).querySelector('.btn')`;
  return { board, page, side, title, type, deployButtonOf };
}

test('giao diện: tổng quan, deploy hai dịch vụ một lượt (một lên, một tự lùi), chi tiết dịch vụ, log, so sánh theo tệp', { skip, timeout: 90000 }, async (t) => {
  const { page } = await open(t);
  assert.deepEqual(await page.js("[...document.querySelectorAll('.thead .c')].map((c) => c.textContent.trim()).filter(Boolean)"), ['Service', 'mau-thu', 'mau-that']);
  assert.equal(await page.js("document.querySelector('html').lang"), 'en');
  await page.until("document.querySelector('.side .me').textContent.includes('Live updates on')", 'đang nhận thay đổi trực tiếp');
  for (const name of ['mau-tot', 'mau-hong']) { await page.js(`document.querySelector('.trow input[aria-label="Select ${name}"]').click()`); await page.until(`document.querySelector('.trow input[aria-label="Select ${name}"]').checked`, `đã chọn ${name}`); }
  await page.click('Deploy…', "document.querySelector('.selbar')");
  await page.until("document.querySelectorAll('.modal .tcard').length === 2", 'hộp thoại hai mục');
  await page.click('Show files changed', "document.querySelector('.modal')");
  await page.until("[...document.querySelectorAll('.modal summary')].some((s) => /file changed/.test(s.textContent))", 'danh sách tệp đổi');
  await page.click('Deploy 2 services');
  await page.until("!!document.querySelector('.steps')", 'màn tiến trình');
  await page.until("[...document.querySelectorAll('.callout b')].some((b) => /restored to the previous version/.test(b.textContent))", 'kết quả: một dịch vụ tự lùi');
  assert.deepEqual(await page.js("[...document.querySelectorAll('.main .panel .row > .chip')].map((c) => c.textContent)"), ['Succeeded', 'Previous version restored']);
  await page.click('Back to overview');
  await page.until("document.querySelectorAll('.trow .svcn').length >= 3", 'bảng dịch vụ lần hai');
  await page.js("[...document.querySelectorAll('.svcn')].find((b) => b.textContent === 'mau-tot').click()");
  await page.until("document.querySelectorAll('.ecard').length === 2 && document.querySelectorAll('.tlrow').length > 0", 'chi tiết dịch vụ');
  await page.click('Commits');
  await page.until("document.querySelectorAll('.crow').length > 0", 'tab Commits');
  await page.click('Logs');
  await page.until("document.querySelectorAll('.term > div').length >= 3", 'log của container');
  await page.click('Environment variables');
  await page.until("!!document.querySelector('.main .empty')", 'tab biến môi trường');
  assert.deepEqual(page.errors, [], 'trang không có lỗi JavaScript');
});

test('giao diện: lưu cấu hình bảo vệ rồi hộp thoại đòi gõ tên; tạo một môi trường rồi xóa máy; sổ thao tác ghi đủ', { skip, timeout: 90000 }, async (t) => {
  const { board, page, side, title, type, deployButtonOf } = await open(t);
  await page.click('Environments', side); await title('Environments');
  await page.until("document.querySelectorAll('.main input[type=color]').length === 2 && !!document.getElementById('env-add-go')", 'hai môi trường và biểu mẫu thêm');
  await page.js("(() => { const p = [...document.querySelectorAll('.main .panel')].filter((x) => x.querySelector('input[type=color]'))[0]; [...p.querySelectorAll('label')].find((x) => x.textContent.trim() === 'Type the service name to confirm').querySelector('input').click(); return true; })()");
  await page.click('Preview changes');
  await page.until("document.querySelectorAll('.chgl > div').length === 1", 'xem trước một thay đổi');
  await page.click('Save as new version');
  await page.until("!document.querySelector('.main .dirtydot')", 'đã lưu');
  assert.equal((await board.settings.get()).config.environments['mau-thu'].protect.typeName, true, 'máy chủ đã lưu');

  await type('Environment name', 'staging-2');
  assert.equal(await page.js("document.getElementById('env-add-go').disabled"), true, 'chưa gõ tên xác nhận thì chưa tạo được máy');
  await type('Type the environment name to confirm', 'staging-2');
  await page.click('Create machine');
  await page.until("document.querySelectorAll('.main input[type=color]').length === 3", 'môi trường thứ ba');
  assert.deepEqual([...board.world.instances.keys()], ['staging-2']);
  await page.js("(() => { const i = document.querySelector('.main .crow input[aria-label=\"Type staging-2\"]'); i.value = 'staging-2'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
  await page.click('Delete machine');
  await page.until("document.querySelectorAll('.main input[type=color]').length === 2", 'môi trường đã gỡ');
  assert.equal(board.world.instances.size, 0, 'máy đã bị xóa');

  await page.click('System overview', side);
  await page.until("document.querySelectorAll('.trow .svcn').length >= 3", 'bảng dịch vụ');
  await page.js(`${deployButtonOf('mau-tot')}.click()`);
  await page.until("!!document.getElementById('confirm-name')", 'ô gõ tên xác nhận');
  assert.equal(await page.js("document.getElementById('confirm-go').disabled"), true);
  await type('Type mau-tot to confirm', 'mau-tot');
  assert.equal(await page.js("document.getElementById('confirm-go').disabled"), false);
  await page.click('Deploy mau-tot to mau-thu');
  await page.until("[...document.querySelectorAll('.callout b')].some((b) => /Completed/.test(b.textContent))", 'lần chạy xong');
  await page.click('History, import, export', side); await title('History, import, export');
  await page.until("document.querySelectorAll('.main .tlrow').length >= 4", 'sổ thao tác');
  const actions = await page.js("[...document.querySelectorAll('.main .tlrow .chip')].map((c) => c.textContent)");
  for (const a of ['deploy.start', 'environment.delete', 'environment.create', 'config.save']) assert.ok(actions.includes(a), a);
  assert.deepEqual(page.errors, [], 'trang không có lỗi JavaScript');
});
