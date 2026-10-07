// Các việc vừa chạy từ bảng điều khiển, kèm kết quả và nhật ký của lệnh. Hàm thuần từ dữ liệu ra phần tử.
import { el, short, when, actionName } from '../format.js';

function headline(j) {
  const r = j.result || {};
  const what = `${actionName(j.action)} ${j.service}`;
  if (j.state === 'running') return `${what}: đang chạy…`;
  if (r.noop) return `${what}: không đổi gì (đang chạy đúng bản đó)`;
  if (j.ok) return `${what}: thành công, đang chạy ${short(r.to)}`;
  if (r.reverted === 'ok') return `${what}: HỎNG, đã tự bật lại bản ${short(r.from)}`;
  if (r.reverted === 'failed') return `${what}: HỎNG, và bật lại bản cũ CŨNG HỎNG`;
  return `${what}: KHÔNG THÀNH`;
}

function jobBox(j) {
  const r = j.result || {};
  const kind = j.state === 'running' ? 'run' : j.ok ? 'ok' : 'bad';
  return el('div', { className: `job ${kind}` }, [
    el('div', {}, el('strong', { textContent: headline(j) })),
    el('p', { className: 'hint', textContent: `${when(j.startedAt)} · ${j.by}${j.finishedAt ? ` · xong ${when(j.finishedAt)}` : ''}` }),
    r.reason ? el('div', { textContent: r.reason }) : null,
    r.declarationUpdated ? el('p', { className: 'hint', textContent: 'Tờ khai báo ở máy này đã được ghi lại. Nhớ commit và đẩy repo deploy để tờ khai báo trên GitHub khớp.' }) : null,
    r.log && r.log.length ? el('pre', { textContent: r.log.join('\n') }) : null,
  ]);
}

export function jobList(jobs) {
  return jobs.length ? jobs.map(jobBox) : [el('p', { className: 'hint', textContent: 'Chưa có việc nào.' })];
}
