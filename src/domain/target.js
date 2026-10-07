'use strict';
// Một ĐÍCH TỪ XA: máy chạy hệ mà bảng điều khiển ở máy khác điều khiển qua SSH. Luật hợp lệ của tờ khai một đích.
// Mọi trường đều đi vào dòng lệnh, nên chỉ nhận ký tự an toàn. Thuần: không đọc tệp, không gọi lệnh.

const WORD = /^[a-z0-9][a-z0-9-]{0,62}$/;
const ROOT = /^\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;
const TRANSPORTS = ['gcloud-ssh'];

/** Trả danh sách lỗi; rỗng là hợp lệ. target: { name, transport, configuration?, instance, zone, root }. */
function validateTarget(t) {
  if (!t || typeof t !== 'object') return ['tờ khai đích phải là một đối tượng'];
  const errs = [];
  if (!WORD.test(t.name || '')) errs.push('name: chỉ chữ thường, số, gạch nối');
  if (!TRANSPORTS.includes(t.transport)) errs.push(`transport: hiện chỉ nhận ${TRANSPORTS.join(', ')}`);
  if (t.configuration !== undefined && !WORD.test(t.configuration)) errs.push('configuration: tên cấu hình gcloud không hợp lệ');
  if (!WORD.test(t.instance || '')) errs.push('instance: tên máy không hợp lệ');
  if (!WORD.test(t.zone || '')) errs.push('zone: tên vùng không hợp lệ');
  if (!ROOT.test(t.root || '') || String(t.root).split('/').includes('..')) errs.push('root: phải là đường dẫn tuyệt đối trên máy đích, ví dụ /opt/bsn');
  return errs;
}

/** Dòng mô tả đích cho người đọc. */
const describeTarget = (t) => `${t.name} (máy ${t.instance}, vùng ${t.zone}, qua SSH)`;

module.exports = { validateTarget, describeTarget, TRANSPORTS };
