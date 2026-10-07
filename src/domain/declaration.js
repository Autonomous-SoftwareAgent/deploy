'use strict';
// Tờ khai báo của dịch vụ (services/<tên>.json) và cấu hình chung của nền (platform.json): luật hợp lệ.
// Thuần: nhận dữ liệu đã đọc, trả danh sách lỗi. Việc "repo có trên máy không" là của lớp application (cổng Source).
const { NAME_RE, COMMIT_RE, ENV_RE } = require('./naming');

const PORT_BASE = 8000;
const SERVICES_LABEL = 'services/<dịch-vụ>.json';
const PLATFORM_LABEL = 'platform.json';

const isAbsolute = (p) => /^([A-Za-z]:)?[\\/]/.test(p);
const escapes = (p) => p.split(/[\\/]/).includes('..');
const word = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(v);

function platformErrors(p) {
  const errs = [];
  if (!p.github || !word(p.github.org) || !word(p.github.platformRepo)) errs.push(`${PLATFORM_LABEL}: thiếu github.org hoặc github.platformRepo`);
  if (!p.registry || !word(p.registry.namespace)) errs.push(`${PLATFORM_LABEL}: thiếu registry.namespace (tài khoản Docker Hub)`);
  if (p.registry && !/^[a-z0-9-]*$/.test(p.registry.repoPrefix || '')) errs.push(`${PLATFORM_LABEL}: registry.repoPrefix chỉ chữ thường, số, gạch nối`);
  if (p.registry && p.registry.branch !== 'main') errs.push(`${PLATFORM_LABEL}: registry.branch hiện chỉ nhận "main" (S-023: trước mắt chỉ nhánh main được đóng gói)`);
  if (p.registry && (!Number.isInteger(p.registry.keep) || p.registry.keep < 2)) errs.push(`${PLATFORM_LABEL}: registry.keep phải là số nguyên từ 2 (số bản giữ lại mỗi dịch vụ)`);
  return errs;
}

function sidecarErrors(at, svc, ctx) {
  const errs = [];
  for (const [sn, sc] of Object.entries(svc.sidecars || {})) {
    if (!NAME_RE.test(sn)) errs.push(`${at}.sidecars: tên ${sn} không hợp lệ`);
    if (ctx.names.has(sn) || ctx.manifest.services[sn]) errs.push(`${at}.sidecars.${sn}: trùng tên với một dịch vụ`);
    if (sc.port) errs.push(...ctx.takePort(sc.port.local, `${at}.sidecars.${sn}`));
    for (const [k, v] of Object.entries(sc.env || {})) if (typeof v !== 'string' && !(v && typeof v === 'object' && ENV_RE.test(v.secret || ''))) errs.push(`${at}.sidecars.${sn}.env.${k}: phải là chuỗi hoặc {secret: TÊN_BIẾN}`);
  }
  return errs;
}

