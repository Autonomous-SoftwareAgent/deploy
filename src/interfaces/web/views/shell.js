// Thanh bên và màn đăng nhập. Mục "Cấu hình" của bản design chưa có ở đây vì phần cấu hình chưa làm: không đặt nút giả.
import { h } from '../dom.js';

export function sideView(state, actions) {
  if (state.view === 'login' || state.view === 'loading') return [h('div', { class: 'brand' }, h('span', { class: 'mark' }), 'Deploy Console')];
  const live = state.activeRuns || [];
  return [
    h('div', { class: 'brand' }, h('span', { class: 'mark' }), 'Deploy Console'),
    h('nav', { class: 'navs', 'aria-label': 'Điều hướng chính' },
      h('button', { class: `nav ${state.view === 'overview' || state.view === 'service' ? 'on' : ''}`, onclick: actions.goOverview }, 'Tổng quan hệ thống'),
      state.run && state.view !== 'run' && !live.some((r) => r.id === state.run.id) ? h('button', { class: 'nav', onclick: () => actions.openRun(state.run.id, state.run.data) }, 'Lần chạy vừa xem') : null,
      live.length ? h('div', { class: 'navh' }, 'Đang chạy') : null,
      live.map((r) => h('button', { class: `nav ${state.view === 'run' && state.run && state.run.id === r.id ? 'on' : ''}`, onclick: () => actions.openRun(r.id, r) }, h('span', { class: 'pulse' }),
        `${r.kind === 'rollback' ? 'Rollback' : 'Deploy'} ${r.items.length === 1 ? r.items[0].serviceId : `${r.items.length} service`} · ${r.environment.name}`))),
    h('div', { class: 'me' },
      h('span', null, state.overview && state.overview.actor ? `Đang dùng: ${state.overview.actor}` : ''),
      h('button', { class: 'nav', onclick: actions.logout }, 'Đăng xuất')),
  ];
}

export function loginView(state, actions) {
  const pw = h('input', { class: 'inp', type: 'password', id: 'pw', autocomplete: 'current-password', autofocus: true });
  return h('form', { class: 'panel loginbox', onsubmit: (e) => { e.preventDefault(); actions.login(pw.value); } },
    h('h1', { class: 'h2' }, 'Đăng nhập bảng điều khiển'),
    h('label', { class: 'fld', for: 'pw' }, h('span', null, 'Mật khẩu quản trị'), pw),
    state.loginError ? h('div', { class: 'callout bad' }, state.loginError) : null,
    h('button', { class: 'btn pri', type: 'submit' }, 'Đăng nhập'),
    h('div', { class: 'xs mut' }, 'Mật khẩu được sinh lần đầu mở bảng điều khiển, ghi ở tệp console.first-login.txt trên máy này.'));
}
