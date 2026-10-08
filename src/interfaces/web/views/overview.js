// Màn 1: Tổng quan hệ thống. Cột sinh từ danh sách môi trường mà máy chủ trả về; không tên môi trường nào viết cứng ở đây.
import { h, short, ago } from '../dom.js';
import { T } from '../text.js';

const O = T.overview;

function select(label, value, options, onchange) {
  return h('label', { class: 'fld' }, h('span', null, label),
    h('select', { class: 'sel', onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
}

function cell(c) {
  if (c.unreachable) return h('div', { class: 'c cell' }, h('span', { class: 'chip bad', title: c.error || '' }, O.cell.unreachable));
  if (c.absent) return h('div', { class: 'c cell' }, h('span', { class: 'mut xs' }, O.cell.absent));
  if (!c.deployed) return h('div', { class: 'c cell' }, h('span', { class: 'mut xs' }, O.cell.none));
  const msg = c.commit.message || O.cell.unknownCommit;
  return h('div', { class: 'c cell' },
    h('div', { class: 'l1' }, h('span', { class: `sdot ${c.health || ''}` }), h('span', { class: 'mono hash' }, short(c.commit.sha)),
      h('span', { class: `stx ${c.health || ''}` }, T.health[c.health] || T.dash), h('span', { class: 'tm mut' }, ago(c.deployedAt))),
    h('div', { class: 'msg', title: msg }, msg),
    c.behindCount > 0 ? h('span', null, h('span', { class: 'chip warn' }, O.cell.behind(c.behindCount)))
      : c.differsFromDeclared ? h('span', null, h('span', { class: 'chip warn', title: O.cell.declared(c.head ? c.head.shortSha : '') }, O.cell.differs)) : null);
}

export function overviewView(state, actions) {
  const ov = state.overview;
  if (!ov) return h('div', { class: 'empty' }, state.error || O.reading);
  const F = state.filters;
  const envs = ov.environments;
  const cols = `36px 230px repeat(${envs.length}, minmax(210px, 1fr)) 112px`;
  const grid = { 'grid-template-columns': cols, 'min-width': `${36 + 230 + envs.length * 210 + 112}px` };
  const visible = ov.groups.flatMap((g) => g.services.map((s) => s.id));
  const allSelected = visible.length > 0 && visible.every((id) => state.selected[id]);
  const selected = actions.selectedIds();
  const sum = (key, label, n, cls, title) => h('button', { class: `sum ${n && cls ? cls : ''}${F.status === key ? ' on' : ''}`, title, onclick: () => actions.setFilter({ status: key }) }, h('b', { class: 'mono' }, n), h('span', null, label));

  const rows = [];
  for (const g of ov.groups) {
    const open = !state.collapsed[g.project.id];
    rows.push(h('div', { class: 'trow grp', css: grid }, h('div', { class: 'c', css: { 'grid-column': '1 / -1', 'padding-top': '2px', 'padding-bottom': '2px' } },
      h('button', { class: 'gbtn', 'aria-expanded': String(open), onclick: () => actions.toggleGroup(g.project.id) }, h('span', null, open ? '▾' : '▸'), g.project.name,
        h('span', { class: 'mut', css: { 'font-weight': '400' } }, O.group.services(g.services.length)), g.attentionCount ? h('span', { class: 'chip warn' }, O.group.attention(g.attentionCount)) : null))));
    if (!open) continue;
    for (const s of g.services) {
      const tags = [s.kind ? h('span', { class: 'chip' }, s.kind) : null, s.configWarnings.length ? h('span', { class: 'chip warn' }, O.notDeclared) : null].filter(Boolean);
      rows.push(h('div', { class: 'trow', css: grid },
        h('div', { class: 'c' }, h('input', { type: 'checkbox', 'aria-label': O.select(s.name), checked: !!state.selected[s.id], onchange: () => actions.toggleSelect(s.id) })),
        h('div', { class: 'c', css: { display: 'flex', 'flex-direction': 'column', gap: '3px' } },
          h('button', { class: 'svcn', onclick: () => actions.openService(s.id) }, s.name), tags.length ? h('div', { class: 'kinds' }, tags) : null),
        envs.map((e) => cell(s.cells[e.id])),
        h('div', { class: 'c' }, h('button', { class: 'btn sm', onclick: () => actions.openDialog('deploy', [s.id]) }, O.deploy))));
    }
  }

  return h('div', null,
    h('div', { class: 'ph' }, h('div', null, h('h1', { class: 'h1' }, O.title), h('div', { class: 'mut' }, O.lead(ov.summary.services, ov.projects.length, ov.allEnvironments.length)))),
    ov.memory ? h('div', { class: 'banner warn' }, O.memory) : null,
    state.error ? h('div', { class: 'banner bad' }, state.error) : null,
    ov.unreachable.map((u) => h('div', { class: 'banner bad' }, O.unreachable(u.name, u.error))),
    (ov.skippedTargets || []).map((t) => h('div', { class: 'banner warn' }, O.skippedTarget(t))),
    h('div', { class: 'sumrow' }, sum('all', O.sum.all, ov.summary.services, ''), sum('failed', O.sum.failed, ov.summary.failed, 'bad'),
      sum('deploying', O.sum.deploying, ov.summary.deploying, 'run'), sum('degraded', O.sum.degraded, ov.summary.degraded, 'warn', O.degradedHint), sum('behind', O.sum.behind, ov.summary.behind, 'warn')),
    h('div', { class: 'filters' },
      select(O.filter.project, F.projectId, [['all', O.filter.allProjects], ...ov.projects.map((p) => [p.id, p.name])], (v) => actions.setFilter({ projectId: v })),
      select(O.filter.environment, F.environmentId, [['all', O.filter.allEnvironments], ...ov.allEnvironments.map((e) => [e.id, e.name])], (v) => actions.setFilter({ environmentId: v })),
      select(O.filter.status, F.status, O.status, (v) => actions.setFilter({ status: v })),
      h('label', { class: 'fld' }, h('span', null, O.filter.search), h('input', { class: 'inp', type: 'search', placeholder: O.filter.searchHint, value: F.q, onchange: (e) => actions.setFilter({ q: e.target.value }) }))),
    h('div', { class: 'panel', css: { 'overflow-x': 'auto' } },
      h('div', { class: 'trow thead', css: grid },
        h('div', { class: 'c' }, h('input', { type: 'checkbox', 'aria-label': O.selectAll, checked: allSelected, onchange: () => actions.selectAll(visible, !allSelected) })),
        h('div', { class: 'c' }, O.colService),
        envs.map((e) => h('div', { class: 'c' }, h('span', { class: 'dot', css: { background: e.color } }), e.name, e.protected ? h('span', { class: 'chip' }, O.protected) : null)),
        h('div', { class: 'c' })),
      rows,
      rows.length ? null : h('div', { class: 'empty' }, O.empty)),
    selected.length ? h('div', { class: 'selbar' },
      h('div', null, h('b', null, O.selected(selected.length)), h('span', { css: { color: '#98A1B0' } }, O.selectedHint)),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: actions.clearSelection }, O.clear),
        h('button', { class: 'btn sm rb', onclick: () => actions.openDialog('rollback', selected) }, O.rollback),
        h('button', { class: 'btn sm pri', onclick: () => actions.openDialog('deploy', selected) }, O.deploy))) : null);
}
