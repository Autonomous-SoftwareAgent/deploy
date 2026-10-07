'use strict';
// NƠI DUY NHẤT chạy tiến trình ngoài một cách đồng bộ (git, docker, tar). Mọi bộ nối nhận hàm run qua tham số, nên test thay được.
const { spawnSync } = require('node:child_process');

/** Chạy một lệnh, không ném lỗi. Trả {status, stdout, stderr}. */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: (r.stderr || '') + (r.error ? String(r.error.message) : '') };
}

/** Như run, nhưng ném lỗi kèm các dòng cuối của đầu ra khi lệnh hỏng. */
function must(runner, cmd, args, what, opts) {
  const r = runner(cmd, args, opts);
  if (r.status !== 0) throw new Error(`${what} hỏng: ${(r.stderr || r.stdout).trim().split('\n').slice(-12).join('\n')}`);
  return r;
}

module.exports = { run, must };
