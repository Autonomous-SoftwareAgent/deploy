#!/usr/bin/env node
'use strict';
// Chạy thử một bản đóng gói TRƯỚC KHI đẩy: bật đúng bản đó cạnh một PostgreSQL (và broker nếu dịch vụ khai) rồi gọi
// đường kiểm sức khỏe dịch vụ đã khai. Build xanh không chứng minh bản chạy được; bản không khỏe thì không được đẩy.
// Mọi thứ về dịch vụ lấy từ tờ khai báo của nó, giống hệt lúc chạy trong hệ (cùng hàm serviceEnv): tệp này không biết
// tên dịch vụ nào. Đồ giả lập đi kèm (sidecars) KHÔNG được bật: bản phải tự khởi động được khi thiếu chúng.
//   node ci/smoke.js --service <tên> --image <bản> --source <thư mục mã của dịch vụ> [--seconds 120]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { PG, BROKER, serviceEnv } = require('../src/domain/stack-plan');

// Cùng phiên bản với tầng dùng chung (local/docker-compose.yml); có test giữ hai nơi khớp nhau.
const IMAGES = Object.freeze({ postgres: 'postgres:17-alpine', broker: 'redpandadata/redpanda:v25.1.7' });
const BROKER_HOST = BROKER.internal.split(':')[0];

/**
 * Thuần: các lệnh docker cần chạy cho một tờ khai báo. id phân biệt các lần chạy trên cùng một máy.
 * Trả { network, containers: [{ name, role, args }], env, health: { containerPort, path }, topics }.
 */
