'use strict';
// Ca sử dụng của BẢNG ĐIỀU KHIỂN: một trang trạng thái gộp (tờ khai báo, bản đang chạy, bản trên kho, sổ deploy, việc đang chạy)
// và việc nhận một yêu cầu Deploy hay Rollback. Người (trình duyệt) và agent (JSON) dùng chung hai hàm này.
// spec: BDK-S-001
const { NAME_RE, COMMIT_RE, COMMIT_PREFIX_RE } = require('../domain/naming');
const { OUTCOME } = require('../domain/outcome');

const ACTIONS = ['deploy', 'rollback'];
const refuse = (outcome, reason) => ({ ok: false, outcome, reason });

/**
 * @param {{check: Function, getStatus: Function, getImages: Function, jobs: ReturnType<import('./jobs').makeJobs>,
 *          clock: import('./ports').Clock, imagesTtlMs?: number}} deps
 */
function makeConsole({ check, getStatus, getImages, jobs, clock, imagesTtlMs = 30000 }) {
  let cached = { at: -Infinity, images: [] };

  async function manifest() {
    const checked = await check({ requireRepos: true });
    if (checked.ok) return { ok: true, manifest: checked.manifest };
    // Đích từ xa không trả lời là chuyện khác với tờ khai báo sai: nói đúng tên sự cố để người vận hành biết nhìn vào đâu.
    return checked.unreachable ? refuse('TARGET_UNREACHABLE', checked.errors.join('; ')) : refuse('INVALID_DECLARATIONS', `tờ khai báo không hợp lệ: ${checked.errors.join('; ')}`);
  }

  /** Hỏi kho là việc chậm (đi qua mạng): giữ kết quả một lúc; xong một việc thì hỏi lại. */
  async function images(m) {
    if (clock.millis() - cached.at > imagesTtlMs) cached = { at: clock.millis(), images: (await getImages({ manifest: m })).images };
    return new Map(cached.images.map((r) => [r.service, r]));
  }

  async function state() {
    const loaded = await manifest();
    if (!loaded.ok) return loaded;
    const status = await getStatus({ manifest: loaded.manifest });
    const img = await images(loaded.manifest);
    return {
      ok: true,
      dockerReachable: status.dockerReachable,
      services: status.services.map((s) => {
        const i = img.get(s.service) || {};
        return {
          service: s.service, declared: s.pinned, running: s.running, runningCommit: s.runningCommit,
          matches: s.running ? s.runningCommit === s.pinned : null, containerStatus: s.containerStatus, port: s.portLocal,
          image: { name: i.image || null, present: i.present === undefined ? null : !!i.present },
          deployed: s.deployed, previous: s.previous, lastAttempt: s.lastAttempt, history: s.history,
          busy: s.busy, job: jobs.runningId(s.service),
        };
      }),
      jobs: jobs.recent(10),
    };
  }

  /** Nhận một yêu cầu đưa lên. input: { service, action, commit?, by }. */
  async function request({ service, action, commit, by }) {
    if (!ACTIONS.includes(action)) return refuse('BAD_INPUT', 'việc phải là deploy hoặc rollback');
    if (typeof service !== 'string' || !NAME_RE.test(service)) return refuse('BAD_INPUT', 'tên dịch vụ không hợp lệ');
    const ref = commit === undefined || commit === null || commit === '' ? null : commit;
    if (ref !== null && (action !== 'rollback' || typeof ref !== 'string' || !(COMMIT_RE.test(ref) || COMMIT_PREFIX_RE.test(ref)))) return refuse('BAD_INPUT', 'mã commit phải gồm 7 đến 40 chữ số hệ 16, và chỉ dùng với rollback');
    const loaded = await manifest();
    if (!loaded.ok) return loaded;
    if (!loaded.manifest.services[service]) return refuse('UNKNOWN_SERVICE', `không có dịch vụ ${service}`);
    const started = jobs.start({ service, action, commit: ref, by });
    if (!started.ok) return { ...refuse(OUTCOME.BUSY, `${service} đang có một lần ${started.job.action} chạy dở (việc ${started.job.id}); chờ nó xong`), job: started.job };
    cached.at = -Infinity; // sau việc này bản trên kho và bản đang chạy có thể đã khác
    return started;
  }

  return { state, request, job: (id) => jobs.get(id) };
}

module.exports = { makeConsole };
