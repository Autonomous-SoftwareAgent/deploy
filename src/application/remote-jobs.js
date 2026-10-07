'use strict';
// Cổng JobExecutor cho ĐÍCH TỪ XA, dựng trên cổng RemoteShell: bảo máy đích bắt đầu một việc tách rời khỏi phiên SSH,
// rồi hỏi lại định kỳ tới khi việc xong. Phiên SSH rớt hay bảng điều khiển tắt giữa chừng thì việc trên máy đích vẫn chạy tới cuối.
const { scripts, jsonLines } = require('./remote-target');

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{shell: import('./ports').RemoteShell, random: import('./ports').Random, root: string,
 *          pollMs?: number, maxPolls?: number, sleep?: (ms: number) => Promise<void>, onSettled?: () => void}} deps
 */
function makeRemoteJobExecutor({ shell, random, root, pollMs = 3000, maxPolls = 400, sleep = defaultSleep, onSettled = () => {} }) {
  const sh = scripts(root);
  const fail = (service, action, reason) => ({ ok: false, service, action, reason });

  return {
    async run({ service, action, commit, by }) {
      const id = random.bytes(8).toString('hex');
      const started = await shell.exec(sh.start({ id, action, service, commit, by }));
      if (!jsonLines(started.stdout).some((o) => o.started === id)) {
        return fail(service, action, `không bắt đầu được việc trên máy đích (mã thoát ${started.code}): ${(started.stderr || started.stdout).trim().split('\n').slice(-3).join(' ')}`);
      }
      let lost = 0;
      for (let i = 0; i < maxPolls; i++) {
        await sleep(pollMs);
        const res = await shell.exec(sh.poll(id));
        const lines = jsonLines(res.stdout);
        const mark = lines.find((o) => typeof o.done === 'boolean');
        // Không hỏi được (mạng rớt): việc vẫn đang chạy ở máy đích, cứ hỏi lại; chỉ bỏ cuộc sau nhiều lần liên tiếp.
        if (!mark) { if (++lost >= 10) return fail(service, action, `mất liên lạc với máy đích khi đang chờ việc ${id}; việc có thể vẫn đang chạy ở đó: xem trạng thái trước khi bấm lại`); continue; }
        lost = 0;
        if (!mark.done) continue;
        onSettled();
        const result = lines.find((o) => o !== mark && typeof o.ok === 'boolean');
        const err = (/ERR: (.*)$/m.exec(res.stdout) || [])[1] || '';
        return result || fail(service, action, `lệnh trên máy đích không trả kết quả (mã thoát ${mark.code}): ${err.trim()}`);
      }
      return fail(service, action, `việc ${id} chưa xong sau ${Math.round((maxPolls * pollMs) / 60000)} phút; xem trạng thái trên máy đích`);
    },
  };
}

module.exports = { makeRemoteJobExecutor };
