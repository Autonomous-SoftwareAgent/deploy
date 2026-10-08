// Cấu hình > Ma trận nhánh và Quy tắc nhánh. Ánh xạ nhánh là khai báo ý định: nền không tự deploy khi có push (S-029),
// nên trang nói rõ điều đó thay vì giả làm công tắc tự chạy. Ô của ma trận tính ngay trên bản nháp để sửa là thấy.
import { h } from '../dom.js';
import { C } from '../text-config.js';

const M = C.matrix; const R = C.rules;
const MODES = ['manual', 'auto', 'pattern', 'none'];
const modeSelect = (value, label, locked, onchange) => h('select', { class: 'inp xs', 'aria-label': label, disabled: locked, onchange: (e) => onchange(e.target.value) }, MODES.map((m) => h('option', { value: m, selected: m === value }, M.mode[m])));
const dot = (e) => h('span', { class: 'dot', css: { background: e.color } });
/** Đặt một ô ánh xạ trong bản nháp; map là branches.services hoặc branches.defaults. */
const put = (map, owner, env, patch) => { map[owner] = map[owner] || {}; map[owner][env] = { mode: 'manual', value: '', ...(map[owner][env] || {}), ...patch }; };

export function matrixTab({ cfg, envs, actions, locked }) {
  if (!cfg.matrix) return h('div', { class: 'empty' }, C.reading);
  const b = cfg.draft.branches;
  const cols = `230px repeat(${envs.length}, minmax(200px, 1fr)) 220px`;
  const grid = { 'grid-template-columns': cols, 'min-width': `${230 + envs.length * 200 + 220}px` };
  const cellOf = (row, e) => {
    const own = b.services[row.serviceId] && b.services[row.serviceId][e.id];
    const group = b.defaults[row.project] && b.defaults[row.project][e.id];
    const eff = own || group || { mode: 'none', value: '' };
    const set = (patch) => actions.edit((d) => put(d.branches.services, row.serviceId, e.id, { ...eff, ...patch }));
    return h('div', { class: `c mxc ${own ? 'ovr' : group ? 'inh' : 'none'}` },
      modeSelect(eff.mode, M.modeOf(row.serviceId, e.name), locked, (v) => set({ mode: v })),
      eff.mode === 'none' ? null : h('input', { class: 'inp xs mono', 'aria-label': M.branchOf(row.serviceId, e.name), disabled: locked, placeholder: 'main', value: eff.value, onchange: (ev) => set({ value: ev.target.value.trim() }) }),
      h('div', { class: 'row', css: { gap: '6px', 'min-height': '20px' } },
        own ? [h('span', { class: 'chip ov' }, M.override), h('button', { class: 'lnk', disabled: locked, onclick: () => actions.edit((d) => { delete d.branches.services[row.serviceId][e.id]; if (!Object.keys(d.branches.services[row.serviceId]).length) delete d.branches.services[row.serviceId]; }) }, M.reset)]
          : group ? h('span', { class: 'xs mut' }, M.inherited) : null));
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'mut' }, M.lead), h('div', { class: 'callout info' }, M.notice),
    h('div', { class: 'panel', css: { 'overflow-x': 'auto' } },
      h('div', { class: 'trow thead', css: grid }, h('div', { class: 'c' }, M.service), envs.map((e) => h('div', { class: 'c' }, dot(e), e.name)), h('div', { class: 'c' }, M.warnings)),
      cfg.matrix.map((row) => h('div', { class: 'trow', css: grid },
        h('div', { class: 'c' }, h('div', { class: 'mono', css: { 'font-weight': '600', 'font-size': '13px' } }, row.serviceId), h('div', { class: 'xs mut' }, row.project)),
        envs.map((e) => cellOf(row, e)),
        h('div', { class: 'c', css: { display: 'flex', 'flex-direction': 'column', gap: '4px' } },
          row.missing.length ? h('span', { class: 'chip warn', css: { 'white-space': 'normal' } }, M.missing(row.missing)) : null,
          row.shared.map((s) => h('span', { class: 'chip warn', css: { 'white-space': 'normal' } }, M.shared(s.branch, s.environments))))))));
}

