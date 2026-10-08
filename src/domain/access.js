'use strict';
// Luật AN TOÀN của bảng điều khiển: ai được deploy hay rollback ở môi trường nào, môi trường nào đòi gõ tên xác nhận,
// đòi người thứ hai duyệt, hay đang trong khung giờ khóa. Thuần: cấu hình, người gọi và giờ hiện tại đều được đưa vào.
// Môi trường và vai trò là dữ liệu của cấu hình; tệp này không biết tên môi trường nào.

const ROLES = Object.freeze(['Developer', 'QA', 'Tech lead', 'DevOps', 'Agent']);
const ADMIN_ROLE = 'Admin'; // người quản trị có sẵn: mọi quyền, không nằm trong bảng phân quyền
const LEVEL = Object.freeze({ NONE: 0, DEPLOY: 1, ROLLBACK: 2 }); // 2 gồm cả deploy
const DAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const GATE = Object.freeze({
  FORBIDDEN: 'FORBIDDEN', // vai trò không có quyền ở môi trường này
  NOT_ALLOWED_USER: 'NOT_ALLOWED_USER', // môi trường giới hạn theo tên người và người gọi không có trong danh sách
  FREEZE_WINDOW: 'FREEZE_WINDOW', // đang trong khung giờ khóa
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED', // chưa gõ đúng tên để xác nhận
});

const noProtect = () => ({ approval: false, typeName: false, restrict: false, allowedUsers: [], freeze: { on: false, from: 'Fri 16:00', to: 'Mon 08:00' } });
const fullAccess = () => Object.fromEntries(ROLES.map((r) => [r, LEVEL.ROLLBACK]));

