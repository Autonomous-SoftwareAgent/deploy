// Cấu hình > Lịch sử, import, export (kèm sổ thao tác) và Khu vực nguy hiểm.
import { h, ago } from '../dom.js';
import { C } from '../text-config.js';

const H = C.history; const D = C.danger; const F = H.filter;

export function historyTab({ cfg, actions, locked }) {
  const versions = cfg.loaded.versions;
  const audit = cfg.audit;
  const importBox = h('textarea', { class: 'inp', 'aria-label': H.importTitle, placeholder: H.importHint, oninput: (e) => actions.setImport(e.target.value) });
  importBox.value = cfg.importText;
  const exportBox = h('textarea', { class: 'inp mono', readonly: true, 'aria-label': H.exportTitle, css: { 'min-height': '220px' } });
  exportBox.value = JSON.stringify({ version: cfg.loaded.version, config: cfg.loaded.config }, null, 2);
  return h('div', { class: 'stack' },
    h('div', { class: 'split' },
      h('div', { class: 'panel', css: { flex: '1 1 380px', 'min-width': '0' } }, h('div', { class: 'dh' }, h('b', null, H.title)),
        versions.length ? versions.map((v) => h('div', { class: 'crow' },
          h('div', { css: { flex: '1 1 200px', 'min-width': '0' } }, h('div', { css: { 'font-weight': '500' } }, `v${v.version} · ${v.note || H.noNote}`), h('div', { class: 'xs mut' }, `${v.by} · ${ago(v.at)}`)),
          v.version === cfg.loaded.version ? h('span', { class: 'chip ok' }, H.current) : h('button', { class: 'btn sm', disabled: locked, onclick: () => actions.restore(v.version) }, H.restore))) : h('div', { class: 'empty' }, H.empty)),
      h('div', { class: 'panel', css: { flex: '1 1 420px', 'min-width': '0', padding: '14px', display: 'flex', 'flex-direction': 'column', gap: '10px' } },
        h('div', { class: 'h3' }, H.exportTitle), exportBox,
        h('div', { class: 'h3' }, H.importTitle), importBox,
        cfg.importError ? h('div', { class: 'callout bad' }, cfg.importError) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn', disabled: locked, onclick: () => actions.applyImport(H.badJson) }, H.apply), h('span', { class: 'xs mut' }, H.applyHint)))),
    h('div', { class: 'panel' }, h('div', { class: 'dh' }, h('b', null, H.audit), h('span', { class: 'xs mut' }, H.auditLead)),
      h('div', { class: 'crow' },
        h('label', { class: 'fld', css: { width: '160px' } }, h('span', null, F.actor), h('input', { class: 'inp mono', value: cfg.auditFilter.actor, onchange: (e) => actions.filterAudit({ actor: e.target.value.trim() }) })),
        h('label', { class: 'fld', css: { width: '180px' } }, h('span', null, F.action), h('select', { class: 'inp', onchange: (e) => actions.filterAudit({ action: e.target.value }) }, h('option', { value: '' }, F.anyAction), F.actions.map(([v, l]) => h('option', { value: v, selected: v === cfg.auditFilter.action }, l)))),
        h('label', { class: 'fld', css: { width: '170px' } }, h('span', null, F.outcome), h('select', { class: 'inp', onchange: (e) => actions.filterAudit({ outcome: e.target.value }) }, [['', F.anyOutcome], ['refused', F.refused], ['ok', F.ok]].map(([v, l]) => h('option', { value: v, selected: v === cfg.auditFilter.outcome }, l)))),
        h('label', { class: 'fld', css: { flex: '1 1 200px' } }, h('span', null, F.q), h('input', { class: 'inp', type: 'search', value: cfg.auditFilter.q, onchange: (e) => actions.filterAudit({ q: e.target.value.trim() }) }))),
      audit && audit.dropped ? h('div', { class: 'banner bad' }, H.dropped(audit.dropped)) : null,
      audit && audit.items.length ? audit.items.map((e) => h('div', { class: 'tlrow' },
        h('span', { class: `chip ${e.outcome === 'ok' ? '' : 'bad'}` }, e.action), h('b', null, e.actor), h('span', { class: 'mono xs' }, e.target),
        h('span', { class: 'xs', css: { flex: '1 1 200px', 'min-width': '0' } }, e.detail), h('span', { class: 'xs mut' }, ago(e.at)))) : h('div', { class: 'empty' }, audit ? H.auditEmpty : C.reading)));
}

export function dangerTab({ cfg, actions, locked }) {
  const box = (title, text, body) => h('div', { class: 'panel', css: { padding: '14px', display: 'flex', 'flex-direction': 'column', gap: '10px' } }, h('div', { class: 'h3' }, title), h('div', { class: 'mut' }, text), body);
  return h('div', { class: 'stack' },
    box(D.reset, D.resetText, h('div', { class: 'row', css: { 'align-items': 'flex-end' } },
      h('label', { class: 'fld', css: { width: '240px' } }, h('span', null, D.type(D.word)), h('input', { class: 'inp mono', disabled: locked, autocomplete: 'off', value: cfg.confirmWord, onchange: (e) => actions.setConfirmWord(e.target.value.trim()) })),
      h('button', { class: 'btn dng', disabled: locked || cfg.confirmWord !== D.word, onclick: actions.reset }, D.resetButton))),
    box(D.creds, D.credsText, h('div', { class: 'term' }, D.credsCommand)),
    box(D.auto, D.autoText, null));
}
