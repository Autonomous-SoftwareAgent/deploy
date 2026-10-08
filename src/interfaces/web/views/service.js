// Màn 2: Chi tiết một dịch vụ. Mọi danh sách ở đây chỉ chứa dữ liệu của đúng dịch vụ đó.
import { h, short, ago, HEALTH_LABEL, BUILD_LABEL } from '../dom.js';

const TABS = [['deployments', 'Deployments'], ['commits', 'Commits'], ['logs', 'Logs'], ['vars', 'Biến môi trường'], ['settings', 'Cài đặt']];
const KIND = { deploy: ['Deploy', 'run'], rollback: ['Rollback', 'rbk'], 'auto-revert': ['Tự bật lại bản cũ', 'warn'], up: ['Bật cả hệ', ''] };

const noSource = (what) => h('div', { class: 'nosrc' }, h('b', null, 'Chưa có nguồn dữ liệu. '), what);

function envCard(c, id, actions) {
  const e = c.environment;
  const head = h('div', { class: 'row', css: { 'justify-content': 'space-between' } }, h('b', null, e.name),
    c.deployed ? h('span', { class: 'row', css: { gap: '6px' } }, h('span', { class: `sdot ${c.health || ''}` }), h('span', { class: `stx ${c.health || ''}` }, HEALTH_LABEL[c.health] || '—')) : null);
  const body = c.unreachable ? [h('div', { class: 'callout bad' }, `Không hỏi được môi trường này: ${c.error || ''}`)]
    : !c.deployed ? [h('div', { class: 'mut' }, c.absent ? 'Môi trường này không có dịch vụ này.' : 'Chưa có bản deploy ở môi trường này.')]
      : [h('div', { class: 'l1' }, h('span', { class: 'mono hash' }, short(c.commit.sha)), h('span', { class: 'msg', title: c.commit.message || '' }, c.commit.message || 'không thấy commit này trong lịch sử ở máy này')),
        h('div', { class: 'xs mut' }, `${c.commit.author || 'không rõ người viết'} · đưa lên ${ago(c.deployedAt)} · bản đã khai: ${c.head ? c.head.shortSha.slice(0, 7) : 'chưa khai'}`),
        c.behindCount > 0 ? h('span', null, h('span', { class: 'chip warn' }, `còn ${c.behindCount} commit chưa deploy`)) : c.differsFromDeclared ? h('span', null, h('span', { class: 'chip warn' }, 'khác bản đã khai')) : null,
        h('div', { class: 'xs mut' }, 'Biểu đồ lỗi và độ trễ: chưa có hệ giám sát nào làm nguồn.')];
  return h('div', { class: 'ecard', css: { 'border-top': `3px solid ${e.color}` } }, head, body,
    h('div', { class: 'row' }, h('button', { class: 'btn sm pri', disabled: !!c.unreachable || !!c.absent, onclick: () => actions.openDialog('deploy', [id], { environmentId: e.id }) }, 'Deploy'),
      h('button', { class: 'btn sm', disabled: !c.deployed, onclick: () => actions.openDialog('rollback', [id], { environmentId: e.id }) }, 'Rollback')));
}

function deployments(d) {
  if (!d.deployments.length) return h('div', { class: 'empty' }, 'Sổ deploy của các môi trường chưa ghi lần đưa lên nào của dịch vụ này.');
  const color = Object.fromEntries(d.environments.map((c) => [c.environment.id, c.environment.color]));
  return h('div', { class: 'panel', css: { overflow: 'hidden' } }, d.deployments.map((x) => {
    const [label, cls] = KIND[x.kind] || [x.kind, ''];
    return h('div', { class: 'tlrow' }, h('span', { class: 'dot', css: { background: color[x.environmentId] || '#888' } }), h('b', null, x.environmentName), h('span', { class: `chip ${cls}` }, label),
      h('span', { class: 'mono hash' }, short(x.commit.sha)), h('span', { css: { flex: '1 1 200px', 'min-width': '0' } }, x.commit.message || ''),
      h('span', { class: 'xs mut' }, `${x.by || 'không rõ'} · ${ago(x.at)}`), h('span', { class: `stx ${x.result === 'ok' ? 'healthy' : 'failed'}` }, x.result === 'ok' ? 'thành công' : 'hỏng'),
      x.reason ? h('div', { class: 'xs', css: { 'flex-basis': '100%', color: 'var(--bad)' } }, x.reason) : null);
  }));
}

