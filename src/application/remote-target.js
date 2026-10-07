'use strict';
// ĐÍCH TỪ XA cho bảng điều khiển: hệ chạy trên một máy khác, bảng điều khiển ở máy này chỉ RA LỆNH cho máy đó chạy đúng
// lệnh điều khiển (bsn.js) tại chỗ, qua cổng RemoteShell. Luật deploy, sổ deploy, khóa và bí mật đều nằm ở máy đích;
// tệp này không quyết định gì, nó chỉ đọc đầu ra --json (giao diện công bố của lệnh điều khiển).
// spec: BDK-S-002
const { NAME_RE, COMMIT_RE, COMMIT_PREFIX_RE } = require('../domain/naming');

const ACTOR_RE = /^[a-z0-9:_-]{1,40}$/;
const JOB_RE = /^[a-f0-9]{8,32}$/;
const STATUS_FRESH_MS = 1000;

/** Các dòng là đối tượng JSON trong đầu ra (bỏ qua mọi dòng chữ mà SSH hay shell chen vào). */
function jsonLines(text) {
  const out = [];
  for (const line of String(text).split('\n')) { const s = line.trim(); if (s.startsWith('{')) { try { out.push(JSON.parse(s)); } catch { /* không phải JSON */ } } }
  return out;
}

const tail = (res) => (res.stderr || res.stdout).trim().split('\n').slice(-3).join(' ') || 'không có đầu ra';

/** Các đoạn lệnh chạy trên máy đích. Mọi giá trị chen vào đều đã được kiểm dạng ở đây, nên không cần trích dẫn thêm. */
function scripts(root) {
  const cli = `cd ${root} && node infra/bsn.js`;
  const jobs = `${root}/infra/local/.run/jobs`;
  return {
    status: () => `${cli} status --json`,
    images: () => `${cli} images --json`,
    /** Bắt đầu một việc TÁCH RỜI khỏi phiên SSH: phiên rớt hay bảng điều khiển tắt thì việc vẫn chạy tới cuối. */
    start({ id, action, service, commit, by }) {
      if (!JOB_RE.test(id) || !['deploy', 'rollback'].includes(action) || !NAME_RE.test(service) || !ACTOR_RE.test(by)) throw new Error('tham số của việc không hợp lệ');
      if (commit && !(COMMIT_RE.test(commit) || COMMIT_PREFIX_RE.test(commit))) throw new Error('mã commit không hợp lệ');
      const run = `BSN_ACTOR=${by} node infra/bsn.js ${action} ${service}${commit ? ` ${commit}` : ''} --apply --json > ${jobs}/${id}.out 2> ${jobs}/${id}.err; echo $? > ${jobs}/${id}.code`;
      return `mkdir -p ${jobs} && cd ${root} && (setsid nohup sh -c '${run}' > /dev/null 2>&1 < /dev/null &) && echo '{"started":"${id}"}'`;
    },
    /** Việc xong chưa: có tệp .code thì in mã thoát, đầu ra và mấy dòng lỗi cuối; chưa thì in dấu đang chạy. */
    poll(id) {
      if (!JOB_RE.test(id)) throw new Error('mã việc không hợp lệ');
      return `if [ -f ${jobs}/${id}.code ]; then echo "{\\"done\\":true,\\"code\\":$(cat ${jobs}/${id}.code)}"; cat ${jobs}/${id}.out; echo; echo "ERR: $(tail -n 4 ${jobs}/${id}.err | tr '\\n' ' ')"; else echo '{"done":false}'; fi`;
    },
  };
}

/**
 * Ba hàm cùng hình dạng với các ca sử dụng check, getStatus, getImages, để lắp vào ca sử dụng của bảng điều khiển.
 * @param {{shell: import('./ports').RemoteShell, clock: import('./ports').Clock, root: string}} deps
 */
function makeRemoteTarget({ shell, clock, root }) {
  const sh = scripts(root);
  let fresh = { at: -Infinity, value: null };

  /** Trạng thái của máy đích. check và getStatus được gọi liền nhau cho một lần vẽ trang: dùng chung một lần gọi sang máy đích. */
  async function status() {
    if (fresh.value && clock.millis() - fresh.at < STATUS_FRESH_MS) return fresh.value;
    const res = await shell.exec(sh.status());
    const objects = jsonLines(res.stdout);
    const ok = objects.find((o) => Array.isArray(o.services)) || null;
    const broken = objects.find((o) => o.ok === false && Array.isArray(o.errors));
    const error = ok ? '' : broken ? `tờ khai báo trên máy đích không hợp lệ: ${broken.errors.join('; ')}` : `không đọc được trạng thái từ máy đích (mã thoát ${res.code}): ${tail(res)}`;
    fresh = { at: clock.millis(), value: { status: ok, error, unreachable: !ok && !broken } };
    return fresh.value;
  }

  return {
    async check() {
      const s = await status();
      if (!s.status) return { ok: false, unreachable: s.unreachable, errors: [s.error], reposChecked: true, manifest: null };
      return { ok: true, errors: [], reposChecked: true, manifest: { services: Object.fromEntries(s.status.services.map((x) => [x.service, {}])), platform: null } };
    },
    async getStatus() { return (await status()).status; },
    /** Hỏi kho bản là việc chậm (máy đích đi ra Docker Hub): ca sử dụng của bảng điều khiển giữ kết quả này một lúc. */
    async getImages() {
      const found = jsonLines((await shell.exec(sh.images())).stdout).find((o) => Array.isArray(o.images));
      return found || { ok: false, waiting: [], images: [] };
    },
    forget: () => { fresh = { at: -Infinity, value: null }; },
  };
}

module.exports = { makeRemoteTarget, scripts, jsonLines };
