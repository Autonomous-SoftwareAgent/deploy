// Màn Approvals: các yêu cầu deploy hay rollback đang chờ người thứ hai duyệt, và các yêu cầu đã xử lý từ lúc bảng điều khiển khởi động.
// Ai được duyệt do máy chủ quyết; nút ở đây chỉ gửi yêu cầu, máy chủ từ chối thì trang hiện lý do.
import { h, short, ago } from '../dom.js';
import { T } from '../text.js';
import { C } from '../text-config.js';

const A = C.approval;
const CHIP = { pending: 'warn', approved: 'ok', rejected: 'bad', expired: '' };

export function approvalsView(state, actions) {
  const list = state.approvals || [];
  const me = state.me ? state.me.name : null;
  return h('div', null,
    h('div', { class: 'ph' }, h('div', null, h('h1', { class: 'h1' }, A.title), h('div', { class: 'mut' }, A.lead))),
    state.cfg.error ? h('div', { class: 'banner bad' }, state.cfg.error) : null,
    list.length ? h('div', { class: 'stack' }, list.map((a) => h('div', { class: 'panel', css: { padding: '14px', display: 'flex', 'flex-direction': 'column', gap: '10px' } },
      h('div', { class: 'row', css: { 'justify-content': 'space-between' } },
        h('div', { class: 'row' }, h('span', { class: `chip ${a.kind === 'rollback' ? 'rbk' : 'run'}` }, T.kind[a.kind]), h('b', null, a.environment.name), h('span', { class: 'xs mut' }, A.by(a.requestedBy, ago(a.requestedAt)))),
        h('div', { class: 'row' }, h('span', { class: `chip ${CHIP[a.status] || ''}` }, A.status[a.status] || a.status), a.decidedBy ? h('span', { class: 'xs mut' }, A.decided(a.decidedBy)) : null)),
      a.items.map((i) => h('div', { class: 'row' }, h('b', { class: 'mono' }, i.serviceId), h('span', { class: 'mono hash' }, short(i.fromSha)), h('span', null, '→'), h('span', { class: 'mono hash' }, short(i.targetSha)), h('span', { class: 'xs' }, i.message || ''))),
      a.status === 'pending' ? h('div', { class: 'row' },
        h('button', { class: 'btn sm pri', disabled: a.requestedBy === me, onclick: () => actions.decide(a.id, true, actions.openRun) }, A.approve),
        h('button', { class: 'btn sm dng', disabled: a.requestedBy === me, onclick: () => actions.decide(a.id, false, actions.openRun) }, A.reject))
        : a.runId ? h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => actions.openRun(a.runId) }, A.openRun)) : null)))
      : h('div', { class: 'empty' }, A.empty));
}
