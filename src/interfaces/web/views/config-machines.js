// spec: BDK-S-006
// Cấu hình > Môi trường, phần THÊM và GỠ: khai một máy đã có, hoặc cho bảng điều khiển tạo một máy mới trên cloud (tốn tiền,
// phải gõ tên để xác nhận). Tạo xong chỉ có một máy sẵn sàng nhận lệnh; đưa dịch vụ lên là việc của người vận hành.
import { h, ago } from '../dom.js';
import { C } from '../text-config.js';

const M = C.machines;
const STEP_CLASS = { succeeded: 'done', running: 'active', failed: 'bad', pending: '' };
const STATE_CHIP = { ready: 'ok', creating: 'run', deleting: 'warn', failed: 'bad' };

/** Ô nhập giữ giá trị trong trạng thái trang mà không vẽ lại (vẽ lại giữa lúc gõ làm mất con trỏ). */
const field = (form, key, label, props = {}) => h('label', { class: 'fld', css: props.css }, h('span', null, label),
  h('input', { class: 'inp mono', autocomplete: 'off', placeholder: props.placeholder, value: form[key] || '', oninput: (e) => { form[key] = e.target.value.trim(); if (props.onType) props.onType(); } }));

function addForm(cfg, actions) {
  const f = cfg.envForm; const o = cfg.managed.options;
  const create = f.mode === 'create';
  const type = o.machineTypes.find((m) => m.id === (f.machineType || o.defaultMachineType)) || o.machineTypes[0];
  const go = h('button', { class: 'btn pri', id: 'env-add-go', disabled: create ? !f.name || f.confirmation !== f.name : !f.name || !f.instance, onclick: actions.addEnvironment }, create ? M.createGo : M.registerGo);
  const recheck = () => { go.disabled = create ? !f.name || f.confirmation !== f.name : !f.name || !f.instance; };
  return h('div', { class: 'panel', css: { padding: '14px', display: 'flex', 'flex-direction': 'column', gap: '12px' } },
    h('div', { class: 'h3' }, M.add),
    h('div', { class: 'seg' }, [['create', M.modeCreate], ['register', M.modeRegister]].map(([k, l]) => h('button', { class: `segb ${f.mode === k ? 'on' : ''}`, onclick: () => actions.envFormMode(k) }, l))),
    h('div', { class: 'mut' }, create ? M.createLead : M.registerLead),
    h('div', { class: 'row', css: { 'align-items': 'flex-end' } },
      field(f, 'name', M.name, { css: { flex: '1 1 180px' }, placeholder: 'staging-2', onType: recheck }),
      create ? h('label', { class: 'fld', css: { width: '200px' } }, h('span', null, M.machineType),
        h('select', { class: 'inp', onchange: (e) => actions.envFormSet({ machineType: e.target.value }) }, o.machineTypes.map((m) => h('option', { value: m.id, selected: m.id === type.id }, M.typeLabel(m)))))
        : field(f, 'instance', M.instance, { css: { flex: '1 1 180px' }, placeholder: 'vm-name', onType: recheck }),
      field(f, 'zone', M.zone, { css: { width: '200px' }, placeholder: o.zone })),
    create ? h('div', { class: 'callout warn' }, h('b', null, M.cost(type.usdPerDay)), h('span', null, M.costNote)) : null,
    create ? field(f, 'confirmation', M.typeName, { css: { width: '280px' }, onType: recheck }) : null,
    h('div', { class: 'row' }, go, cfg.envError ? h('span', { class: 'xs', css: { color: 'var(--bad)' } }, cfg.envError) : null));
}

function operation(o) {
  return h('div', { class: 'panel', css: { padding: '14px', display: 'flex', 'flex-direction': 'column', gap: '10px' } },
    h('div', { class: 'row', css: { 'justify-content': 'space-between' } }, h('b', null, M.operation(o.kind, o.name)), h('span', { class: `chip ${o.status === 'succeeded' ? 'ok' : o.status === 'failed' ? 'bad' : 'run'}` }, M.opStatus[o.status] || o.status)),
    h('div', { class: 'steps' }, o.steps.map((s) => h('div', { class: `seg4 ${STEP_CLASS[s.status] || ''}` }, h('div', { class: 'bar' }, h('i', { css: { width: s.status === 'pending' ? '0%' : s.status === 'running' ? '55%' : '100%' } })), h('span', null, M.step[s.name] || s.name)))),
    o.log.length ? h('div', { class: 'term', css: { 'max-height': '180px' } }, o.log.map((l) => h('div', null, h('span', { class: 'dim' }, String(l.at).slice(11, 19)), ' ', l.text))) : null);
}

function item(e, cfg, actions) {
  const words = cfg.removeWords;
  const busy = e.state === 'creating' || e.state === 'deleting';
  const keep = h('button', { class: 'btn sm', disabled: true, onclick: () => actions.removeEnvironment(e.name, false) }, M.removeKeep);
  const del = e.managed ? h('button', { class: 'btn sm dng', disabled: true, onclick: () => actions.removeEnvironment(e.name, true) }, M.removeDelete) : null;
  const typed = h('input', { class: 'inp mono', css: { width: '200px' }, 'aria-label': M.typeToRemove(e.name), placeholder: M.typeToRemove(e.name), autocomplete: 'off', value: words[e.name] || '',
    oninput: (ev) => { words[e.name] = ev.target.value.trim(); const ok = words[e.name] === e.name && !busy; keep.disabled = !ok; if (del) del.disabled = !ok; } });
  const ok = words[e.name] === e.name && !busy;
  keep.disabled = !ok; if (del) del.disabled = !ok;
  return h('div', { class: 'crow' },
    h('div', { css: { flex: '1 1 260px', 'min-width': '0' } },
      h('div', { class: 'row' }, h('b', { class: 'mono' }, e.name), h('span', { class: `chip ${STATE_CHIP[e.state] || ''}` }, M.state[e.state] || e.state), h('span', { class: 'chip' }, e.managed ? M.managed : M.registered)),
      h('div', { class: 'xs mut' }, M.meta(e.instance, e.zone, e.machineType, e.createdBy, ago(e.createdAt))),
      e.detail ? h('div', { class: 'xs', css: { color: 'var(--bad)' } }, e.detail) : null),
    typed, keep, del);
}

export function machinesPanel({ cfg, actions, locked }) {
  if (!cfg.managed) return null;
  const running = cfg.managed.operations.filter((o) => o.status === 'running');
  const recent = cfg.managed.operations.filter((o) => o.status !== 'running').slice(0, 2);
  return h('div', { class: 'stack' },
    cfg.managed.items.length ? h('div', { class: 'panel' }, h('div', { class: 'dh' }, h('b', null, M.listTitle), h('span', { class: 'xs mut' }, M.listLead)),
      cfg.managed.items.map((e) => (locked ? h('div', { class: 'crow' }, h('b', { class: 'mono' }, e.name), h('span', { class: `chip ${STATE_CHIP[e.state] || ''}` }, M.state[e.state] || e.state)) : item(e, cfg, actions)))) : null,
    [...running, ...recent].map(operation),
    locked ? null : addForm(cfg, actions));
}
