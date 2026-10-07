// Đọc trạng thái của một dịch vụ thành điều người vận hành cần biết: nhãn, nút nào bấm được, lời nhắc. Thuần, không đụng DOM.

/** Các commit đã từng chạy khỏe ở đây (trừ bản đang chạy): những bản có thể lùi về. */
export const rollbackTargets = (s) => [...new Set(s.history.filter((h) => h.result === 'ok').map((h) => h.commit))].filter((c) => c !== s.runningCommit);

export function describe(s) {
  const busy = !!(s.job || s.busy);
  const targets = rollbackTargets(s);
  let label; let kind;
  if (busy) [label, kind] = ['Đang đưa lên…', 'warn'];
  else if (!s.running) [label, kind] = ['Không chạy', 'bad'];
  else if (!s.declared) [label, kind] = ['Chưa khai commit', 'idle'];
  else if (s.matches) [label, kind] = ['Đang chạy đúng bản đã khai', 'ok'];
  else if (s.image.present === false) [label, kind] = ['Bản đã khai đang chờ build', 'idle'];
  else [label, kind] = ['Có bản mới chờ deploy', 'warn'];

  let hint = '';
  if (busy) hint = 'Đang có một lần đưa lên chạy dở cho dịch vụ này; nút mở lại khi nó xong.';
  else if (s.declared && s.image.present === false) hint = 'Chưa deploy được: commit đã khai chưa có bản đóng gói. Bản sinh ra khi commit đó được đẩy lên main của dịch vụ và test qua.';
  else if (s.running && s.matches === false && s.lastAttempt && s.lastAttempt.result !== 'ok') hint = 'Tờ khai báo đang khác bản chạy vì lần đưa lên gần nhất hỏng. Dịch vụ cần khai một commit đã sửa, hoặc rollback để tờ khai báo khớp lại.';
  else if (!targets.length) hint = 'Chưa có bản nào khác đã từng chạy khỏe ở đây để lùi về.';

  return {
    label, kind, hint, busy, targets,
    canDeploy: !busy && !!s.declared && s.image.present !== false && !(s.running && s.matches),
    canRollback: !busy && targets.length > 0,
  };
}
