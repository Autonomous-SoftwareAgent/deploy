'use strict';
// Hai bộ nối cho cổng JobExecutor.
//   - tiến trình con: chạy đúng lệnh điều khiển (bsn.js deploy|rollback ... --apply --json) trong một tiến trình riêng. Vì vậy máy chủ
//     web không bị đứng trong lúc kéo bản, và bảng điều khiển tắt giữa chừng thì lần đưa lên vẫn chạy tới cuối (khóa của nó ngăn lần thứ hai).
//   - gọi thẳng: chạy ca sử dụng ngay trong tiến trình này; dùng với bộ nối trong bộ nhớ (test, phát triển giao diện).
const { spawn } = require('node:child_process');

/** Lệnh điều khiển in đúng MỘT đối tượng JSON ở dòng cuối khi có --json. */
function lastJson(text) {
  const lines = String(text).trim().split('\n').filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) { try { const j = JSON.parse(lines[i]); if (j && typeof j === 'object') return j; } catch { /* dòng không phải JSON */ } }
  return null;
}

/** Tách dòng từ dữ liệu đến dần; mỗi dòng là JSON có trường event thì báo cho onEvent. Trả hàm nhận thêm dữ liệu. */
function eventFeeder(onEvent) {
  let rest = '';
  return (chunk) => {
    rest += chunk;
    const lines = rest.split('\n');
    rest = lines.pop();
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('{')) continue;
      try { const j = JSON.parse(s); if (j && typeof j.event === 'string') onEvent(j); } catch { /* không phải JSON */ }
    }
  };
}

function makeChildProcessJobExecutor({ entry, cwd, env = process.env }) {
  return {
    run({ service, action, commit, by }, { onEvent } = {}) {
      return new Promise((resolve) => {
        const args = [entry, action, service, ...(commit ? [commit] : []), '--apply', '--json', ...(onEvent ? ['--events'] : [])];
        const feed = onEvent ? eventFeeder(onEvent) : null;
        // detached: tiến trình con KHÔNG chết theo bảng điều khiển. Thiếu cờ này thì trên Windows Node tự giết mọi tiến trình con khi
        // tiến trình cha chết, và trên Linux phím Ctrl+C ở cửa sổ của bảng điều khiển cũng tới tiến trình con: lần đưa lên bị cắt ngang
        // sau khi đã đổi container mà chưa kịp ghi sổ (đã gặp thật ngày 2026-10-07).
        const child = spawn(process.execPath, args, { cwd, env: { ...env, BSN_ACTOR: by }, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = ''; let err = '';
        child.stdout.on('data', (d) => { out += d; if (feed) feed(String(d)); });
        child.stderr.on('data', (d) => { err += d; });
        const fail = (why) => ({ ok: false, service, action, reason: `lệnh điều khiển không trả kết quả (${why}): ${(err || out).trim().split('\n').slice(-4).join(' ')}` });
        child.on('error', (e) => resolve(fail(e.message)));
        child.on('close', (code) => resolve(lastJson(out) || fail(`mã thoát ${code}`)));
      });
    },
  };
}

/** use: { loadManifest(), deploy(input), rollback(input) }: các ca sử dụng đã lắp, do composition đưa vào. */
function makeDirectJobExecutor({ use, seconds = 120 }) {
  return {
    async run({ service, action, commit, by }, { onEvent } = {}) {
      const log = [];
      const say = (line) => { log.push(line); if (onEvent) onEvent({ event: 'log', text: line }); };
      const step = onEvent ? (name, status, phase) => onEvent({ event: 'step', step: name, status, phase }) : undefined;
      const input = { manifest: await use.loadManifest(), name: service, apply: true, seconds, by, say, step };
      const result = action === 'deploy' ? await use.deploy({ ...input, commit: commit || undefined }) : await use.rollback({ ...input, ref: commit || undefined });
      return { ...result, log };
    },
  };
}

module.exports = { makeChildProcessJobExecutor, makeDirectJobExecutor, lastJson, eventFeeder };
