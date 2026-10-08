// Màn 3: Hộp thoại Deploy / Rollback. Mọi điều kiện chặn do máy chủ tính (kiểm tra trước); hộp thoại chỉ hiện lại và
// không tự quyết gì. Bấm xác nhận thì máy chủ kiểm tra lại lần nữa trước khi chạy.
import { h, short } from '../dom.js';
import { T } from '../text.js';
import { C } from '../text-config.js';

const D = T.dialog;

function targetCard(item, d, actions, multi) {
  const commits = d.commits[item.serviceId] || [];
  const known = new Set(commits.map((c) => c.sha));
  const options = [...(item.to && !known.has(item.to.sha) ? [{ sha: item.to.sha, message: item.to.message || '', build: item.to.build, runningIn: [] }] : []), ...commits];
  const blocked = item.blockers.length > 0;
  const back = item.direction === 'backward';
  return h('div', { class: 'tcard' },
    h('div', { class: 'row', css: { 'justify-content': 'space-between' } }, h('b', { class: 'mono' }, item.serviceId),
      h('span', { class: `chip ${blocked ? 'bad' : item.warnings.length ? 'warn' : 'ok'}` }, blocked ? D.blocked : item.warnings.length ? D.warned : D.ready)),
    h('div', { class: 'ft' },
      h('div', { class: 'ftbox' }, h('span', { class: 'xs mut' }, D.runningOn(d.pre.environment.name)), h('span', null, h('span', { class: 'mono hash' }, item.from ? short(item.from.sha) : T.dash), ' ', h('span', { class: 'xs' }, item.from ? item.from.message || '' : D.notDeployed))),
      h('span', { css: { 'font-size': '20px' } }, '→'),
      h('div', { class: 'ftbox', css: { 'border-color': blocked ? '#E3B4B0' : '#E6E9EE' } }, h('span', { class: 'xs mut' }, D.targetCommit),
        h('select', { class: 'sel mono', 'aria-label': D.targetOf(item.serviceId), onchange: (e) => actions.dialogTarget(item.serviceId, e.target.value) },
          options.length ? null : h('option', { value: '' }, D.noCommits),
          options.map((c) => h('option', { value: c.sha, selected: !!item.to && c.sha === item.to.sha }, `${short(c.sha)} · ${(c.message || '').slice(0, 70)} (${T.build[c.build] || c.build}${c.runningIn && c.runningIn.includes(d.environmentId) ? D.running : ''})`))))),
    item.suggestions.length ? h('div', { class: 'row' }, h('span', { class: 'xs mut' }, D.suggestions), item.suggestions.map((s) => h('button', { class: 'btn sm', onclick: () => actions.dialogTarget(item.serviceId, s.sha) }, `${s.label} (${short(s.sha)})`))) : null,
    item.blockers.map((b) => h('div', { class: 'callout bad' }, h('b', null, b.message), h('span', { class: 'xs mono' }, b.code))),
    item.warnings.map((w) => h('div', { class: 'callout warn' }, h('b', null, w.message), h('span', { class: 'xs mono' }, w.code))),
    item.changes.length ? h('details', { class: 'chg', open: !multi },
      h('summary', null, back ? D.removed(item.changes.length) : D.added(item.changes.length)),
      h('div', { class: 'chgl' }, item.changes.map((c) => h('div', null, h('span', { class: `chip ${back ? 'rbk' : 'run'}` }, back ? D.out : D.in), h('span', { class: 'mono hash' }, short(c.sha)), h('span', null, c.message || ''))))) : null,
    item.firstDeploy && !blocked ? h('div', { class: 'callout info' }, D.first) : null);
}

export function dialogView(state, actions) {
  const d = state.dialog;
  if (!d) return null;
  const rb = d.kind === 'rollback';
  const envs = (state.overview && state.overview.allEnvironments) || [];
  const env = envs.find((e) => e.id === d.environmentId) || { name: d.environmentId, description: '' };
  const n = d.items.length;
  const one = d.items[0].serviceId;
  // Cổng an toàn do máy chủ tính: chặn chung (quyền, giờ khóa), chuỗi phải gõ để xác nhận, và có cần người thứ hai duyệt không.
  const gate = (d.pre && d.pre.gate) || { blockers: [], confirmation: null, approval: false };
  const typedOk = !gate.confirmation || d.typed === gate.confirmation;
  const can = !!d.pre && d.pre.canProceed && typedOk && !d.loading && !d.sending;
  const label = d.loading ? D.checking : d.sending ? D.sending : d.pre && !d.pre.canProceed ? D.cannot : gate.approval ? C.approval.request : D.confirm(d.kind, n, one, env.name);
  const heading = D.heading(d.kind, n, one, env.name);
  return h('div', { class: 'ovl' }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': heading },
    h('div', { class: `mh ${rb ? 'rollback' : 'deploy'}` },
      h('div', null, h('div', { class: 'mkind' }, T.kind[d.kind]), h('h2', { class: 'h2' }, heading), h('div', { class: 'mut xs' }, n > 1 ? D.leadMulti : D.leadOne)),
      h('button', { class: 'ib', 'aria-label': D.close, onclick: actions.closeDialog }, '×')),
    h('div', { class: 'mb' },
      h('div', null, h('div', { class: 'lab' }, D.environment),
        h('div', { class: 'seg' }, envs.map((e) => h('button', { class: `segb ${e.id === d.environmentId ? 'on' : ''}`, onclick: () => actions.dialogEnvironment(e.id) }, h('span', { class: 'dot', css: { background: e.color } }), e.name, e.protected ? h('span', { class: 'chip', css: { 'margin-left': '6px' } }, T.overview.protected) : null))),
        h('div', { class: 'mut xs', css: { 'margin-top': '6px' } }, env.description || '')),
      d.error ? h('div', { class: 'callout bad' }, h('b', null, d.error)) : null,
      gate.blockers.map((b) => h('div', { class: 'callout bad' }, h('b', null, b.message), h('span', { class: 'xs mono' }, b.code))),
      d.pre ? d.pre.items.map((item) => targetCard(item, d, actions, n > 1)) : h('div', { class: 'empty' }, d.loading ? D.checkingServer : D.noResult),
      gate.approval && d.pre && d.pre.canProceed ? h('div', { class: 'callout warn' }, h('b', null, C.approval.need(env.name))) : null,
      gate.confirmation && d.pre && d.pre.canProceed ? h('label', { class: 'fld' }, h('span', null, C.approval.typeToConfirm(gate.confirmation)),
        h('input', { class: 'inp mono', id: 'confirm-name', 'aria-label': C.approval.typeLabel, autocomplete: 'off', value: d.typed, oninput: (e) => { d.typed = e.target.value; document.getElementById('confirm-go').disabled = !(d.pre.canProceed && d.typed === gate.confirmation); } })) : null,
      h('div', { class: 'callout info' }, rb ? D.noteRollback : D.noteDeploy)),
    h('div', { class: 'mf' },
      h('span', { class: 'xs mut' }, D.foot),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: actions.closeDialog }, D.cancel),
        h('button', { class: `btn ${rb ? 'rb' : 'pri'}`, id: 'confirm-go', disabled: !can, onclick: actions.confirmDialog }, label)))));
}
