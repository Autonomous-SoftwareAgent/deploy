'use strict';
// Cổng RemoteShell tới một máy trên GCP. Hỏi gcloud MỘT lần xem máy ở địa chỉ nào và đăng nhập bằng tên gì
// (`gcloud compute ssh --dry-run`), rồi các lần sau gọi thẳng lệnh ssh với khóa mà gcloud đã tạo: gọi gcloud mỗi lần
// mất 5 tới 20 giây trên Windows, gọi ssh thẳng mất khoảng 1 giây. Máy đích không phải mở thêm cổng nào.
// Đoạn lệnh đi qua đầu vào chuẩn của `bash -s`, nên không lớp vỏ nào ở giữa diễn giải lại nó.
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const TIMEOUT_MS = 120000;
// Tên đăng nhập do gcloud đặt theo tên người dùng của máy này, có thể có chữ hoa.
const LOGIN_RE = /\b([A-Za-z_][A-Za-z0-9_-]{0,31})@(\d{1,3}(?:\.\d{1,3}){3})\b/;

function collect(child, timeoutMs, input) {
  return new Promise((resolve) => {
    let stdout = ''; let stderr = ''; let settled = false;
    const done = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => { try { child.kill(); } catch { /* đã thoát */ } done({ code: 124, stdout, stderr: `${stderr}\nquá ${timeoutMs / 1000} giây không có câu trả lời từ máy đích` }); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => done({ code: 1, stdout, stderr: stderr + e.message }));
    child.on('close', (code) => done({ code: code === null ? 1 : code, stdout, stderr }));
    if (input !== undefined) { child.stdin.on('error', () => { /* bên kia đã đóng */ }); child.stdin.end(input); }
  });
}

/**
 * target đã qua domain/target.validateTarget (mọi trường chỉ gồm ký tự an toàn cho dòng lệnh).
 * opts: { stateDir (nơi giữ khóa máy chủ đã biết), keyFile?, sshBin?, spawnImpl?, timeoutMs? }.
 * sshBin: lệnh ssh cần dùng (mặc định 'ssh' trên PATH). Trên Windows, ssh của hệ điều hành từ chối tệp khóa có quyền truy cập
 * quá rộng ('bad permissions'): hoặc siết quyền của tệp khóa, hoặc trỏ sshBin tới ssh đi kèm Git (biến BSN_SSH).
 */
function makeGcloudSshShell({ target, stateDir, keyFile = path.join(os.homedir(), '.ssh', 'google_compute_engine'), sshBin = 'ssh', spawnImpl = spawn, timeoutMs = TIMEOUT_MS }) {
  let login = null; // { user, host }

  /** Hỏi gcloud địa chỉ và tên đăng nhập. shell: true vì trên Windows gcloud là tệp .cmd; mọi tham số đã được kiểm dạng. */
  async function resolve() {
    const args = [...(target.configuration ? ['--configuration', target.configuration] : []), 'compute', 'ssh', target.instance, '--zone', target.zone, '--quiet', '--dry-run'];
    const res = await collect(spawnImpl('gcloud', args, { shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }), timeoutMs);
    const m = LOGIN_RE.exec(res.stdout) || LOGIN_RE.exec(res.stderr);
    if (!m) throw new Error(`gcloud không cho biết địa chỉ của máy ${target.instance} (mã thoát ${res.code}): ${(res.stderr || res.stdout).trim().split('\n').slice(-2).join(' ')}`);
    return { user: m[1], host: m[2] };
  }

  /** Khóa máy chủ ghi theo TÊN MÁY chứ không theo địa chỉ: địa chỉ đổi sau mỗi lần tắt bật, khóa thì không. Lần đầu tin, các lần sau so. */
  const sshArgs = (l) => [
    '-i', keyFile, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', `HostKeyAlias=bsn-${target.zone}-${target.instance}`, '-o', `UserKnownHostsFile=${path.join(stateDir, 'ssh_known_hosts')}`,
    '-o', 'StrictHostKeyChecking=accept-new', '-o', 'LogLevel=ERROR', `${l.user}@${l.host}`, 'bash -s',
  ];

  async function run(script) {
    if (!login) login = await resolve();
    return collect(spawnImpl(sshBin, sshArgs(login), { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }), timeoutMs, script);
  }

  return {
    async exec(script) {
      try {
        let res = await run(script);
        // Mã 255 là ssh không nối được (máy vừa tắt bật nên đổi địa chỉ): hỏi lại gcloud một lần rồi thử lại.
        if (res.code === 255) { login = null; res = await run(script); }
        return res;
      } catch (e) { return { code: 1, stdout: '', stderr: e.message }; }
    },
  };
}

module.exports = { makeGcloudSshShell };
