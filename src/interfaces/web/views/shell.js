// Thanh bên và màn đăng nhập. Mục cấu hình chỉ hiện khi máy chủ có phần đó: không đặt nút giả.
import { h } from '../dom.js';
import { T } from '../text.js';

const brand = () => h('div', { class: 'brand' }, h('span', { class: 'mark' }), T.brand);

export function sideView(state, actions) {
  if (state.view === 'login' || state.view === 'loading') return [brand()];
  const live = state.activeRuns || [];
  return [
    brand(),
    h('nav', { class: 'navs', 'aria-label': T.nav.label },
      h('button', { class: `nav ${state.view === 'overview' || state.view === 'service' ? 'on' : ''}`, onclick: actions.goOverview }, T.nav.overview),
      state.run && state.view !== 'run' && !live.some((r) => r.id === state.run.id) ? h('button', { class: 'nav', onclick: () => actions.openRun(state.run.id, state.run.data) }, T.nav.lastRun) : null,
      live.length ? h('div', { class: 'navh' }, T.nav.running) : null,
      live.map((r) => h('button', { class: `nav ${state.view === 'run' && state.run && state.run.id === r.id ? 'on' : ''}`, onclick: () => actions.openRun(r.id, r) }, h('span', { class: 'pulse' }), T.nav.run(r)))),
    h('div', { class: 'me' },
      h('span', null, state.overview && state.overview.actor ? T.nav.signedIn(state.overview.actor) : ''),
      h('button', { class: 'nav', onclick: actions.logout }, T.nav.signOut)),
  ];
}

export function loginView(state, actions) {
  const pw = h('input', { class: 'inp', type: 'password', id: 'pw', autocomplete: 'current-password', autofocus: true });
  return h('form', { class: 'panel loginbox', onsubmit: (e) => { e.preventDefault(); actions.login(pw.value); } },
    h('h1', { class: 'h2' }, T.login.title),
    h('label', { class: 'fld', for: 'pw' }, h('span', null, T.login.password), pw),
    state.loginError ? h('div', { class: 'callout bad' }, state.loginError) : null,
    h('button', { class: 'btn pri', type: 'submit' }, T.login.submit),
    h('div', { class: 'xs mut' }, T.login.hint));
}
