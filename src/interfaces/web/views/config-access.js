// Cấu hình > Phân quyền: bảng vai trò x môi trường (thuộc bản nháp cấu hình) và danh sách người dùng (đổi là có hiệu lực ngay).
import { h, ago } from '../dom.js';
import { C } from '../text-config.js';

const A = C.access;

function users(cfg, actions) {
  if (!cfg.users) return h('div', { class: 'empty' }, A.adminOnly);
  const name = h('input', { class: 'inp mono', id: 'new-user', placeholder: 'lan.pham', autocomplete: 'off' });
  const role = h('select', { class: 'inp' }, cfg.roles.map((r) => h('option', { value: r }, r)));
  const shown = cfg.shownPassword;
  return h('div', { class: 'panel' },
    h('div', { class: 'dh' }, h('b', null, A.users), h('span', { class: 'xs mut' }, A.usersLead)),
    shown ? h('div', { class: 'crow' }, h('div', { class: 'callout warn', css: { flex: '1 1 auto' } }, h('b', null, A.newPassword(shown.name)), h('span', { class: 'mono', css: { 'user-select': 'all' } }, shown.password)),
      h('button', { class: 'btn sm', onclick: actions.hidePassword }, A.dismiss)) : null,
    cfg.users.length ? cfg.users.map((u) => h('div', { class: 'crow' },
      h('div', { css: { flex: '1 1 200px' } }, h('b', { class: 'mono' }, u.name), h('div', { class: 'xs mut' }, ago(u.createdAt))),
      h('select', { class: 'inp', css: { width: '160px' }, 'aria-label': `${A.role}: ${u.name}`, onchange: (e) => actions.setRole(u.name, e.target.value) }, cfg.roles.map((r) => h('option', { value: r, selected: r === u.role }, r))),
      h('button', { class: 'btn sm', onclick: () => actions.resetPassword(u.name) }, A.resetPassword),
      h('button', { class: 'btn sm dng', onclick: () => actions.removeUser(u.name) }, A.remove))) : h('div', { class: 'empty' }, A.none),
    h('form', { class: 'crow', onsubmit: (e) => { e.preventDefault(); actions.addUser(name.value.trim(), role.value); } },
      h('label', { class: 'fld', for: 'new-user', css: { flex: '1 1 200px' } }, h('span', null, A.name), name), h('label', { class: 'fld', css: { width: '160px' } }, h('span', null, A.role), role),
      h('button', { class: 'btn sm pri', type: 'submit' }, A.add)));
}

export function accessTab({ cfg, envs, actions, locked }) {
  const perms = cfg.draft.permissions;
  const cols = `160px repeat(${envs.length}, minmax(190px, 1fr))`;
  const grid = { 'grid-template-columns': cols, 'min-width': `${160 + envs.length * 190}px` };
  return h('div', { class: 'stack' },
    h('div', { class: 'mut' }, A.lead),
    h('div', { class: 'panel', css: { 'overflow-x': 'auto' } },
      h('div', { class: 'trow thead', css: grid }, h('div', { class: 'c' }, A.role), envs.map((e) => h('div', { class: 'c' }, h('span', { class: 'dot', css: { background: e.color } }), e.name))),
      cfg.loaded.roles.map((role) => h('div', { class: 'trow', css: grid }, h('div', { class: 'c' }, h('b', null, role)),
        envs.map((e) => h('div', { class: 'c' }, h('select', { class: 'inp xs', 'aria-label': A.levelOf(role, e.name), disabled: locked, onchange: (ev) => actions.edit((d) => { d.permissions[e.id][role] = Number(ev.target.value); }) },
          A.level.map((label, n) => h('option', { value: n, selected: perms[e.id][role] === n }, label)))))))),
    users(cfg, actions));
}
