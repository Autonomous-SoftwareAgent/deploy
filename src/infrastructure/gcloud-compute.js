'use strict';
// spec: BDK-S-006
// Cổng Cloud bằng lệnh gcloud của máy chạy bảng điều khiển: tạo và xóa một máy trên Google Compute Engine.
// Dùng tài khoản và dự án của cấu hình gcloud được chỉ định; bảng điều khiển không giữ khóa cloud nào.
// Mọi tham số đã qua domain/provision.requestErrors (chỉ ký tự an toàn cho dòng lệnh).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TIMEOUT_MS = 5 * 60 * 1000;
const IMAGE = Object.freeze({ family: 'ubuntu-2404-lts-amd64', project: 'ubuntu-os-cloud' }); // cùng hệ điều hành với máy đã chạy thử
const DISK = '20GB';

function collect(child, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = ''; let stderr = ''; let settled = false;
    const done = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => { try { child.kill(); } catch { /* đã thoát */ } done({ code: 124, stdout, stderr: `${stderr}\ngcloud did not answer within ${timeoutMs / 1000} seconds` }); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => done({ code: 1, stdout, stderr: stderr + e.message }));
    child.on('close', (code) => done({ code: code === null ? 1 : code, stdout, stderr }));
  });
}

function makeGcloudCompute({ spawnImpl = spawn, timeoutMs = TIMEOUT_MS } = {}) {
  /** shell: true vì trên Windows gcloud là tệp .cmd. */
  const gcloud = (configuration, args) => collect(spawnImpl('gcloud', [...(configuration ? ['--configuration', configuration] : []), ...args, '--quiet'], { shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }), timeoutMs);
  const result = (res) => (res.code === 0 ? { ok: true } : { ok: false, error: (res.stderr || res.stdout).trim().split('\n').slice(-3).join(' ').slice(0, 400) || `gcloud exit ${res.code}` });
  return {
    async createInstance({ configuration, name, zone, machineType, labels = {} }) {
      const tags = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
      return result(await gcloud(configuration, ['compute', 'instances', 'create', name, '--zone', zone, '--machine-type', machineType,
        '--image-family', IMAGE.family, '--image-project', IMAGE.project, '--boot-disk-size', DISK, ...(tags ? ['--labels', tags] : [])]));
    },
    /** Xóa máy cùng đĩa khởi động của nó. Máy đã không còn thì coi như xong. */
    async deleteInstance({ configuration, name, zone }) {
      const res = await gcloud(configuration, ['compute', 'instances', 'delete', name, '--zone', zone, '--delete-disks', 'all']);
      return res.code !== 0 && /was not found|notFound/i.test(res.stderr) ? { ok: true } : result(res);
    },
    /** true, false, hoặc null khi không hỏi được. */
    async instanceExists({ configuration, name, zone }) {
      const res = await gcloud(configuration, ['compute', 'instances', 'describe', name, '--zone', zone, '--format', 'value(name)']);
      if (res.code === 0) return res.stdout.trim() === name;
      return /was not found|notFound/i.test(res.stderr) ? false : null;
    },
  };
}

/** Đoạn lệnh chuẩn bị máy (server/setup.sh của repo này), gửi sang máy mới qua đầu vào chuẩn của SSH. */
function makeFsSetupScript({ layout }) {
  return { read: () => fs.readFileSync(path.join(layout.base, 'server', 'setup.sh'), 'utf8').replace(/\r\n/g, '\n') };
}

module.exports = { makeGcloudCompute, makeFsSetupScript };