export function rulesTab({ cfg, envs, actions, locked }) {
  if (!cfg.matrix) return h('div', { class: 'empty' }, C.reading);
  const b = cfg.draft.branches;
  const projects = [...new Set(cfg.matrix.map((r) => r.project))];
  const cols = `200px repeat(${envs.length}, minmax(200px, 1fr))`;
  const grid = { 'grid-template-columns': cols, 'min-width': `${200 + envs.length * 200}px` };
  const hit = new Set(((cfg.tester && cfg.tester.rules) || []).map((r) => r.id));
  const branch = h('input', { class: 'inp mono', id: 'test-branch', placeholder: 'release/2.4', value: cfg.tester ? cfg.tester.branch : '' });
  const service = h('select', { class: 'inp' }, h('option', { value: '' }, R.anyService), cfg.matrix.map((r) => h('option', { value: r.serviceId }, r.serviceId)));
  return h('div', { class: 'stack' },
    h('div', { class: 'callout info' }, M.notice),
    h('div', { class: 'panel', css: { 'overflow-x': 'auto' } },
      h('div', { class: 'dh' }, h('b', null, R.defaults), h('span', { class: 'xs mut' }, R.defaultsLead)),
      h('div', { class: 'trow thead', css: grid }, h('div', { class: 'c' }, R.project), envs.map((e) => h('div', { class: 'c' }, dot(e), e.name))),
      projects.map((p) => h('div', { class: 'trow', css: grid }, h('div', { class: 'c' }, h('b', null, p)),
        envs.map((e) => {
          const cur = (b.defaults[p] && b.defaults[p][e.id]) || { mode: 'none', value: '' };
          const set = (patch) => actions.edit((d) => put(d.branches.defaults, p, e.id, { ...cur, ...patch }));
          return h('div', { class: 'c mxc' }, modeSelect(cur.mode, M.modeOf(p, e.name), locked, (v) => set({ mode: v })),
            cur.mode === 'none' ? null : h('input', { class: 'inp xs mono', 'aria-label': M.branchOf(p, e.name), disabled: locked, placeholder: 'main', value: cur.value, onchange: (ev) => set({ value: ev.target.value.trim() }) }));
        })))),
    h('div', { class: 'split' },
      h('div', { class: 'panel', css: { flex: '2 1 520px', 'min-width': '0' } },
        h('div', { class: 'dh' }, h('b', null, R.general), h('span', { class: 'xs mut' }, R.order)),
        b.rules.map((r, i) => h('div', { class: 'crow' },
          h('label', { class: 'fld', css: { flex: '1 1 150px' } }, h('span', null, R.pattern), h('input', { class: 'inp mono', disabled: locked, value: r.pattern, onchange: (ev) => actions.edit((d) => { d.branches.rules[i].pattern = ev.target.value.trim(); }) })),
          h('label', { class: 'fld', css: { flex: '1 1 180px' } }, h('span', null, R.target),
            h('select', { class: 'inp', disabled: locked, onchange: (ev) => actions.edit((d) => { d.branches.rules[i].environmentId = ev.target.value || null; }) },
              h('option', { value: '', selected: !r.environmentId }, R.noTarget), envs.map((e) => h('option', { value: e.id, selected: e.id === r.environmentId }, e.name)))),
          hit.has(r.id) ? h('span', { class: 'chip ok' }, R.matched) : null,
          h('button', { class: 'btn sm dng', disabled: locked, onclick: () => actions.edit((d) => { d.branches.rules.splice(i, 1); }) }, R.remove))),
        h('div', { class: 'crow' }, h('button', { class: 'btn sm', disabled: locked, onclick: () => actions.edit((d) => { d.branches.rules.push({ id: `r${Date.now().toString(36)}`, pattern: 'release/*', environmentId: null }); }) }, R.add))),
      h('form', { class: 'panel', css: { flex: '1 1 300px', padding: '14px', display: 'flex', 'flex-direction': 'column', gap: '10px' }, onsubmit: (ev) => { ev.preventDefault(); actions.testBranch(branch.value, service.value); } },
        h('div', { class: 'h3' }, R.tester),
        h('label', { class: 'fld', for: 'test-branch' }, h('span', null, R.branch), branch),
        h('label', { class: 'fld' }, h('span', null, R.service), service),
        h('button', { class: 'btn', type: 'submit' }, R.run),
        cfg.tester ? h('div', { class: `callout ${cfg.tester.rules.length ? 'info' : 'warn'}` }, h('b', null, cfg.tester.rules.length ? R.hit(cfg.tester.rules.length) : R.miss), h('span', null, R.envs(cfg.tester.environments))) : null)));
}
