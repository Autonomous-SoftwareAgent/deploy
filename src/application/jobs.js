'use strict';
// Sổ các VIỆC của bảng điều khiển: nhận một việc deploy hay rollback, từ chối việc trùng dịch vụ, để dịch vụ khác chạy song song,
// giữ kết quả. Việc thật sự chạy ở đâu (tiến trình con, hay ngay trong tiến trình này) là chuyện của cổng JobExecutor.
// Sổ này chỉ sống trong bộ nhớ của bảng điều khiển; lịch sử lâu dài là sổ deploy của đích.
const { OUTCOME } = require('../domain/outcome');

const KEEP = 50;

/** @param {{jobExecutor: import('./ports').JobExecutor, clock: import('./ports').Clock, random: import('./ports').Random}} ports */
function makeJobs({ jobExecutor, clock, random }) {
  const jobs = []; // mới nhất ở cuối
  const view = (j) => ({ id: j.id, service: j.service, action: j.action, commit: j.commit, by: j.by, startedAt: j.startedAt, finishedAt: j.finishedAt, state: j.state, ok: j.result ? !!j.result.ok : null, result: j.result });
  const runningFor = (service) => jobs.find((j) => j.service === service && j.state === 'running') || null;

  /** Trả {ok:true, job} hoặc {ok:false, outcome: BUSY, job: việc đang chạy}. */
  function start({ service, action, commit = null, by }) {
    const busy = runningFor(service);
    if (busy) return { ok: false, outcome: OUTCOME.BUSY, job: view(busy) };
    const job = { id: random.bytes(6).toString('hex'), service, action, commit, by, startedAt: clock.now(), finishedAt: null, state: 'running', result: null };
    jobs.push(job);
    if (jobs.length > KEEP) jobs.splice(0, jobs.length - KEEP);
    job.done = jobExecutor.run({ service, action, commit, by })
      .catch((e) => ({ ok: false, service, action, outcome: OUTCOME.UNEXPECTED, reason: e.message }))
      .then((result) => { job.result = result; job.state = 'done'; job.finishedAt = clock.now(); });
    return { ok: true, job: view(job) };
  }

  return {
    start,
    get: (id) => { const j = jobs.find((x) => x.id === id); return j ? view(j) : null; },
    recent: (n) => jobs.slice(-n).reverse().map(view),
    runningId: (service) => { const j = runningFor(service); return j ? j.id : null; },
    /** Chờ mọi việc đang chạy xong (cho test và cho lúc tắt). */
    settle: () => Promise.all(jobs.map((j) => j.done)),
  };
}

module.exports = { makeJobs };
