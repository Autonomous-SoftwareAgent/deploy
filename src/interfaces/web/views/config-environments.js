// Cấu hình > Môi trường: màu, mô tả, thứ tự và mức bảo vệ của từng môi trường. Môi trường là một máy chạy hệ nên không tạo
// hay xóa được từ trang này (thêm bằng tờ khai đích trên máy chạy bảng điều khiển); ở đây chỉ đặt cách hiện và mức bảo vệ.
import { h } from '../dom.js';
import { C } from '../text-config.js';
import { machinesPanel } from './config-machines.js';

const E = C.env;

function toggle(label, checked, locked, onchange, extra) {
  return h('div', { class: 'stack', css: { gap: '6px' } },
    h('label', { class: 'row', css: { gap: '8px' } }, h('input', { type: 'checkbox', checked, disabled: locked, onchange: (e) => onchange(e.target.checked) }), h('span', null, label)), checked ? extra : null);
}

export function environmentsTab({ cfg, envs, actions, locked }) {
  const machines = machinesPanel({ cfg, actions, locked });
  const draft = cfg.draft.environments;
  const ordered = [...envs].sort((a, b) => draft[a.id].order - draft[b.id].order || a.id.localeCompare(b.id));
  /** Đổi chỗ hai môi trường liền nhau rồi đánh số lại, để thứ tự luôn là 0, 1, 2... */
  const move = (i, by) => actions.edit((d) => { const ids = ordered.map((e) => e.id); [ids[i], ids[i + by]] = [ids[i + by], ids[i]]; ids.forEach((id, n) => { d.environments[id].order = n; }); });
  return h('div', { class: 'stack' },
    h('div', { class: 'mut' }, E.lead),
    ordered.map((e, i) => {
      const s = draft[e.id]; const p = s.protect;
      const set = (fn) => actions.edit((d) => fn(d.environments[e.id]));
      const badges = [p.approval && E.badge.approval, p.typeName && E.badge.typeName, p.restrict && E.badge.restrict, p.freeze.on && E.badge.freeze(p.freeze.from, p.freeze.to)].filter(Boolean);
      return h('div', { class: 'panel', css: { padding: '14px', display: 'flex', 'flex-direction': 'column', gap: '12px', 'border-left': `4px solid ${s.color || e.color}` } },
        h('div', { class: 'row', css: { 'justify-content': 'space-between' } },
          h('div', { class: 'row' }, h('b', { class: 'mono' }, e.name), h('span', { class: 'chip' }, E.kind[e.kind] || e.kind), badges.map((b) => h('span', { class: 'chip warn' }, b))),
          h('div', { class: 'row', css: { gap: '6px' } }, h('button', { class: 'btn sm', disabled: locked || i === 0, 'aria-label': `${E.up}: ${e.name}`, onclick: () => move(i, -1) }, '↑'),
            h('button', { class: 'btn sm', disabled: locked || i === ordered.length - 1, 'aria-label': `${E.down}: ${e.name}`, onclick: () => move(i, 1) }, '↓'))),
        h('div', { class: 'row', css: { 'align-items': 'flex-end' } },
          h('label', { class: 'fld', css: { width: '90px' } }, h('span', null, E.color), h('input', { type: 'color', class: 'inp', disabled: locked, value: s.color || e.color, onchange: (ev) => set((x) => { x.color = ev.target.value.toUpperCase(); }) })),
          h('label', { class: 'fld', css: { flex: '1 1 320px' } }, h('span', null, E.description), h('input', { class: 'inp', disabled: locked, placeholder: e.description, value: s.description || '', onchange: (ev) => set((x) => { x.description = ev.target.value.trim() || null; }) }))),
        h('div', null, h('div', { class: 'lab' }, E.protection),
          h('div', { class: 'stack', css: { gap: '10px' } },
            toggle(E.approval, p.approval, locked, (v) => set((x) => { x.protect.approval = v; })),
            toggle(E.typeName, p.typeName, locked, (v) => set((x) => { x.protect.typeName = v; })),
            toggle(E.restrict, p.restrict, locked, (v) => set((x) => { x.protect.restrict = v; }),
              h('label', { class: 'fld' }, h('span', null, E.allowed), h('input', { class: 'inp mono', disabled: locked, value: p.allowedUsers.join(', '), onchange: (ev) => set((x) => { x.protect.allowedUsers = ev.target.value.split(',').map((u) => u.trim()).filter(Boolean); }) }))),
            toggle(E.freeze, p.freeze.on, locked, (v) => set((x) => { x.protect.freeze.on = v; }),
              h('div', { class: 'row' },
                h('label', { class: 'fld', css: { width: '160px' } }, h('span', null, E.from), h('input', { class: 'inp mono', disabled: locked, placeholder: E.momentHint, value: p.freeze.from, onchange: (ev) => set((x) => { x.protect.freeze.from = ev.target.value.trim(); }) })),
                h('label', { class: 'fld', css: { width: '160px' } }, h('span', null, E.to), h('input', { class: 'inp mono', disabled: locked, placeholder: E.momentHint, value: p.freeze.to, onchange: (ev) => set((x) => { x.protect.freeze.to = ev.target.value.trim(); }) })))))));
    }),
    machines);
}
