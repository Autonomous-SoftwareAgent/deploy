// Màn 4: Tiến trình deploy. Các bước là bước THẬT của lệnh điều khiển (lấy bản, bật bản mới, kiểm sức khỏe, ghi sổ);
// build và test không chạy ở đây mà ở CI, nên không được vẽ thành bước.
import { h, short, ITEM_CHIP } from '../dom.js';
import { T } from '../text.js';

const R = T.run;
const STEP_CLASS = { succeeded: 'done', running: 'active', failed: 'bad', pending: '' };
const STEP_WIDTH = { succeeded: 100, running: 55, failed: 100, pending: 0 };
const LEVEL_CLASS = { info: '', success: 'ok', warn: 'warn', error: 'err' };
const time = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '--:--:--' : d.toLocaleTimeString('en-GB', { hour12: false }); };

function result(r) {
  if (r.status === 'running') return null;
  const n = (s) => r.items.filter((i) => i.status === s).length;
  const [cls, title, text] = r.status === 'succeeded' ? ['info', R.done, R.doneText(n('succeeded'), r.environment.name)]
    : r.status === 'failed' ? ['bad', R.failed(n('failed')), R.failedText]
      : ['warn', R.reverted(n('rolled_back')), R.revertedText(n('succeeded'))];
  return h('div', { class: `callout ${cls}`, css: { 'margin-bottom': '12px' } }, h('b', null, title), h('span', null, text));
}

export function runView(state, actions) {
  const cur = state.run;
  const r = cur && cur.data;
  if (!r) return h('div', { class: 'empty' }, R.reading);
  const live = r.status === 'running';
  const term = h('div', { class: 'term', css: { 'max-height': '360px' } }, cur.log.map((l) => h('div', null, h('span', { class: 'dim' }, time(l.at)), ' ', h('span', { class: LEVEL_CLASS[l.level] || '' }, `${r.items.length > 1 && l.serviceId ? `[${l.serviceId}] ` : ''}${l.text}`))));
  // Log mới nằm cuối: cuộn xuống sau khi phần tử đã vào trang.
  queueMicrotask(() => { term.scrollTop = term.scrollHeight; });
  return h('div', null,
    h('div', { class: 'ph' },
      h('div', null, h('div', { class: 'crumb' }, h('span', null, R.crumb)), h('h1', { class: 'h1' }, T.dialog.heading(r.kind, r.items.length, r.items[0].serviceId, r.environment.name)),
        h('div', { class: 'mut' }, live ? R.steps : R.ended(r.requestedBy))),
      h('div', { class: 'row' }, live ? h('span', { class: 'xs mut' }, R.noCancel) : h('button', { class: 'btn', onclick: actions.goOverview }, R.back))),
    result(r),
    h('div', { class: 'stack' },
      r.items.map((t) => h('div', { class: 'panel', css: { padding: '14px', display: 'flex', 'flex-direction': 'column', gap: '10px' } },
        h('div', { class: 'row', css: { 'justify-content': 'space-between' } },
          h('div', { class: 'row' }, h('b', { class: 'mono' }, t.serviceId), h('span', { class: 'mono hash' }, short(t.fromSha)), h('span', null, '→'), h('span', { class: 'mono hash' }, short(t.toSha))),
          h('span', { class: `chip ${ITEM_CHIP[t.status] || ''}` }, T.item[t.status] || t.status)),
        h('div', { class: 'steps' }, t.steps.map((s) => h('div', { class: `seg4 ${STEP_CLASS[s.status] || ''}` }, h('div', { class: 'bar' }, h('i', { css: { width: `${STEP_WIDTH[s.status] || 0}%` } })), h('span', null, T.step[s.name] || s.name)))),
        t.reason ? h('div', { class: 'xs', css: { color: 'var(--bad)' } }, t.reason) : null)),
      h('div', { class: 'panel', css: { overflow: 'hidden' } },
        h('div', { class: 'dh' }, h('b', null, R.log), h('span', { class: `chip ${live ? 'run' : ''}` }, live ? R.live : R.stopped)),
        cur.log.length ? term : h('div', { class: 'empty' }, R.noLog))));
}
