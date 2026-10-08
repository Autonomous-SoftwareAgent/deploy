// Màn 3: Hộp thoại Deploy / Rollback. Mọi điều kiện chặn do máy chủ tính (kiểm tra trước); hộp thoại chỉ hiện lại và
// không tự quyết gì. Bấm xác nhận thì máy chủ kiểm tra lại lần nữa trước khi chạy.
import { h, short, BUILD_LABEL } from '../dom.js';

function targetCard(item, d, actions, multi) {
  const commits = d.commits[item.serviceId] || [];
  const known = new Set(commits.map((c) => c.sha));
  const options = [...(item.to && !known.has(item.to.sha) ? [{ sha: item.to.sha, message: item.to.message || '', build: item.to.build, runningIn: [] }] : []), ...commits];
  const blocked = item.blockers.length > 0;
  return h('div', { class: 'tcard' },
    h('div', { class: 'row', css: { 'justify-content': 'space-between' } }, h('b', { class: 'mono' }, item.serviceId),
      h('span', { class: `chip ${blocked ? 'bad' : item.warnings.length ? 'warn' : 'ok'}` }, blocked ? 'bị chặn' : item.warnings.length ? 'có cảnh báo' : 'sẵn sàng')),
    h('div', { class: 'ft' },
      h('div', { class: 'ftbox' }, h('span', { class: 'xs mut' }, `Đang chạy ở ${d.pre.environment.name}`), h('span', null, h('span', { class: 'mono hash' }, item.from ? short(item.from.sha) : '—'), ' ', h('span', { class: 'xs' }, item.from ? item.from.message || '' : 'chưa deploy'))),
      h('span', { css: { 'font-size': '20px' } }, '→'),
      h('div', { class: 'ftbox', css: { 'border-color': blocked ? '#E3B4B0' : '#E6E9EE' } }, h('span', { class: 'xs mut' }, 'Commit đích'),
        h('select', { class: 'sel mono', 'aria-label': `Commit đích của ${item.serviceId}`, onchange: (e) => actions.dialogTarget(item.serviceId, e.target.value) },
          options.length ? null : h('option', { value: '' }, 'chưa có commit nào để chọn'),
          options.map((c) => h('option', { value: c.sha, selected: !!item.to && c.sha === item.to.sha }, `${short(c.sha)} · ${(c.message || '').slice(0, 70)} (${BUILD_LABEL[c.build] || c.build}${c.runningIn && c.runningIn.includes(d.environmentId) ? ' · đang chạy' : ''})`))))),
    item.suggestions.length ? h('div', { class: 'row' }, h('span', { class: 'xs mut' }, 'Gợi ý:'), item.suggestions.map((s) => h('button', { class: 'btn sm', onclick: () => actions.dialogTarget(item.serviceId, s.sha) }, `${s.label} (${short(s.sha)})`))) : null,
    item.blockers.map((b) => h('div', { class: 'callout bad' }, h('b', null, b.message), h('span', { class: 'xs mono' }, b.code))),
    item.warnings.map((w) => h('div', { class: 'callout warn' }, h('b', null, w.message), h('span', { class: 'xs mono' }, w.code))),
    item.changes.length ? h('details', { class: 'chg', open: !multi },
      h('summary', null, item.direction === 'backward' ? `${item.changes.length} commit sẽ bị gỡ` : `${item.changes.length} commit sẽ được đưa lên`),
      h('div', { class: 'chgl' }, item.changes.map((c) => h('div', null, h('span', { class: `chip ${c.direction === 'backward' ? 'rbk' : 'run'}` }, c.direction === 'backward' ? 'gỡ' : 'lên'), h('span', { class: 'mono hash' }, short(c.sha)), h('span', null, c.message || ''))))) : null,
    item.firstDeploy && !blocked ? h('div', { class: 'callout info' }, 'Lần đầu đưa dịch vụ này lên môi trường này.') : null);
}

export function dialogView(state, actions) {
  const d = state.dialog;
  if (!d) return null;
  const rb = d.kind === 'rollback';
  const kind = rb ? 'Rollback' : 'Deploy';
  const envs = (state.overview && state.overview.allEnvironments) || [];
  const env = envs.find((e) => e.id === d.environmentId) || { name: d.environmentId, description: '' };
  const multi = d.items.length > 1;
  const what = multi ? `${d.items.length} service` : d.items[0].serviceId;
  const can = !!d.pre && d.pre.canProceed && !d.loading && !d.sending;
  const label = d.loading ? 'Đang kiểm tra…' : d.sending ? 'Đang gửi…' : d.pre && !d.pre.canProceed ? 'Không thể tiếp tục' : `${kind} ${what} ${rb ? 'về bản đã chọn ở' : 'lên'} ${env.name}`;
  return h('div', { class: 'ovl' }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${kind} ${what}` },
    h('div', { class: `mh ${rb ? 'rollback' : 'deploy'}` },
      h('div', null, h('div', { class: 'mkind' }, kind), h('h2', { class: 'h2' }, `${kind} ${what} ${rb ? 'ở' : 'lên'} ${env.name}`),
        h('div', { class: 'mut xs' }, multi ? 'Mỗi service giữ commit đích riêng. Rà soát từng mục trước khi xác nhận.' : 'Kiểm tra từ bản nào sang bản nào trước khi xác nhận.')),
      h('button', { class: 'ib', 'aria-label': 'Đóng hộp thoại', onclick: actions.closeDialog }, '×')),
    h('div', { class: 'mb' },
      h('div', null, h('div', { class: 'lab' }, 'Môi trường đích'),
        h('div', { class: 'seg' }, envs.map((e) => h('button', { class: `segb ${e.id === d.environmentId ? 'on' : ''}`, onclick: () => actions.dialogEnvironment(e.id) }, h('span', { class: 'dot', css: { background: e.color } }), e.name))),
        h('div', { class: 'mut xs', css: { 'margin-top': '6px' } }, env.description || '')),
      d.error ? h('div', { class: 'callout bad' }, h('b', null, d.error)) : null,
      d.pre ? d.pre.items.map((item) => targetCard(item, d, actions, multi)) : h('div', { class: 'empty' }, d.loading ? 'Đang kiểm tra với máy chủ…' : 'Chưa có kết quả kiểm tra.'),
      h('div', { class: 'callout info' }, rb ? 'Rollback chỉ lùi về bản đã từng chạy khỏe ở chính môi trường này, và chỉ đổi bản chương trình: dữ liệu không lùi theo.' : 'Chỉ commit đã có bản đóng gói mới đưa lên được. Bản mới không khỏe thì bản đang chạy trước đó tự được bật lại.')),
    h('div', { class: 'mf' },
      h('span', { class: 'xs mut' }, 'Tự bật lại bản cũ khi không khỏe: luôn bật. Lần chạy đã bắt đầu thì không hủy được.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: actions.closeDialog }, 'Hủy'),
        h('button', { class: `btn ${rb ? 'rb' : 'pri'}`, disabled: !can, onclick: actions.confirmDialog }, label)))));
}