function commits(d, id, actions) {
  if (!d.commits.length) return noSource('Máy chạy bảng điều khiển không có repo của dịch vụ này, nên không có danh sách commit.');
  const env = Object.fromEntries(d.environments.map((c) => [c.environment.id, c.environment]));
  return h('div', null, d.service.registryReachable ? null : h('div', { class: 'banner warn' }, 'Không hỏi được kho bản đóng gói: cột "đã có bản" chưa biết.'),
    h('div', { class: 'panel', css: { overflow: 'hidden' } }, d.commits.map((c) => h('div', { class: 'crow' },
      h('span', { class: 'mono hash', css: { 'font-size': '13px' } }, short(c.sha)),
      h('div', { css: { flex: '1 1 220px', 'min-width': '0' } }, h('div', { css: { 'font-weight': '500' } }, c.message), h('div', { class: 'xs mut' }, `${c.author} · ${ago(c.committedAt)}`)),
      h('span', { class: `stx ${c.build}` }, BUILD_LABEL[c.build] || c.build),
      c.declared ? h('span', { class: 'chip ov' }, 'bản đã khai') : null,
      c.runningIn.map((eid) => h('span', { class: 'chip', css: { background: env[eid] ? env[eid].color : '#888', color: '#fff' } }, `đang chạy · ${env[eid] ? env[eid].name : eid}`)),
      h('div', { class: 'row', css: { gap: '6px' } },
        h('button', { class: 'btn sm pri', disabled: c.build === 'none', title: c.build === 'none' ? 'Commit này chưa có bản đóng gói' : '', onclick: () => actions.openDialog('deploy', [id], { targetSha: c.sha }) }, 'Deploy commit này'),
        h('button', { class: 'btn sm', onclick: () => actions.openDialog('rollback', [id], { targetSha: c.sha }) }, 'Rollback về đây'))))));
}

function settings(d) {
  const row = (k, v) => h('div', { class: 'kv', css: { 'grid-template-columns': '200px 1fr' } }, h('span', null, k), h('span', { class: 'mono' }, v));
  return h('div', { class: 'stack' },
    h('div', { class: 'panel' }, h('div', { class: 'dh' }, h('b', null, 'Bản đã khai')), row('Commit trong tờ khai báo', d.service.declared ? `${short(d.service.declared.sha)} · ${d.service.declared.message || ''}` : 'chưa khai'),
      row('Ý nghĩa', 'Commit được phép đóng gói (CI). Mỗi môi trường tự ghi bản nó đang chạy trong sổ deploy.')),
    h('div', { class: 'panel' }, h('div', { class: 'dh' }, h('b', null, 'Kiểm sức khỏe')), row('Đường dẫn', `GET ${d.service.healthCheck.path}`), row('Bản không khỏe', 'Luôn tự bật lại bản đang chạy trước đó; không tắt được.')),
    h('div', { class: 'panel' }, h('div', { class: 'dh' }, h('b', null, 'Repo')), row('Đường dẫn trên máy chạy bảng điều khiển', d.service.repo || '—')),
    noSource('Ánh xạ nhánh, quy tắc nhánh và dịch vụ phụ thuộc thuộc đợt cấu hình, chưa làm.'));
}

export function serviceView(state, actions) {
  const d = state.service;
  const id = state.serviceId;
  const crumb = h('div', { class: 'crumb' }, h('button', { class: 'lnk', onclick: actions.goOverview }, 'Tổng quan'), h('span', null, '/'), h('span', null, d ? d.service.project : ''));
  if (!d) return h('div', null, crumb, h('div', { class: 'empty' }, state.error || 'Đang đọc…'));
  const tab = state.serviceTab;
  const body = tab === 'deployments' ? deployments(d) : tab === 'commits' ? commits(d, id, actions) : tab === 'settings' ? settings(d)
    : tab === 'logs' ? noSource('Log runtime của dịch vụ chưa được thu về đâu. Log của từng lần đưa lên có ở màn Tiến trình deploy.')
      : noSource('Biến môi trường và bí mật hiện nằm trong tờ khai báo và trên từng máy đích; bảng điều khiển chưa đọc hay sửa chúng.');
  return h('div', null, crumb,
    h('div', { class: 'ph' }, h('div', null, h('h1', { class: 'h1 mono', css: { 'font-size': '22px' } }, d.service.name), h('div', { class: 'mut xs mono' }, d.service.repo || '')),
      h('div', { class: 'row' }, h('button', { class: 'btn rb', onclick: () => actions.openDialog('rollback', [id]) }, 'Rollback…'), h('button', { class: 'btn pri', onclick: () => actions.openDialog('deploy', [id]) }, 'Deploy…'))),
    state.error ? h('div', { class: 'banner bad' }, state.error) : null,
    h('div', { class: 'envcards' }, d.environments.map((c) => envCard(c, id, actions))),
    h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([key, label]) => h('button', { class: `tabb ${key === tab ? 'on' : ''}`, role: 'tab', 'aria-selected': String(key === tab), onclick: () => actions.setServiceTab(key) }, label))),
    body);
}
