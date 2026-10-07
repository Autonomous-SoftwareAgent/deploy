// Lịch sử đưa lên của một dịch vụ (các dòng gần nhất của sổ deploy), gập lại được.
import { el, badge, code, short, when, actionName } from '../format.js';

export function historyView(s, ui) {
  const table = el('table', {}, el('tr', {}, ['Lúc', 'Việc', 'Commit', 'Kết quả', 'Ai', 'Lý do'].map((h) => el('th', { textContent: h }))));
  for (const h of s.history) {
    table.append(el('tr', {}, [
      el('td', { textContent: when(h.at) }),
      el('td', { textContent: actionName(h.action) }),
      el('td', {}, code(short(h.commit))),
      el('td', {}, badge(h.result === 'ok' ? 'thành công' : 'hỏng', h.result === 'ok' ? 'ok' : 'bad')),
      el('td', { textContent: h.by || '' }),
      el('td', { className: 'reason', textContent: h.reason || '' }),
    ]));
  }
  const details = el('details', { open: ui.openHistory.has(s.service) }, [
    el('summary', { textContent: `Lịch sử đưa lên (${s.history.length} dòng gần nhất)` }),
    el('div', { className: 'scroll' }, table),
  ]);
  details.addEventListener('toggle', () => (details.open ? ui.openHistory.add(s.service) : ui.openHistory.delete(s.service)));
  return details;
}
