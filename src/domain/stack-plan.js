'use strict';
// Mô tả chạy của các dịch vụ trên một đích: tên mạng, tầng dùng chung, biến môi trường, cổng, nhãn.
// Thuần: ra một đối tượng theo khuôn compose; ghi nó ra đâu và chạy bằng gì là việc của bộ nối Runtime.
const { localImage, containerName, COMMIT_LABEL } = require('./naming');
const { secretNames } = require('./declaration');

const NETWORK = 'bsn-local';
const TIER_PROJECT = 'bsn-local';
const SERVICES_PROJECT = 'bsn-services';
const PG = Object.freeze({ container: 'bsn-postgres', host: 'postgres', port: 5432, user: 'bsn', secret: 'BSN_PG_PASSWORD' });
const BROKER = Object.freeze({ container: 'bsn-redpanda', internal: 'redpanda:9092' });

/** Mọi tên bí mật cần có để chạy các dịch vụ được nêu (kèm mật khẩu của PostgreSQL dùng chung). */
function allSecretNames(manifest, names) {
  const out = new Set([PG.secret]);
  for (const n of names) for (const s of secretNames(manifest.services[n])) out.add(s);
  return [...out];
}

/** Biến môi trường của một dịch vụ: phần khai sẵn, bí mật, địa chỉ cơ sở dữ liệu và broker do nền cấp. */
function serviceEnv(svc, secrets) {
  const env = { ...(svc.env || {}) };
  for (const k of svc.secretEnv || []) env[k] = secrets[k];
  if (svc.database) {
    env[svc.database.urlEnv] = svc.database.urlFormat
      .replace('{user}', PG.user).replace('{password}', secrets[PG.secret]).replace('{host}', PG.host).replace('{port}', String(PG.port)).replace('{db}', svc.database.name);
  }
  if (svc.broker && svc.broker.bootstrapEnv) env[svc.broker.bootstrapEnv] = BROKER.internal;
  return env;
}

/**
 * Mô tả chạy cho các dịch vụ được chọn, từ bản đã ghim, trên mạng chung.
 * hostFile(name, from): đường dẫn trên máy của một tệp cấu hình đã trích (do cổng ConfigFiles cho).
 */
function composeFor(manifest, names, secrets, hostFile) {
  const services = {};
  for (const name of names) {
    const svc = manifest.services[name];
    if (!svc.commit) throw new Error(`${name}: chưa ghim commit (chạy: node infra/bsn.js pin ${name} --apply)`);
    services[name] = {
      image: localImage(name, svc.commit),
      container_name: containerName(name),
      restart: 'unless-stopped',
      environment: serviceEnv(svc, secrets),
      ports: [`127.0.0.1:${svc.port.local}:${svc.port.container}`],
      networks: { default: { aliases: svc.aliases || [] } },
      labels: { 'bsn.service': name, [COMMIT_LABEL]: svc.commit },
      ...(svc.files && svc.files.length ? { volumes: svc.files.map((f) => `${hostFile(name, f.from)}:${f.to}:ro`) } : {}),
    };
    for (const [sn, sc] of Object.entries(svc.sidecars || {})) {
      const env = {};
      for (const [k, v] of Object.entries(sc.env || {})) env[k] = typeof v === 'string' ? v : secrets[v.secret];
      services[sn] = {
        image: localImage(sn, svc.commit),
        container_name: containerName(sn),
        restart: 'unless-stopped',
        environment: env,
        networks: ['default'],
        labels: { 'bsn.sidecar-of': name, [COMMIT_LABEL]: svc.commit },
        ...(sc.port ? { ports: [`127.0.0.1:${sc.port.local}:${sc.port.container}`] } : {}),
      };
    }
  }
  return { name: SERVICES_PROJECT, services, networks: { default: { name: NETWORK, external: true } } };
}

module.exports = { NETWORK, TIER_PROJECT, SERVICES_PROJECT, PG, BROKER, allSecretNames, serviceEnv, composeFor };
