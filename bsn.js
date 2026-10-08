#!/usr/bin/env node
'use strict';
// Cửa vào của lệnh điều khiển (S-017, S-023). Chạy từ gốc BSN_:
//   node infra/bsn.js check                     kiểm các tờ khai báo infra/services/<dịch-vụ>.json
//   node infra/bsn.js status                    commit được ghim so với HEAD, bản, container, cổng, sổ deploy
//   node infra/bsn.js images [--strict]         bản của mọi commit được ghim đã có trên Docker Hub chưa
//   node infra/bsn.js pin <dịch-vụ> [commit]    ghim một commit (mặc định HEAD) vào tờ khai báo của ĐÚNG dịch vụ đó
//   node infra/bsn.js build [dịch-vụ...]        build bản TỪ COMMIT ĐƯỢC GHIM (không đọc thư mục làm việc)
//   node infra/bsn.js up [--pull] [dịch-vụ...]  bật tầng dùng chung và các dịch vụ (--pull: kéo bản CI thay vì build)
//   node infra/bsn.js down [--volumes]          tắt (kèm --volumes thì xóa cả dữ liệu local)
//   node infra/bsn.js deploy <dịch-vụ>          đưa bản đã khai lên chạy; không khỏe thì tự bật lại bản trước
//   node infra/bsn.js rollback <dịch-vụ> [commit]  lùi về bản liền trước, hoặc về một commit đã từng chạy khỏe ở đây
//   node infra/bsn.js console [--memory | --target=<tên>] [--port=8900]  bảng điều khiển web, chỉ nghe trên 127.0.0.1
//       --memory: dữ liệu mẫu, không đụng hệ nào. --target=<tên>: điều khiển hệ trên máy từ xa khai ở targets/<tên>.json
// Lệnh làm thay đổi mặc định CHỈ IN KẾ HOẠCH; thêm --apply mới chạy thật. check, status, images, deploy, rollback nhận --json.
// Tệp này chỉ lắp ráp và gọi: quy tắc ở src/domain, ca sử dụng ở src/application (xem docs/agent/ARCHITECTURE.md).
const path = require('node:path');
const { buildLocalApp, buildLocalConsole, buildMemoryConsole, buildRemoteConsole } = require('./src/composition');
const { describeTarget } = require('./src/domain/target');
const { runCli } = require('./src/interfaces/cli');
const { makeConsoleCommand } = require('./src/interfaces/cli/commands/console');

const ROOT = path.resolve(__dirname, '..');

/**
 * io (cho test): { root, run, health(port, path, seconds), healthSeconds, log }.
 * Trả mã thoát; lỗi không lường trước thì ném.
 */
async function main(argv, io = {}) {
  const say = io.log || ((s) => process.stdout.write(s + '\n'));
  const health = io.health ? { waitHealthy: (target, seconds) => io.health(target.port, target.path, seconds) } : undefined;
  const root = io.root || ROOT;
  const app = buildLocalApp({ root, run: io.run, health });
  const consoleCommand = makeConsoleCommand({
    open: ({ memory, target, port }) => {
      let board;
      if (memory) board = buildMemoryConsole({ port });
      else if (target) board = buildRemoteConsole({ root, port, targetName: target, sshBin: process.env.BSN_SSH });
      else board = buildLocalConsole({ root, entry: __filename, port, sshBin: process.env.BSN_SSH });
      return { auth: board.auth, server: board.server, importRecords: board.importRecords, describe: board.target ? describeTarget(board.target) : '', warm: () => { board.console.state().catch(() => {}); }, firstLogin: () => board.world.firstLogin, untilClosed: () => new Promise(() => {}) };
    },
  });
  return runCli(argv, { app, say, env: process.env, healthSeconds: io.healthSeconds }, [consoleCommand]);
}

module.exports = { main };

if (require.main === module) {
  // Bên đọc đầu ra có thể đã biến mất (bảng điều khiển tắt giữa lúc một việc đang chạy): việc đã làm xong thì không coi đó là lỗi.
  process.stdout.on('error', (e) => { if (e.code !== 'EPIPE') throw e; });
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((e) => { process.stderr.write(`LỖI: ${e.message}\n`); process.exitCode = 1; });
}