function plan(svc, { id, image, source, secrets }) {
  const network = `bsn-smoke-${id}`;
  const name = (role) => `${network}-${role}`;
  const containers = [];
  if (svc.database) {
    containers.push({ name: name('pg'), role: 'postgres', args: ['run', '-d', '--name', name('pg'), '--network', network, '--network-alias', PG.host,
      '-e', `POSTGRES_USER=${PG.user}`, '-e', `POSTGRES_PASSWORD=${secrets[PG.secret]}`, '-e', `POSTGRES_DB=${svc.database.name}`, IMAGES.postgres] });
  }
  const useBroker = !!(svc.broker && svc.broker.bootstrapEnv);
  if (useBroker) {
    containers.push({ name: name('broker'), role: 'broker', args: ['run', '-d', '--name', name('broker'), '--network', network, '--network-alias', BROKER_HOST, IMAGES.broker,
      'redpanda', 'start', '--mode=dev-container', '--smp=1', '--memory=512M', '--kafka-addr=internal://0.0.0.0:9092', `--advertise-kafka-addr=internal://${BROKER.internal}`] });
  }
  const env = serviceEnv(svc, secrets);
  const args = ['run', '-d', '--name', name('svc'), '--network', network, '-p', `127.0.0.1::${svc.port.container}`];
  for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
  for (const f of svc.files || []) args.push('-v', `${path.resolve(source, f.from).replace(/\\/g, '/')}:${f.to}:ro`);
  args.push(image);
  containers.push({ name: name('svc'), role: 'service', args });
  return { network, containers, env, health: { containerPort: svc.port.container, path: svc.health }, topics: useBroker ? svc.topics || [] : [] };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8' });

async function until(what, seconds, probe) {
  const end = Date.now() + seconds * 1000;
  for (;;) {
    if (await probe()) return;
    if (Date.now() > end) throw new Error(`quá ${seconds} giây: ${typeof what === 'function' ? what() : what}`);
    await sleep(2000);
  }
}

async function run({ service, image, source, seconds }) {
  const svc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'services', `${service}.json`), 'utf8'));
  if (!svc.health || !svc.port) throw new Error(`${service}: tờ khai báo thiếu health hoặc port, không chạy thử được`);
  const secrets = { [PG.secret]: crypto.randomBytes(12).toString('hex') };
  for (const k of svc.secretEnv || []) secrets[k] = crypto.randomBytes(16).toString('hex');
  const p = plan(svc, { id: crypto.randomBytes(4).toString('hex'), image, source, secrets });
  for (const f of svc.files || []) if (!fs.existsSync(path.resolve(source, f.from))) throw new Error(`${service}: mã của dịch vụ không có tệp ${f.from} (khai ở files)`);
  const names = p.containers.map((c) => c.name);
  const byRole = (role) => p.containers.find((c) => c.role === role);
  try {
    const net = docker(['network', 'create', p.network]);
    if (net.status !== 0) throw new Error(`không tạo được mạng: ${net.stderr.trim()}`);
    for (const c of p.containers.filter((x) => x.role !== 'service')) {
      const r = docker(c.args);
      if (r.status !== 0) throw new Error(`không bật được ${c.role}: ${r.stderr.trim().split('\n').pop()}`);
    }
    if (byRole('postgres')) await until('PostgreSQL chưa sẵn sàng', 60, () => docker(['exec', byRole('postgres').name, 'pg_isready', '-U', PG.user, '-d', svc.database.name]).status === 0);
    if (byRole('broker')) {
      await until('broker chưa sẵn sàng', 90, () => docker(['exec', byRole('broker').name, 'rpk', 'cluster', 'health', '--exit-when-healthy', '-X', `brokers=${BROKER.internal}`]).status === 0);
      if (p.topics.length) docker(['exec', byRole('broker').name, 'rpk', 'topic', 'create', ...p.topics, '-X', `brokers=${BROKER.internal}`]);
    }
    const started = docker(byRole('service').args);
    if (started.status !== 0) throw new Error(`không bật được bản đóng gói: ${started.stderr.trim().split('\n').pop()}`);
    const port = (docker(['port', byRole('service').name, `${p.health.containerPort}/tcp`]).stdout.trim().split('\n')[0] || '').split(':').pop();
    if (!/^\d+$/.test(port)) throw new Error('không đọc được cổng của bản đang chạy thử');
    const url = `http://127.0.0.1:${port}${p.health.path}`;
    let last = 'chưa trả lời';
    await until(() => `${p.health.path} không trả 2xx (lần cuối: ${last})`, seconds, async () => {
      if (docker(['inspect', '-f', '{{.State.Running}}', byRole('service').name]).stdout.trim() !== 'true') throw new Error('bản đóng gói đã tự thoát ngay sau khi bật');
      try { const res = await fetch(url, { signal: AbortSignal.timeout(3000) }); last = `HTTP ${res.status}`; return res.ok; } catch (e) { last = e.message; return false; }
    });
    process.stdout.write(`KHỎE: ${service} trả 2xx ở ${p.health.path} (bản ${image})\n`);
    return 0;
  } catch (e) {
    process.stdout.write(`KHÔNG KHỎE: ${e.message}\n`);
    const svcName = (byRole('service') || {}).name;
    const logs = svcName ? docker(['logs', '--tail', '40', svcName]) : null;
    if (logs) process.stdout.write(`--- 40 dòng nhật ký cuối của bản chạy thử ---\n${logs.stdout}${logs.stderr}\n`);
    return 1;
  } finally {
    docker(['rm', '-f', '-v', ...names]);
    docker(['network', 'rm', p.network]);
  }
}

function parseArgs(argv) {
  const out = { seconds: 120 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!['service', 'image', 'source', 'seconds'].includes(key) || argv[i + 1] === undefined) throw new Error(`tham số không hợp lệ: ${argv[i]}`);
    out[key] = key === 'seconds' ? Number(argv[i + 1]) : argv[i + 1];
  }
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(out.service || '') || !out.image || !out.source || !(out.seconds > 0)) throw new Error('cần --service <tên> --image <bản> --source <thư mục>');
  return out;
}

module.exports = { plan, parseArgs, IMAGES };

if (require.main === module) {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { process.stderr.write(`LỖI: ${e.message}\n`); process.exit(2); }
  run(args).then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`LỖI: ${e.message}\n`); process.exitCode = 1; });
}
