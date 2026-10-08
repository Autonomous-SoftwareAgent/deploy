// spec: BDK-S-004
// Khung của phần Cấu hình: tiêu đề, thanh lưu bản nháp (xem trước thay đổi rồi mới lưu), và màn con theo mục đang chọn.
import { h } from '../dom.js';
import { C } from '../text-config.js';
import { isDirty } from '../config-store.js';
import { environmentsTab } from './config-environments.js';
import { matrixTab, rulesTab } from './config-branches.js';
import { accessTab } from './config-access.js';
import { historyTab, dangerTab } from './config-history.js';

const TABS = { environments: environmentsTab, matrix: matrixTab, rules: rulesTab, access: accessTab, history: historyTab, danger: dangerTab };

function saveBar(cfg, actions) {
  const p = cfg.preview;
  const note = h('input', { class: 'inp', placeholder: C.save.noteHint, 'aria-label': C.save.note, value: cfg.note, oninput: (e) => actions.setNote(e.target.value) });
  return h('div', { class: 'panel', css: { padding: '12px 14px', 'margin-bottom': '12px', display: 'flex', 'flex-direction': 'column', gap: '10px' } },
    h('div', { class: 'row', css: { 'justify-content': 'space-between' } },
      h('b', null, h('span', { class: 'dirtydot' }), ' ', C.save.dirty(cfg.loaded.version)),
      h('div', { class: 'row' }, h('div', { css: { width: '260px' } }, note), h('button', { class: 'btn sm', onclick: actions.preview }, C.save.preview), h('button', { class: 'btn sm', onclick: actions.discard }, C.save.discard),
        h('button', { class: 'btn sm pri', disabled: cfg.saving, onclick: actions.save }, cfg.saving ? C.save.saving : C.save.save))),
    p ? h('div', { class: 'stack' },
      p.errors.length ? h('div', { class: 'callout bad' }, h('b', null, C.save.invalid), p.errors.map((e) => h('span', { class: 'xs mono' }, e))) : null,
      h('div', { class: 'xs mut' }, p.changes.length ? C.save.changes(p.changes.length) : C.save.none),
      h('div', { class: 'chgl' }, p.changes.map((c) => h('div', null, h('span', { class: 'mono xs' }, c.path), h('span', { class: 'xs mut' }, C.save.from), h('span', { class: 'mono xs' }, c.from === null ? '—' : c.from), h('span', { class: 'xs mut' }, C.save.to), h('span', { class: 'mono xs' }, c.to === null ? '—' : c.to))))) : null);
}

export function configView(state, actions) {
  const cfg = state.cfg;
  const title = (C.nav.find(([k]) => k === cfg.tab) || ['', ''])[1];
  if (!cfg.loaded || !cfg.draft) return h('div', null, h('div', { class: 'ph' }, h('h1', { class: 'h1' }, title)), h('div', { class: 'empty' }, cfg.error || C.reading));
  const envs = (state.overview && state.overview.allEnvironments) || [];
  return h('div', null,
    h('div', { class: 'ph' }, h('h1', { class: 'h1' }, title)),
    cfg.loaded.canEdit ? null : h('div', { class: 'banner warn' }, C.readOnly),
    cfg.error ? h('div', { class: 'banner bad' }, cfg.error) : null,
    isDirty() && cfg.loaded.canEdit ? saveBar(cfg, actions) : null,
    (TABS[cfg.tab] || environmentsTab)({ cfg, envs, state, actions, locked: !cfg.loaded.canEdit }));
}