/** "Fri 16:00" -> phút tính từ đầu tuần (thứ Hai 00:00). Sai dạng: null. */
function weekMinute(text) {
  const m = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) ([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(text || '').trim());
  return m ? DAYS.indexOf(m[1]) * 1440 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/** Phút trong tuần của một thời điểm, theo giờ của máy chạy bảng điều khiển. */
function weekMinuteOf(date) {
  return ((date.getDay() + 6) % 7) * 1440 + date.getHours() * 60 + date.getMinutes();
}

/** Khung giờ khóa có đang hiệu lực không. Khung có thể vắt qua cuối tuần (từ thứ Sáu tới thứ Hai). */
function frozenAt(freeze, minute) {
  if (!freeze || !freeze.on) return false;
  const a = weekMinute(freeze.from); const b = weekMinute(freeze.to);
  if (a === null || b === null) return false;
  return a <= b ? minute >= a && minute < b : minute >= a || minute < b;
}

/** Cấu hình cho một danh sách môi trường: lấy phần đã lưu, môi trường nào chưa có thì nhận mặc định (không khóa gì, ai cũng làm được). */
function normalize(saved, envIds) {
  const src = saved && typeof saved === 'object' ? saved : {};
  const environments = {}; const permissions = {};
  envIds.forEach((id, i) => {
    const e = (src.environments && src.environments[id]) || {};
    const p = { ...noProtect(), ...(e.protect || {}) };
    environments[id] = { order: Number.isInteger(e.order) ? e.order : i, color: e.color || null, description: e.description || null, protect: { ...p, allowedUsers: [...(p.allowedUsers || [])], freeze: { ...noProtect().freeze, ...(p.freeze || {}) } } };
    permissions[id] = { ...fullAccess(), ...((src.permissions && src.permissions[id]) || {}) };
  });
  const b = src.branches || {};
  return { environments, permissions, branches: { defaults: b.defaults || {}, services: b.services || {}, rules: Array.isArray(b.rules) ? b.rules : [] } };
}

const MODES = ['manual', 'auto', 'pattern', 'none'];
function mappingErrors(at, map, envIds) {
  const errs = [];
  for (const [owner, perEnv] of Object.entries(map || {})) for (const [env, m] of Object.entries(perEnv || {})) {
    if (!envIds.includes(env)) errs.push(`${at}.${owner}.${env}: unknown environment`);
    if (!m || !MODES.includes(m.mode) || typeof m.value !== 'string' || m.value.length > 100) errs.push(`${at}.${owner}.${env}: needs a mode (${MODES.join(', ')}) and a branch value`);
  }
  return errs;
}

/** Lỗi của một bản cấu hình (đã qua normalize). Trả danh sách câu; rỗng là hợp lệ. */
function configErrors(cfg, envIds) {
  const errs = [];
  for (const id of envIds) {
    const e = cfg.environments[id]; const at = `environments.${id}`;
    if (e.color !== null && !/^#[0-9a-fA-F]{6}$/.test(e.color)) errs.push(`${at}.color: must look like #1A2B3C`);
    if (e.description !== null && (typeof e.description !== 'string' || e.description.length > 200 || /[\r\n]/.test(e.description))) errs.push(`${at}.description: one line, at most 200 characters`);
    const p = e.protect;
    for (const k of ['approval', 'typeName', 'restrict']) if (typeof p[k] !== 'boolean') errs.push(`${at}.protect.${k}: must be true or false`);
    if (!Array.isArray(p.allowedUsers) || p.allowedUsers.some((u) => typeof u !== 'string' || !u)) errs.push(`${at}.protect.allowedUsers: must be a list of user names`);
    if (typeof p.freeze.on !== 'boolean') errs.push(`${at}.protect.freeze.on: must be true or false`);
    if (p.freeze.on && (weekMinute(p.freeze.from) === null || weekMinute(p.freeze.to) === null)) errs.push(`${at}.protect.freeze: from and to must look like "Fri 16:00"`);
    for (const r of ROLES) if (![0, 1, 2].includes(cfg.permissions[id][r])) errs.push(`permissions.${id}.${r}: must be 0 (view), 1 (deploy) or 2 (deploy and rollback)`);
  }
  errs.push(...mappingErrors('branches.defaults', cfg.branches.defaults, envIds), ...mappingErrors('branches.services', cfg.branches.services, envIds));
  const seen = new Set();
  for (const r of cfg.branches.rules) {
    if (!r || typeof r.id !== 'string' || !r.id || seen.has(r.id)) errs.push('branches.rules: every rule needs a unique id');
    else seen.add(r.id);
    if (!r || typeof r.pattern !== 'string' || !r.pattern.trim() || r.pattern.length > 100) errs.push(`branches.rules.${r && r.id}: needs a branch pattern`);
    if (r && r.environmentId !== null && !envIds.includes(r.environmentId)) errs.push(`branches.rules.${r.id}: unknown environment`);
  }
  return errs;
}

const isProtected = (protect) => !!protect && (protect.approval || protect.typeName || protect.restrict || protect.freeze.on);

function levelOf(cfg, role, envId) {
  if (role === ADMIN_ROLE) return LEVEL.ROLLBACK;
  const row = cfg.permissions[envId] || {};
  return row[role] === undefined ? LEVEL.NONE : row[role];
}
const can = (cfg, role, envId, kind) => levelOf(cfg, role, envId) >= (kind === 'rollback' ? LEVEL.ROLLBACK : LEVEL.DEPLOY);

/**
 * Cổng an toàn cho MỘT yêu cầu ở một môi trường. facts: { cfg, envId, envName, kind, actor: {name, role}, minute, serviceIds }.
 * Trả { blockers: [{code, message}], confirmation: chuỗi phải gõ | null, approval: có cần người thứ hai duyệt không }.
 */
function gate({ cfg, envId, envName, kind, actor, minute, serviceIds }) {
  const blockers = [];
  const p = (cfg.environments[envId] || { protect: noProtect() }).protect;
  if (!can(cfg, actor.role, envId, kind)) blockers.push({ code: GATE.FORBIDDEN, message: `Role ${actor.role} may not ${kind} on ${envName}.` });
  else if (p.restrict && actor.role !== ADMIN_ROLE && !p.allowedUsers.includes(actor.name)) blockers.push({ code: GATE.NOT_ALLOWED_USER, message: `${envName} only accepts requests from its listed users, and ${actor.name} is not one of them.` });
  if (frozenAt(p.freeze, minute)) blockers.push({ code: GATE.FREEZE_WINDOW, message: `${envName} is in its freeze window (${p.freeze.from} → ${p.freeze.to}).` });
  return { blockers, confirmation: p.typeName ? (serviceIds.length === 1 ? serviceIds[0] : envName) : null, approval: !!p.approval };
}

/** Ai được duyệt một yêu cầu: người khác người gửi, có quyền mức cao nhất ở môi trường đó. */
const canApprove = (cfg, approver, requesterName, envId) => approver.name !== requesterName && levelOf(cfg, approver.role, envId) >= LEVEL.ROLLBACK;

/** Ai được sửa cấu hình của bảng điều khiển và quản lý người dùng. */
const canAdminister = (role) => role === ADMIN_ROLE || role === 'DevOps';

module.exports = { canAdminister, ROLES, ADMIN_ROLE, LEVEL, DAYS, GATE, normalize, configErrors, isProtected, levelOf, can, gate, canApprove, frozenAt, weekMinute, weekMinuteOf };
