#!/usr/bin/env node
'use strict';
// Quét một bản đóng gói TRƯỚC KHI đẩy lên Docker Hub (kho công khai, S-023): tìm bí mật lọt vào ảnh.
// Dùng trong workflow dùng chung, sau khi bung hệ tệp của ảnh ra một thư mục:
//   node infra/ci/scan-image.js --dir <thư mục hệ tệp> [--history <tệp chứa đầu ra docker history --no-trunc>]
// Thoát mã 1 nếu thấy. Chỉ in loại, tệp và dòng; KHÔNG in giá trị tìm thấy.
// Giới hạn: chỉ bắt các dạng token có khuôn rõ và các tên tệp hay chứa bí mật. Bỏ qua thư mục thư viện
// (node_modules, site-packages...) và thư mục hệ thống vì chúng chứa khóa mẫu và chứng chỉ công khai.
// Qua được bước này KHÔNG chứng minh ảnh sạch; nó chỉ chặn các lỗi thường gặp.
const fs = require('node:fs');
const path = require('node:path');

const TOKENS = [
  ['khóa riêng dạng PEM', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/],
  ['token Docker Hub', /dckr_pat_[A-Za-z0-9_-]{20,}/],
  ['token GitHub', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/],
  ['token GitHub (fine-grained)', /github_pat_[A-Za-z0-9_]{40,}/],
  ['khóa AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['khóa API Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['token Slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
];
const SKIP_DIRS = new Set(['node_modules', 'site-packages', 'dist-packages', '.venv', 'venv', 'proc', 'sys', 'dev']);
// Thư mục hệ thống ở GỐC ảnh: của ảnh nền, không phải của dịch vụ.
const SKIP_TOP = new Set(['usr', 'lib', 'lib64', 'bin', 'sbin', 'etc', 'var', 'run', 'boot', 'media', 'mnt']);
const SECRET_NAME = /(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY)/i;
const MAX_BYTES = 5 * 1024 * 1024;

function badFileName(name) {
  if (/^\.env(\..+)?$/.test(name)) return /\.(example|sample|template|dist)$/.test(name) ? '' : 'tệp .env';
  if (/\.(pem|key|p12|pfx|jks)$/i.test(name)) return 'tệp khóa';
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(name)) return 'khóa SSH';
  return '';
}

/** Tìm token trong một đoạn chữ. Trả về [{kind, line}], không kèm giá trị. */
function scanText(text) {
  const out = [];
  const lines = text.split('\n');
  for (const [kind, re] of TOKENS) for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) out.push({ kind, line: i + 1 });
  return out;
}

/** Quét một cây thư mục (hệ tệp của ảnh). Trả về [{kind, file, line}]. */
function scanDir(root) {
  const found = [];
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (e.name === '.git') { found.push({ kind: 'thư mục .git (lịch sử mã nằm trong ảnh)', file: rel, line: 0 }); continue; }
        if (SKIP_DIRS.has(e.name) || (depth === 0 && SKIP_TOP.has(e.name))) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      const bad = badFileName(e.name);
      if (bad) found.push({ kind: bad, file: rel, line: 0 });
      let buf;
      try { if (fs.statSync(full).size > MAX_BYTES) continue; buf = fs.readFileSync(full); } catch { continue; }
      if (buf.subarray(0, 8192).includes(0)) continue; // tệp nhị phân
      for (const f of scanText(buf.toString('utf8'))) found.push({ ...f, file: rel });
    }
  };
  walk(root, 0);
  return found;
}

/** Quét đầu ra `docker history --no-trunc`: token, và ENV/ARG có tên như bí mật mà mang giá trị. */
function scanHistory(text) {
  const found = scanText(text).map((f) => ({ ...f, file: 'docker history' }));
  text.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/\b(?:ENV|ARG)\s+([A-Za-z_][A-Za-z0-9_]*)=(\S+)/g)) {
      if (SECRET_NAME.test(m[1]) && m[2] && !/^["']?["']?$/.test(m[2])) found.push({ kind: `biến ${m[1]} mang giá trị trong lớp ảnh (ENV/ARG hiện trong docker history)`, file: 'docker history', line: i + 1 });
    }
  });
  return found;
}

function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : ''; };
  const dir = arg('--dir');
  if (!dir || !fs.existsSync(dir)) { process.stderr.write('Dùng: node infra/ci/scan-image.js --dir <thư mục hệ tệp của ảnh> [--history <tệp>]\n'); return 2; }
  const found = scanDir(dir);
  const hist = arg('--history');
  if (hist) found.push(...scanHistory(fs.readFileSync(hist, 'utf8')));
  if (!found.length) { process.stdout.write('Quét bí mật: không thấy gì trong các dạng được kiểm (xem giới hạn ở đầu tệp scan-image.js).\n'); return 0; }
  for (const f of found) process.stdout.write(`BÍ MẬT? ${f.kind}: ${f.file}${f.line ? `:${f.line}` : ''}\n`);
  process.stdout.write(`Thấy ${found.length} chỗ. KHÔNG đẩy bản này lên kho công khai. Gỡ khỏi ảnh (và đổi bí mật nếu là thật) rồi build lại.\n`);
  return 1;
}

module.exports = { scanText, scanDir, scanHistory, badFileName };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
