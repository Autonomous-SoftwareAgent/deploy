'use strict';
// Khung chung của hai lệnh deploy và rollback: kiểm tên dịch vụ, gọi ca sử dụng, in kết quả dạng chữ hoặc MỘT đối tượng JSON.
// Thêm --events (đi cùng --json): mỗi dòng diễn giải và mỗi bước được in NGAY thành một dòng JSON có trường "event"
// ({event:'log',text} hoặc {event:'step',step,status,phase}), để bên gọi theo dõi được tiến trình; dòng cuối vẫn là kết quả.

/** action: 'deploy' | 'rollback'; call(ctx, name, say) gọi ca sử dụng tương ứng. */
function makeSwitchCommand({ action, usage, call }) {
  return {
    name: action,
    usage,
    async run(ctx) {
      const { manifest, args, json, say, flags } = ctx;
      const events = json && flags.has('events');
      const name = args[0];
      if (!name || !manifest.services[name]) { say(`Dùng: node infra/bsn.js ${action} <dịch-vụ> [commit] [--apply] [--json]. Có: ${Object.keys(manifest.services).join(', ')}`); return 1; }
      // Với --json chỉ in MỘT đối tượng ở cuối; các dòng diễn giải được gom vào trường "log" của đối tượng đó.
      const lines = [];
      const narrate = json ? (x) => { lines.push(x); if (events) say(JSON.stringify({ event: 'log', text: x })); } : say;
      const step = events ? (stepName, status, phase) => say(JSON.stringify({ event: 'step', step: stepName, status, phase })) : undefined;
      let res;
      try { res = await call({ ...ctx, step }, name, narrate); }
      catch (e) { res = { ok: false, service: name, action, reason: e.message }; }
      if (json) say(JSON.stringify({ ...res, log: lines }));
      else if (!res.ok) say(`${action.toUpperCase()} KHÔNG THÀNH: ${res.reason}`);
      return res.ok ? 0 : 1;
    },
  };
}

module.exports = { makeSwitchCommand };
