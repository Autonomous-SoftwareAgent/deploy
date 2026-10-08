'use strict';
// spec: BDK-S-006
// Luật THÊM và GỠ MÔI TRƯỜNG từ bảng điều khiển. Một môi trường là một máy chạy hệ. Có hai cách thêm: khai một máy đã có,
// hoặc cho bảng điều khiển TẠO một máy mới trên cloud (tốn tiền). Tạo máy chỉ cho ra một máy sẵn sàng nhận lệnh; không deploy gì.
// Thuần: không gọi cloud, không đọc tệp.
const { validateTarget } = require('./target');

const NAME_RE = /^[a-z][a-z0-9-]{1,30}$/;
// Giá là ƯỚC TÍNH (máy kèm đĩa 20 GB, vùng Singapore, chưa đối chiếu với hóa đơn): chỉ để người bấm biết cỡ tiền trước khi tạo.
const MACHINE_TYPES = Object.freeze([
  { id: 'e2-micro', memoryGb: 1, usdPerDay: 0.35 },
  { id: 'e2-small', memoryGb: 2, usdPerDay: 0.7 },
  { id: 'e2-medium', memoryGb: 4, usdPerDay: 1.2 },
]);
const DEFAULT_MACHINE = 'e2-small';
const ROOT = '/opt/bsn';
const STEPS = Object.freeze(['machine', 'ssh', 'setup', 'verify']);
const STATE = Object.freeze({ CREATING: 'creating', READY: 'ready', FAILED: 'failed', DELETING: 'deleting' });

/** Tờ khai đích của một máy trên GCP. configuration: tên cấu hình gcloud (tài khoản, dự án) hoặc bỏ trống. */
function specOf({ name, instance, zone, configuration, machineType }) {
  return { transport: 'gcloud-ssh', ...(configuration ? { configuration } : {}), instance: instance || name, zone, root: ROOT, ...(machineType ? { machineType } : {}) };
}

/** Lỗi của một yêu cầu thêm môi trường. mode: 'create' (tạo máy mới) | 'register' (khai máy đã có). taken: các tên môi trường đang có. */
function requestErrors({ mode, name, instance, zone, configuration, machineType }, taken) {
  const errs = [];
  if (!['create', 'register'].includes(mode)) return ['mode must be create or register'];
  if (!NAME_RE.test(name || '')) errs.push('name: 2 to 31 lowercase letters, digits or dashes, starting with a letter');
  else if (taken.includes(name)) errs.push(`an environment named ${name} already exists`);
  if (mode === 'create' && !MACHINE_TYPES.some((m) => m.id === machineType)) errs.push(`machineType must be one of: ${MACHINE_TYPES.map((m) => m.id).join(', ')}`);
  if (mode === 'register' && !instance) errs.push('instance: the name of the existing machine');
  if (errs.length) return errs;
  // Mọi trường đi vào dòng lệnh gcloud và ssh: dùng lại luật của tờ khai đích.
  return validateTarget({ name, ...specOf({ name, instance: mode === 'register' ? instance : name, zone, configuration }) }).map((e) => `target: ${e}`);
}

module.exports = { MACHINE_TYPES, DEFAULT_MACHINE, STEPS, STATE, ROOT, NAME_RE, specOf, requestErrors };
