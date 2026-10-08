// Thanh bên, và màn báo chưa đăng nhập. Mục cấu hình chỉ hiện khi máy chủ có phần đó: không đặt nút giả.
import { h } from '../dom.js';
import { T } from '../text.js';
import { C } from '../text-config.js';
import { isDirty } from '../config-store.js';

const brand = () => h('div', { class: 'brand' }, h('span', { class: 'mark' }), T.brand);

export function sideView(state, actions) {
  if (state.view === 'denied' || state.view === 'loading') return [brand()];
  const live = state.activeRuns || [];
  const pending = (state.approvals || []).filter((a) => a.status === 'pending').length;
  const who = state.me || (state.overview && state.overview.actor ? { name: state.overview.actor, role: state.overview.role } : null);
  return [
    brand(),
    h('nav', { class: 'navs', 'aria-label': T.nav.label },
      h('button', { class: `nav ${state.view === 'overview' || state.view === 'service' ? 'on' : ''}`, onclick: actions.goOverview }, T.nav.overview),
      state.run && state.view !== 'run' && !live.some((r) => r.id === state.run.id) ? h('button', { class: 'nav', onclick: () => actions.openRun(state.run.id, state.run.data) }, T.nav.lastRun) : null,
      live.length ? h('div', { class: 'navh' }, T.nav.running) : null,
      live.map((r) => h('button', { class: `nav ${state.view === 'run' && state.run && state.run.id === r.id ? 'on' : ''}`, onclick: () => actions.openRun(r.id, r) }, h('span', { class: 'pulse' }), T.nav.run(r))),
      h('button', { class: `nav ${state.view === 'approvals' ? 'on' : ''}`, onclick: actions.openApprovals }, C.approvals, pending ? h('span', { class: 'chip warn', css: { 'margin-left': '8px' } }, pending) : null),
      h('div', { class: 'navh' }, T.nav.configuration, ' ', isDirty() ? h('span', { class: 'dirtydot', title: C.unsaved }) : null),
      C.nav.map(([tab, label]) => h('button', { class: `nav ${state.view === 'config' && state.cfg.tab === tab ? 'on' : ''}`, onclick: () => actions.openConfig(tab) }, label))),
    h('div', { class: 'me' }, h('span', null, who ? T.nav.signedIn(who.name, who.role) : ''), h('span', { class: 'xs' }, T.nav.signOutHint), h('span', { class: 'xs' }, state.live ? T.nav.live : T.nav.polling)),
  ];
}

/** Trình duyệt hỏi tên và mật khẩu bằng hộp thoại của nó; màn này chỉ hiện khi người dùng bấm hủy hộp thoại đó. */
export function deniedView() {
  return h('div', { class: 'panel loginbox' }, h('h1', { class: 'h2' }, T.login.title), h('div', { class: 'mut' }, T.login.denied), h('div', { class: 'xs mut' }, T.login.hint),
    h('button', { class: 'btn pri', onclick: () => window.location.reload() }, T.login.retry));
}
