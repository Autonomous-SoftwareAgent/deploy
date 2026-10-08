// Màn 1: Tổng quan hệ thống. Cột sinh từ danh sách môi trường mà máy chủ trả về; không tên môi trường nào viết cứng ở đây.
import { h, short, ago, HEALTH_LABEL } from '../dom.js';

const STATUS_OPTIONS = [['all', 'Tất cả trạng thái'], ['failed', 'Hỏng'], ['deploying', 'Đang đưa lên'], ['healthy', 'Khỏe'], ['behind', 'Lệch phiên bản']];

function select(label, value, options, onchange) {
  return h('label', { class: 'fld' }, h('span', null, label),
    h('select', { class: 'sel', onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
}

function cell(c) {
  if (c.unreachable) return h('div', { class: 'c cell' }, h('span', { class: 'chip bad', title: c.error || '' }, 'không hỏi được'));
  if (c.absent) return h('div', { class: 'c cell' }, h('span', { class: 'mut xs' }, 'Không có ở môi trường này'));
  if (!c.deployed) return h('div', { class: 'c cell' }, h('span', { class: 'mut xs' }, 'Chưa deploy'));
  const msg = c.commit.message || 'không thấy commit này trong lịch sử ở máy này';
  return h('div', { class: 'c cell' },
    h('div', { class: 'l1' }, h('span', { class: `sdot ${c.health || ''}` }), h('span', { class: 'mono hash' }, short(c.commit.sha)),
      h('span', { class: `stx ${c.health || ''}` }, HEALTH_LABEL[c.health] || '—'), h('span', { class: 'tm mut' }, ago(c.deployedAt))),
    h('div', { class: 'msg', title: msg }, msg),
    c.behindCount > 0 ? h('span', null, h('span', { class: 'chip warn' }, `còn ${c.behindCount} commit chưa deploy`))
      : c.differsFromDeclared ? h('span', null, h('span', { class: 'chip warn', title: `bản đã khai: ${c.head ? c.head.shortSha : ''}` }, 'khác bản đã khai')) : null);
}

export function overviewView(state, actions) {
  const ov = state.overview;
  if (!ov) return h('div', { class: 'empty' }, state.error || 'Đang đọc trạng thái của các môi trường…');
  const F = state.filters;
  const envs = ov.environments;
  const cols = `36px 230px repeat(${envs.length}, minmax(210px, 1fr)) 112px`;
  const grid = { 'grid-template-columns': cols, 'min-width': `${36 + 230 + envs.length * 210 + 112}px` };
  const visible = ov.groups.flatMap((g) => g.services.map((s) => s.id));
  const allSelected = visible.length > 0 && visible.every((id) => state.selected[id]);
  const selected = actions.selectedIds();
  const sum = (key, label, n, cls) => h('button', { class: `sum ${n && cls ? cls : ''}${F.status === key ? ' on' : ''}`, onclick: () => actions.setFilter({ status: key }) }, h('b', { class: 'mono' }, n), h('span', null, label));

  const rows = [];
  for (const g of ov.groups) {
    const open = !state.collapsed[g.project.id];
    rows.push(h('div', { class: 'trow grp', css: grid }, h('div', { class: 'c', css: { 'grid-column': '1 / -1', 'padding-top': '2px', 'padding-bottom': '2px' } },
      h('button', { class: 'gbtn', 'aria-expanded': String(open), onclick: () => actions.toggleGroup(g.project.id) }, h('span', null, open ? '▾' : '▸'), g.project.name,
        h('span', { class: 'mut', css: { 'font-weight': '400' } }, `${g.services.length} service`), g.attentionCount ? h('span', { class: 'chip warn' }, `${g.attentionCount} cần chú ý`) : null))));
    if (!open) continue;
    for (const s of g.services) {
      rows.push(h('div', { class: 'trow', css: grid },
        h('div', { class: 'c' }, h('input', { type: 'checkbox', 'aria-label': `Chọn ${s.name}`, checked: !!state.selected[s.id], onchange: () => actions.toggleSelect(s.id) })),
        h('div', { class: 'c', css: { display: 'flex', 'flex-direction': 'column', gap: '3px' } },
          h('button', { class: 'svcn', onclick: () => actions.openService(s.id) }, s.name),
          s.configWarnings.length ? h('div', { class: 'row', css: { gap: '6px' } }, h('span', { class: 'chip warn' }, 'chưa khai commit')) : null),
        envs.map((e) => cell(s.cells[e.id])),
        h('div', { class: 'c' }, h('button', { class: 'btn sm', onclick: () => actions.openDialog('deploy', [s.id]) }, 'Deploy…'))));
    }
  }

  return h('div', null,
    h('div', { class: 'ph' }, h('div', null, h('h1', { class: 'h1' }, 'Tổng quan hệ thống'),
      h('div', { class: 'mut' }, `${ov.summary.services} service · ${ov.projects.length} nhóm · ${ov.allEnvironments.length} môi trường. Service hỏng, đang đưa lên và lệch phiên bản nằm trên cùng.`))),
    ov.memory ? h('div', { class: 'banner warn' }, 'CHẾ ĐỘ THỬ TRONG BỘ NHỚ: mọi nút ở đây chỉ đổi dữ liệu mẫu, không hệ nào bị đụng.') : null,
    state.error ? h('div', { class: 'banner bad' }, state.error) : null,
    ov.unreachable.map((u) => h('div', { class: 'banner bad' }, `Không hỏi được môi trường ${u.name}: ${u.error}`)),
    (ov.skippedTargets || []).map((t) => h('div', { class: 'banner warn' }, `Bỏ qua một tờ khai đích sai: ${t}`)),
    h('div', { class: 'sumrow' }, sum('all', 'tất cả service', ov.summary.services, ''), sum('failed', 'service hỏng', ov.summary.failed, 'bad'),
      sum('deploying', 'đang đưa lên', ov.summary.deploying, 'run'), sum('behind', 'lệch phiên bản', ov.summary.behind, 'warn')),
    h('div', { class: 'filters' },
      select('Nhóm dự án', F.projectId, [['all', 'Tất cả nhóm'], ...ov.projects.map((p) => [p.id, p.name])], (v) => actions.setFilter({ projectId: v })),
      select('Môi trường', F.environmentId, [['all', 'Tất cả môi trường'], ...ov.allEnvironments.map((e) => [e.id, e.name])], (v) => actions.setFilter({ environmentId: v })),
      select('Trạng thái', F.status, STATUS_OPTIONS, (v) => actions.setFilter({ status: v })),
      h('label', { class: 'fld' }, h('span', null, 'Tìm service hoặc commit'), h('input', { class: 'inp', type: 'search', placeholder: 'tên service, lời nhắn commit…', value: F.q, onchange: (e) => actions.setFilter({ q: e.target.value }) }))),
    h('div', { class: 'panel', css: { 'overflow-x': 'auto' } },
      h('div', { class: 'trow thead', css: grid },
        h('div', { class: 'c' }, h('input', { type: 'checkbox', 'aria-label': 'Chọn tất cả service đang hiển thị', checked: allSelected, onchange: () => actions.selectAll(visible, !allSelected) })),
        h('div', { class: 'c' }, 'Service'),
        envs.map((e) => h('div', { class: 'c' }, h('span', { class: 'dot', css: { background: e.color } }), e.name)),
        h('div', { class: 'c' })),
      rows,
      rows.length ? null : h('div', { class: 'empty' }, 'Không có service nào khớp bộ lọc.')),
    selected.length ? h('div', { class: 'selbar' },
      h('div', null, h('b', null, `${selected.length} service đã chọn`), h('span', { css: { color: '#98A1B0' } }, ' · mỗi service giữ commit đích riêng ở bước xác nhận')),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: actions.clearSelection }, 'Bỏ chọn'),
        h('button', { class: 'btn sm rb', onclick: () => actions.openDialog('rollback', selected) }, 'Rollback…'),
        h('button', { class: 'btn sm pri', onclick: () => actions.openDialog('deploy', selected) }, 'Deploy…'))) : null);
}
