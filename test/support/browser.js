'use strict';
// Điều khiển một trình duyệt thật chạy ngầm (Edge hoặc Chrome có sẵn trên máy) qua giao thức DevTools, không cần thư viện ngoài.
// Dùng cho test giao diện: mở trang, chạy mã trong trang, chờ một điều kiện, gom lỗi JavaScript.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CANDIDATES = [
  process.env.BSN_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Đường dẫn trình duyệt tìm thấy trên máy, hoặc null. Đặt BSN_BROWSER để chỉ định. */
const findBrowser = () => CANDIDATES.find((p) => fs.existsSync(p)) || null;

/** Mở trình duyệt chạy ngầm. headers: header gửi kèm mọi yêu cầu (ví dụ Authorization). Trả { goto, js, until, click, errors, close }. */
async function openBrowser({ executable, headers = {} }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bsn-ui-'));
  // Cổng 0: trình duyệt tự chọn cổng trống và ghi vào tệp DevToolsActivePort trong thư mục hồ sơ.
  const child = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,1000', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  const close = async () => {
    child.kill(); await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* trình duyệt còn giữ tệp */ }
  };
  try {
    let port = null;
    for (let i = 0; i < 80 && !port; i++) { await sleep(150); try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { /* chưa ghi */ } }
    if (!port) throw new Error('trình duyệt không mở cổng điều khiển');
    let target = null;
    for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch { /* chưa lên */ } if (!target) await sleep(150); }
    if (!target) throw new Error('trình duyệt không có trang nào để điều khiển');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('không nối được vào trình duyệt')); });
    let id = 0; const waiting = new Map(); const errors = [];
    ws.onmessage = (m) => {
      const j = JSON.parse(m.data);
      if (j.id && waiting.has(j.id)) { waiting.get(j.id)(j); waiting.delete(j.id); }
      if (j.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(j.params.exceptionDetails).slice(0, 400));
      if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errors.push(`log: ${j.params.entry.text.slice(0, 200)}`);
    };
    const send = (method, params = {}) => new Promise((res) => { const n = id += 1; waiting.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
    for (const domain of ['Runtime', 'Page', 'Log', 'Network']) await send(`${domain}.enable`);
    if (Object.keys(headers).length) await send('Network.setExtraHTTPHeaders', { headers });
    /** Chạy một biểu thức trong trang, trả giá trị của nó. */
    const js = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(`mã chạy trong trang hỏng: ${(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text} (biểu thức: ${expression.slice(0, 120)})`); return r.result.result.value; };
    /** Chờ tới khi biểu thức đúng; quá hạn thì ném lỗi nói đang chờ gì. */
    const until = async (expression, what, tries = 100) => { for (let i = 0; i < tries; i++) { if (await js(expression)) return; await sleep(120); } throw new Error(`chờ không thấy: ${what}`); };
    /** Bấm nút đầu tiên (đang bấm được) có chữ bắt đầu bằng `text`, trong phạm vi `scope` (một biểu thức trả phần tử). */
    const click = async (text, scope = 'document') => {
      const ok = await js(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)}) && !x.disabled); if (!b) return false; b.click(); return true; })()`);
      if (!ok) throw new Error(`không bấm được nút: ${text}`);
      await sleep(150);
    };
    return { js, until, click, errors, goto: (url) => send('Page.navigate', { url }), close: async () => { try { ws.close(); } catch { /* đã đóng */ } await close(); } };
  } catch (e) { await close(); throw e; }
}

module.exports = { findBrowser, openBrowser, sleep };
