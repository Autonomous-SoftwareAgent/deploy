'use strict';
// DANH MỤC dịch vụ của bảng điều khiển: thứ mà mọi môi trường dùng chung và chỉ máy chạy bảng điều khiển biết:
// tờ khai báo (dịch vụ nào, nhóm nào, commit đã khai), lịch sử commit trong repo của dịch vụ, nhãn bản trên kho.
// Hỏi git và hỏi kho là việc chậm nên kết quả được giữ một lúc; xong một lần chạy thì gọi forget() để hỏi lại.

/**
 * @param {{check: Function, source: import('./ports').Source, registry: import('./ports').Registry, clock: import('./ports').Clock,
 *          historyLimit?: number, ttlMs?: number}} deps
 */
function makeCatalog({ check, source, registry, clock, historyLimit = 60, ttlMs = 20000 }) {
  let cached = new Map(); // tên dịch vụ -> { at, value }

  /** Tờ khai báo đã qua kiểm. Sai thì trả lỗi có tên để lớp ngoài đổi thành mã HTTP. */
  async function manifest() {
    const checked = await check({ requireRepos: false });
    return checked.ok ? { ok: true, manifest: checked.manifest } : { ok: false, outcome: 'INVALID_DECLARATIONS', reason: `invalid service declarations: ${checked.errors.join('; ')}` };
  }

  async function load(name, svc, platform) {
    const reg = (platform && platform.registry) || null;
    let log = [];
    // Máy không có repo của dịch vụ thì không có lịch sử commit: bảng điều khiển vẫn chạy, chỉ thiếu danh sách commit.
    try { if (await source.has(svc.repo)) log = await source.log(svc.repo, historyLimit); } catch { log = []; }
    const names = reg ? await registry.tags(`${reg.namespace}/${reg.repoPrefix || ''}${name}`) : null;
    return {
      repo: svc.repo, project: typeof svc.project === 'string' ? svc.project.trim() : null, kind: svc.kind || null, declared: svc.commit || null,
      branch: (reg && reg.branch) || 'main', log, shas: log.map((c) => c.sha), bySha: new Map(log.map((c) => [c.sha, c])),
      tags: names ? new Set(names) : null,
    };
  }

  /** Thông tin của một dịch vụ. Tờ khai báo luôn đọc mới (commit đã khai đổi là thấy ngay); git và kho thì dùng lại trong ttlMs. */
  async function service(name) {
    const m = await manifest();
    if (!m.ok || !m.manifest.services[name]) return { repo: null, project: null, kind: null, declared: null, branch: 'main', log: [], shas: [], bySha: new Map(), tags: null };
    const svc = m.manifest.services[name];
    const hit = cached.get(name);
    if (hit && clock.millis() - hit.at < ttlMs) return { ...hit.value, declared: svc.commit || null, project: typeof svc.project === 'string' ? svc.project.trim() : null, kind: svc.kind || null };
    const value = await load(name, svc, m.manifest.platform);
    cached.set(name, { at: clock.millis(), value });
    return value;
  }

  /** Tệp đổi giữa hai commit của một dịch vụ. Máy không có repo, hay không có một trong hai commit: null. */
  async function diff(name, from, to) {
    const info = await service(name);
    if (!info.repo || !info.shas.includes(from) || !info.shas.includes(to)) return null;
    try { return await source.diffStat(info.repo, from, to); } catch { return null; }
  }

  return { manifest, service, diff, forget: () => { cached = new Map(); } };
}

module.exports = { makeCatalog };
