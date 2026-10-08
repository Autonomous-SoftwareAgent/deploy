'use strict';
// spec: BDK-S-004
// Luật ÁNH XẠ NHÁNH của bảng điều khiển: nhánh nào ứng với môi trường nào, cho từng dịch vụ. Thuần.
// Ánh xạ chỉ là KHAI BÁO Ý ĐỊNH: nền không tự deploy khi có push (S-029: khai báo commit trước, build sau), nên chế độ "auto"
// và "pattern" ở đây không tự chạy gì; chúng cho biết nhánh nào được coi là nguồn của môi trường.

const NONE = Object.freeze({ mode: 'none', value: '', inherited: false });

/** So một tên nhánh với một mẫu có dấu * (ví dụ release/*). Không có * thì phải trùng hẳn. */
function globMatch(pattern, branch) {
  const p = String(pattern || '').trim();
  if (!p) return false;
  const re = new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return re.test(String(branch || ''));
}

/** Ánh xạ có hiệu lực của một dịch vụ ở một môi trường: riêng của dịch vụ trước, rồi mặc định của nhóm dự án, rồi "chưa đặt". */
function resolve(branches, serviceId, project, envId) {
  const own = branches.services[serviceId] && branches.services[serviceId][envId];
  if (own) return { mode: own.mode, value: own.value, inherited: false };
  const group = branches.defaults[project] && branches.defaults[project][envId];
  return group ? { mode: group.mode, value: group.value, inherited: true } : NONE;
}

/**
 * Bảng dịch vụ x môi trường. services: [{id, project}]; envIds theo thứ tự hiển thị.
 * Mỗi dòng kèm cảnh báo: môi trường chưa đặt ánh xạ, và một nhánh trỏ tới nhiều môi trường.
 */
function matrix(branches, services, envIds) {
  return services.map((s) => {
    const cells = Object.fromEntries(envIds.map((e) => [e, resolve(branches, s.id, s.project, e)]));
    const missing = envIds.filter((e) => cells[e].mode === 'none' || !cells[e].value);
    const byBranch = {};
    for (const e of envIds) if (cells[e].mode !== 'none' && cells[e].mode !== 'manual' && cells[e].value) (byBranch[cells[e].value] = byBranch[cells[e].value] || []).push(e);
    const shared = Object.entries(byBranch).filter(([, list]) => list.length > 1).map(([branch, list]) => ({ branch, environments: list }));
    return { serviceId: s.id, project: s.project, cells, missing, shared };
  });
}

/**
 * Thử một tên nhánh: quy tắc nào khớp (theo thứ tự khai), và với một dịch vụ thì môi trường nào đang lấy nhánh đó làm nguồn.
 * Trả { rules: [{id, pattern, environmentId}], environments: [envId] }.
 */
function test(branches, branch, service, envIds) {
  const rules = branches.rules.filter((r) => globMatch(r.pattern, branch));
  const environments = service ? envIds.filter((e) => { const m = resolve(branches, service.id, service.project, e); return m.mode !== 'none' && globMatch(m.value, branch); }) : [];
  return { rules, environments };
}

module.exports = { globMatch, resolve, matrix, test };