function serviceErrors(name, svc, ctx) {
  const at = `services.${name}`;
  const errs = [];
  if (!NAME_RE.test(name)) errs.push(`${at}: tên dịch vụ không hợp lệ`);
  if (!svc || typeof svc !== 'object') return [...errs, `${at}: phải là một đối tượng`];
  ctx.names.add(name);
  if (typeof svc.repo !== 'string' || !svc.repo || isAbsolute(svc.repo) || escapes(svc.repo)) errs.push(`${at}.repo: phải là đường dẫn tương đối trong workspace`);
  if (svc.commit !== null && svc.commit !== undefined && !COMMIT_RE.test(svc.commit)) errs.push(`${at}.commit: phải là mã commit đủ 40 ký tự hoặc null (chưa ghim)`);
  if (!svc.port || typeof svc.port !== 'object') errs.push(`${at}.port: thiếu {local, container}`);
  else {
    errs.push(...ctx.takePort(svc.port.local, at));
    if (!Number.isInteger(svc.port.container) || svc.port.container < 1) errs.push(`${at}.port.container: phải là số nguyên dương`);
  }
  if (typeof svc.health !== 'string' || !svc.health.startsWith('/')) errs.push(`${at}.health: phải là đường dẫn bắt đầu bằng /`);
  for (const [k, v] of Object.entries(svc.env || {})) {
    if (!ENV_RE.test(k)) errs.push(`${at}.env: tên biến ${k} không hợp lệ`);
    if (typeof v !== 'string') errs.push(`${at}.env.${k}: giá trị phải là chuỗi (bí mật thì khai tên ở secretEnv)`);
  }
  for (const k of svc.secretEnv || []) if (!ENV_RE.test(k)) errs.push(`${at}.secretEnv: tên biến ${k} không hợp lệ`);
  if (svc.database) {
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(svc.database.name || '')) errs.push(`${at}.database.name: chỉ chữ thường, số, gạch dưới`);
    if (!ENV_RE.test(svc.database.urlEnv || '')) errs.push(`${at}.database.urlEnv: thiếu tên biến nhận địa chỉ cơ sở dữ liệu`);
    if (typeof svc.database.urlFormat !== 'string' || !svc.database.urlFormat.includes('{db}')) errs.push(`${at}.database.urlFormat: phải có {db}`);
  }
  if (svc.broker && !ENV_RE.test(svc.broker.bootstrapEnv || '') && svc.broker.bootstrapEnv !== null) errs.push(`${at}.broker.bootstrapEnv: tên biến không hợp lệ (hoặc null nếu dịch vụ đọc từ tệp cấu hình)`);
  for (const a of svc.aliases || []) if (!NAME_RE.test(a)) errs.push(`${at}.aliases: tên ${JSON.stringify(a)} không hợp lệ`);
  for (const t of svc.topics || []) if (!/^[A-Za-z0-9._-]{1,200}$/.test(t)) errs.push(`${at}.topics: tên topic ${JSON.stringify(t)} không hợp lệ`);
  for (const f of svc.files || []) {
    if (!f || typeof f.from !== 'string' || isAbsolute(f.from) || escapes(f.from)) errs.push(`${at}.files: "from" phải là đường dẫn tương đối trong repo dịch vụ`);
    if (!f || typeof f.to !== 'string' || !f.to.startsWith('/')) errs.push(`${at}.files: "to" phải là đường dẫn tuyệt đối trong container`);
  }
  return [...errs, ...sidecarErrors(at, svc, ctx)];
}

/** Kiểm cả bộ khai báo {services, platform}. Trả danh sách lỗi; rỗng là hợp lệ. */
function validate(manifest) {
  const errs = manifest.platform ? platformErrors(manifest.platform) : [];
  const ports = new Map();
  const takePort = (p, who) => {
    if (!Number.isInteger(p) || p < PORT_BASE || p > 65535) return [`${who}: cổng local phải là số nguyên từ ${PORT_BASE} (đang là ${JSON.stringify(p)})`];
    if (ports.has(p)) return [`${who}: cổng local ${p} trùng với ${ports.get(p)}`];
    ports.set(p, who);
    return [];
  };
  const ctx = { manifest, names: new Set(), takePort };
  for (const [name, svc] of Object.entries(manifest.services)) errs.push(...serviceErrors(name, svc, ctx));
  // S-017: không dùng nhãn latest cho bất kỳ ảnh nào.
  if (/:latest\b/.test(JSON.stringify(manifest))) errs.push('tệp khai báo có nhãn ảnh "latest" (S-017 cấm)');
  return errs;
}

/** Đường dẫn repo của một tờ khai báo có dùng được không (để lớp ngoài biết có nên hỏi "repo có trên máy không"). */
const repoPathValid = (svc) => !!svc && typeof svc.repo === 'string' && !!svc.repo && !isAbsolute(svc.repo) && !escapes(svc.repo);

/** Tên biến môi trường mà một dịch vụ (và tiến trình chạy kèm của nó) cần lấy từ kho bí mật. */
function secretNames(svc) {
  const out = new Set(svc.secretEnv || []);
  for (const sc of Object.values(svc.sidecars || {})) for (const v of Object.values(sc.env || {})) if (v && typeof v === 'object' && v.secret) out.add(v.secret);
  return [...out];
}

/** Chọn dịch vụ theo tên; không nêu tên nào thì lấy hết. Tên lạ thì ném lỗi. */
function pick(manifest, wanted) {
  const all = Object.keys(manifest.services);
  if (!wanted.length) return all;
  for (const w of wanted) if (!manifest.services[w]) throw new Error(`không có dịch vụ "${w}" trong ${SERVICES_LABEL} (có: ${all.join(', ')})`);
  return wanted;
}

module.exports = { PORT_BASE, SERVICES_LABEL, PLATFORM_LABEL, validate, repoPathValid, secretNames, pick };
