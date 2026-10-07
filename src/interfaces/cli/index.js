'use strict';
// Dòng lệnh: phân tích tham số, tìm lệnh trong bảng đăng ký, gọi, đổi kết quả thành mã thoát.
// Đây là chỗ duy nhất của dòng lệnh quyết định mã thoát. Thêm lệnh mới: thêm một tệp vào commands/ và một dòng vào bảng.
const COMMANDS = [
  require('./commands/check'),
  require('./commands/status'),
  require('./commands/images'),
  require('./commands/pin'),
  require('./commands/build'),
  require('./commands/up'),
  require('./commands/down'),
  require('./commands/deploy'),
  require('./commands/rollback'),
];
const BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

const usage = (extra = []) => `Lệnh: ${[...COMMANDS, ...extra].map((c) => c.usage).join(' | ')}. Thêm --apply để chạy thật; check, status, images, deploy, rollback nhận --json.`;

/** "--apply --port=8900 deploy shop" -> { cmd, args, flags: Set, options: Map }. */
function parse(argv) {
  const flags = new Set(); const options = new Map(); const pos = [];
  for (const a of argv) {
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 0) options.set(a.slice(2, eq), a.slice(eq + 1)); else flags.add(a.slice(2));
  }
  return { cmd: pos[0], args: pos.slice(1), flags, options };
}

/**
 * Chạy một lệnh. io: { app, say, env }. Trả mã thoát.
 * extra: các lệnh ngoài bảng (ví dụ lệnh mở bảng điều khiển) do cửa vào đăng ký thêm.
 */
async function runCli(argv, io, extra = []) {
  const { cmd, args, flags, options } = parse(argv);
  const { app, say, env = {} } = io;
  const command = BY_NAME.get(cmd) || extra.find((c) => c.name === cmd);
  if (!command) { say(usage(extra)); return cmd ? 1 : 0; }
  const json = flags.has('json');
  const seconds = Number(io.healthSeconds || env.BSN_HEALTH_SECONDS) > 0 ? Number(io.healthSeconds || env.BSN_HEALTH_SECONDS) : 120;
  const by = env.BSN_ACTOR || env.GITHUB_ACTOR || env.USERNAME || env.USER || '';
  // check và images chạy được trên máy chỉ có repo deploy (máy của GitHub): khi đó không đòi repo của dịch vụ có mặt.
  // Lệnh tự đứng (standalone) không cần tờ khai báo hợp lệ mới chạy được.
  const checked = command.standalone ? { ok: true, errors: [], manifest: null } : await app.check({ requireRepos: command.requireRepos === undefined ? true : command.requireRepos });
  const ctx = { app, args, flags, options, say, json, apply: flags.has('apply'), verbose: flags.has('verbose'), seconds, by, checked, manifest: checked.manifest, io };
  if (command.name !== 'check' && !checked.ok) {
    if (json) say(JSON.stringify({ ok: false, errors: checked.errors }));
    else for (const e of checked.errors) say(`LỖI trong infra/services/<dịch-vụ>.json: ${e}`);
    return 1;
  }
  return command.run(ctx);
}

module.exports = { runCli, parse, usage, COMMANDS };
