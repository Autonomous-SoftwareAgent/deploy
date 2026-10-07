// Thẻ của một dịch vụ: điều nó muốn, điều đang chạy, nút Deploy và Rollback, lịch sử. Hàm thuần từ dữ liệu ra phần tử.
import { el, badge, code, short, when, actionName } from '../format.js';
import { describe } from './service-state.js';
import { historyView } from './history.js';

function facts(s) {
  const dl = el('dl');
  const row = (name, value) => dl.append(el('dt', { textContent: name }), el('dd', {}, value));
  const built = s.image.present === true ? ' · đã có bản đóng gói' : s.image.present === false ? ' · CHỜ BUILD (chưa có bản đóng gói)' : '';
  row('Commit đã khai', [code(short(s.declared)), built]);
  row('Đang chạy', [code(s.running ? short(s.runningCommit) : '(không chạy)'), s.containerStatus ? ` · ${s.containerStatus}` : '']);
  row('Bản liền trước', code(short(s.previous)));
  const last = s.lastAttempt;
  if (last) row('Lần gần nhất', `${actionName(last.action)} ${short(last.commit)}: ${last.result === 'ok' ? 'thành công' : 'HỎNG'} · ${when(last.at)}${last.by ? ` · ${last.by}` : ''}`);
  return dl;
}

/** ui: { openHistory: Set, picked: Map }. actions: { confirm(question) -> Promise<bool>, deploy(service), rollback(service, commit) }. */
export function serviceCard(s, ui, actions) {
  const d = describe(s);
  const deploy = el('button', { type: 'button', className: 'primary', textContent: `Deploy ${short(s.declared)}`, disabled: !d.canDeploy });
  deploy.addEventListener('click', async () => {
    const yes = await actions.confirm({
      title: `Deploy ${s.service}`, yes: 'Deploy',
      text: `Thay bản đang chạy ${short(s.runningCommit)} bằng bản đã khai ${short(s.declared)}.\n\nDịch vụ ngừng trả lời vài giây trong lúc thay. Không khỏe thì bản cũ tự được bật lại.`,
    });
    if (yes) actions.deploy(s.service);
  });

  const select = el('select', { disabled: !d.canRollback });
  select.setAttribute('aria-label', `Bản để lùi về của ${s.service}`);
  for (const c of d.targets) select.append(el('option', { value: c, textContent: short(c) + (c === s.previous ? ' (bản liền trước)' : '') }));
  if (!d.targets.length) select.append(el('option', { value: '', textContent: '(chưa có bản để lùi về)' }));
  const remembered = ui.picked.get(s.service);
  if (d.targets.includes(remembered)) select.value = remembered; else if (d.targets.includes(s.previous)) select.value = s.previous;
  select.addEventListener('change', () => ui.picked.set(s.service, select.value));

  const rollback = el('button', { type: 'button', textContent: 'Rollback về bản này', disabled: !d.canRollback });
  rollback.addEventListener('click', async () => {
    const to = select.value;
    const yes = await actions.confirm({
      title: `Rollback ${s.service}`, yes: 'Rollback',
      text: `Lùi về ${short(to)}.\n\nChỉ lùi chương trình, không lùi dữ liệu. Lùi xong tờ khai báo ở máy này được ghi lại theo bản đó.`,
    });
    if (yes) actions.rollback(s.service, to);
  });

  return el('div', { className: 'card' }, [
    el('div', { className: 'top' }, [el('h2', { textContent: s.service }), badge(d.label, d.kind)]),
    facts(s),
    el('div', { className: 'actions' }, [deploy, select, rollback]),
    d.hint ? el('p', { className: 'hint', textContent: d.hint }) : null,
    historyView(s, ui),
  ]);
}
