'use strict';
// Ca sử dụng của bảng điều khiển theo MÔI TRƯỜNG: tổng quan mọi dịch vụ ở mọi môi trường, chi tiết một dịch vụ, và kiểm tra
// trước một yêu cầu deploy hay rollback. Chỉ đọc. Môi trường là dữ liệu: danh sách do composition đưa vào, không tên nào viết cứng.
//   environments: [{ id, name, color, description, kind, status(): Promise<{ok, services?, error?}> }]
//   catalog: nguồn chung của máy chạy bảng điều khiển: tờ khai báo, lịch sử commit, nhãn trên kho (xem catalog.js).
const fleet = require('../domain/fleet');
const access = require('../domain/access');
const branches = require('../domain/branches');
const { short, COMMIT_RE } = require('../domain/naming');

const UNGROUPED = 'Ungrouped';
const refuse = (outcome, reason) => ({ ok: false, outcome, reason });

function makeFleet({ environments, catalog, settings, clock }) {
  const envById = (id) => environments.find((e) => e.id === id) || null;

  /** Cấu hình hiện hành và danh sách môi trường theo thứ tự, màu, mức bảo vệ đã đặt trong cấu hình. */
  async function shape() {
    const { config } = await settings.get();
    const of = (e) => config.environments[e.id];
    const view = (e) => ({ id: e.id, name: e.name, color: of(e).color || e.color, description: of(e).description || e.description || '', kind: e.kind, order: of(e).order, protected: access.isProtected(of(e).protect), protect: of(e).protect });
    return { config, view, ordered: [...environments].sort((a, b) => of(a).order - of(b).order || a.id.localeCompare(b.id)) };
  }

  /** Trạng thái của mọi môi trường, hỏi song song. Một môi trường không trả lời không làm hỏng các môi trường khác. */
  async function snapshot(only) {
    const list = only ? environments.filter((e) => e.id === only) : environments;
    const states = await Promise.all(list.map(async (e) => {
      try { const s = await e.status(); return [e.id, s && s.ok ? { reachable: true, rows: new Map(s.services.map((r) => [r.service, r])) } : { reachable: false, error: (s && s.error) || 'could not read the environment state', rows: new Map() }]; }
      catch (err) { return [e.id, { reachable: false, error: err.message, rows: new Map() }]; }
    }));
    return new Map(states);
  }

  const commitView = (info, sha) => (sha ? { sha, shortSha: short(sha), message: info.bySha.get(sha) ? info.bySha.get(sha).message : null, author: info.bySha.get(sha) ? info.bySha.get(sha).author : null } : null);

  function cellOf(state, info, name, mapping) {
    if (!state.reachable) return { deployed: false, unreachable: true, error: state.error };
    const row = state.rows.get(name);
    if (!row) return { deployed: false, absent: true };
    const health = fleet.healthOf(row);
    if (!row.running && !health) return { deployed: false };
    const running = row.runningCommit || (row.deployed && row.deployed.commit) || null;
    return {
      deployed: true, commit: commitView(info, running), health, containerStatus: row.containerStatus || null,
      deployedAt: row.deployed ? row.deployed.at : null, deployedBy: row.lastAttempt ? row.lastAttempt.by || null : null,
      mapping,
      head: info.declared ? { sha: info.declared, shortSha: short(info.declared) } : null,
      behindCount: fleet.behindCount(info.shas, running, info.declared),
      // Khác bản đã khai mà không đếm được số commit (bản đang chạy không có trong lịch sử ở máy này): vẫn phải cho thấy là lệch.
      differsFromDeclared: !!info.declared && !!running && running !== info.declared,
    };
  }

  /** filters: { projectId?, environmentId?, status?, q? }. Trả dạng của GET /overview trong design/deploy-console.api.md. */
  async function overview(filters = {}) {
    const m = await catalog.manifest();
    if (!m.ok) return m;
    const states = await snapshot();
    const { config, view, ordered } = await shape();
    const names = Object.keys(m.manifest.services);
    const infos = new Map(await Promise.all(names.map(async (n) => [n, await catalog.service(n)])));
    const shown = filters.environmentId ? ordered.filter((e) => e.id === filters.environmentId) : ordered;
    const q = String(filters.q || '').trim().toLowerCase();
    const all = names.map((name) => {
      const info = infos.get(name);
      const project = info.project || UNGROUPED;
      const cells = Object.fromEntries(environments.map((e) => [e.id, cellOf(states.get(e.id), info, name, branches.resolve(config.branches, name, project, e.id))]));
      const live = Object.values(cells).filter((c) => c.deployed);
      return { id: name, name, kind: info.kind, project, priorityScore: fleet.priorityScore(live), configWarnings: info.declared ? [] : [{ code: 'NOT_DECLARED' }], cells };
    });
    const has = (svc, test) => Object.values(svc.cells).some((c) => c.deployed && test(c));
    const summary = {
      services: all.length, failed: all.filter((s) => has(s, (c) => c.health === fleet.HEALTH.FAILED)).length,
      deploying: all.filter((s) => has(s, (c) => c.health === fleet.HEALTH.DEPLOYING)).length, degraded: 0,
      behind: all.filter((s) => has(s, (c) => c.behindCount > 0)).length,
    };
    const pass = all.filter((svc) => {
      if (filters.projectId && svc.project !== filters.projectId) return false;
      const scope = shown.map((e) => svc.cells[e.id]).filter((c) => c.deployed);
      if (q && !svc.name.toLowerCase().includes(q) && !scope.some((c) => c.commit && c.commit.message && c.commit.message.toLowerCase().includes(q))) return false;
      if (filters.status && filters.status !== 'all') return scope.some((c) => (filters.status === 'behind' ? c.behindCount > 0 : c.health === filters.status));
      return true;
    }).map((svc) => ({ ...svc, cells: Object.fromEntries(shown.map((e) => [e.id, svc.cells[e.id]])) }));
    const projects = [...new Set(all.map((s) => s.project))];
    const groups = projects.map((p) => {
      const services = pass.filter((s) => s.project === p).sort((a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name));
      return { project: { id: p, name: p }, attentionCount: services.filter((s) => s.priorityScore > 0).length, services };
    }).filter((g) => g.services.length).sort((a, b) => Math.max(...b.services.map((s) => s.priorityScore)) - Math.max(...a.services.map((s) => s.priorityScore)) || a.project.name.localeCompare(b.project.name));
    return {
      ok: true, environments: shown.map(view), allEnvironments: ordered.map(view),
      projects: projects.map((p) => ({ id: p, name: p })), summary, groups,
      unreachable: environments.filter((e) => !states.get(e.id).reachable).map((e) => ({ environmentId: e.id, name: e.name, error: states.get(e.id).error })),
    };
  }

  /** Chi tiết một dịch vụ: thông tin, từng môi trường, lịch sử commit (kèm đã có bản chưa, đang chạy ở đâu), dòng thời gian deploy. */
  async function service(id) {
    const m = await catalog.manifest();
    if (!m.ok) return m;
    if (!m.manifest.services[id]) return refuse('UNKNOWN_SERVICE', `unknown service ${id}`);
    const info = await catalog.service(id);
    const states = await snapshot();
    const { config, view, ordered } = await shape();
    const project = info.project || UNGROUPED;
    const cells = ordered.map((e) => ({ environment: view(e), ...cellOf(states.get(e.id), info, id, branches.resolve(config.branches, id, project, e.id)) }));
    const runningIn = (sha) => cells.filter((c) => c.deployed && c.commit && c.commit.sha === sha).map((c) => c.environment.id);
    const commits = info.log.map((c) => ({ sha: c.sha, shortSha: short(c.sha), message: c.message, author: c.author, committedAt: c.at, build: fleet.buildOf(info.tags, info.branch, c.sha), declared: c.sha === info.declared, runningIn: runningIn(c.sha) }));
    const deployments = [];
    for (const e of environments) {
      const row = states.get(e.id).rows.get(id);
      for (const h of (row && row.history) || []) deployments.push({ environmentId: e.id, environmentName: e.name, kind: h.action, commit: commitView(info, h.commit), from: h.from ? short(h.from) : null, result: h.result, reason: h.reason || '', at: h.at, by: h.by || '' });
    }
    deployments.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return {
      ok: true,
      service: { id, name: id, kind: info.kind, project, repo: info.repo, declared: commitView(info, info.declared), healthCheck: { path: m.manifest.services[id].health }, historyAvailable: info.log.length > 0, registryReachable: info.tags !== null },
      environments: cells, commits, deployments, variables: fleet.variablesOf(m.manifest.services[id]),
    };
  }

  /**
   * Kiểm tra trước một yêu cầu. input: { kind, environmentId, items: [{ serviceId, targetSha? }] }.
   * targetSha bỏ trống: deploy lấy commit đã khai, rollback lấy bản liền trước ghi trong sổ của môi trường.
   * actor: { name, role } của người gọi; cổng an toàn (quyền, giới hạn người, giờ khóa, gõ tên, duyệt) tính theo người đó.
   */
  async function preflight({ kind, environmentId, items, actor }) {
    if (!['deploy', 'rollback'].includes(kind)) return refuse('BAD_INPUT', 'kind must be deploy or rollback');
    const env = envById(environmentId);
    if (!env) return refuse('UNKNOWN_ENVIRONMENT', `unknown environment ${environmentId}`);
    if (!Array.isArray(items) || !items.length || items.length > 50) return refuse('BAD_INPUT', 'items must hold 1 to 50 entries');
    if (new Set(items.map((i) => i && i.serviceId)).size !== items.length) return refuse('BAD_INPUT', 'each service may appear only once');
    const m = await catalog.manifest();
    if (!m.ok) return m;
    const state = (await snapshot(env.id)).get(env.id);
    const out = [];
    for (const it of items) {
      const id = it && it.serviceId;
      if (typeof id !== 'string' || !m.manifest.services[id]) return refuse('UNKNOWN_SERVICE', `unknown service ${JSON.stringify(id)}`);
      if (it.targetSha !== undefined && it.targetSha !== null && !COMMIT_RE.test(it.targetSha)) return refuse('BAD_INPUT', `targetSha of ${id} must be a full 40-character commit id`);
      const info = await catalog.service(id);
      const row = state.rows.get(id) || null;
      const target = it.targetSha || (kind === 'rollback' ? (row && row.previous) || null : info.declared);
      const res = fleet.preflightItem({ kind, reachable: state.reachable, row, target, shas: info.shas, build: target ? fleet.buildOf(info.tags, info.branch, target) : fleet.BUILD.UNKNOWN, name: id, environmentName: env.name });
      const suggestions = kind === 'rollback'
        ? fleet.ranOkCommits(row).filter((sha) => sha !== res.from).slice(0, 5).map((sha, i) => ({ label: i === 0 && sha === (row && row.previous) ? 'Previous version' : 'Ran healthy here', ...commitView(info, sha) }))
        : [info.declared && { label: 'Declared commit', ...commitView(info, info.declared) }].filter(Boolean);
      out.push({
        serviceId: id, from: commitView(info, res.from), to: target ? { ...commitView(info, target), build: fleet.buildOf(info.tags, info.branch, target) } : null,
        firstDeploy: res.firstDeploy, direction: res.direction, changes: res.changes.map((sha) => ({ ...commitView(info, sha), direction: res.direction })),
        suggestions, blockers: res.blockers, warnings: res.warnings,
      });
    }
    const { config, view } = await shape();
    const gate = access.gate({ cfg: config, envId: env.id, envName: env.name, kind, actor, minute: access.weekMinuteOf(new Date(clock.millis())), serviceIds: out.map((i) => i.serviceId) });
    return { ok: true, kind, environment: view(env), items: out, gate, canProceed: !gate.blockers.length && out.every((i) => !i.blockers.length) };
  }

  /** Mấy dòng log cuối của một dịch vụ ở một môi trường. */
  async function logs({ serviceId, environmentId, tail }) {
    const m = await catalog.manifest();
    if (!m.ok) return m;
    if (!m.manifest.services[serviceId]) return refuse('UNKNOWN_SERVICE', `unknown service ${serviceId}`);
    const env = envById(environmentId);
    if (!env) return refuse('UNKNOWN_ENVIRONMENT', `unknown environment ${environmentId}`);
    const res = await env.logs(serviceId, tail);
    return res.ok ? { ok: true, environmentId, lines: res.lines } : refuse('LOGS_UNAVAILABLE', res.reason);
  }

  /** Cổng an toàn cho một yêu cầu không qua kiểm tra trước (các đường /api cũ). */
  async function gateFor({ kind, environmentId, actor, serviceIds }) {
    const env = envById(environmentId);
    const { config } = await shape();
    return access.gate({ cfg: config, envId: env.id, envName: env.name, kind, actor, minute: access.weekMinuteOf(new Date(clock.millis())), serviceIds });
  }

  return { overview, service, preflight, logs, gateFor, environment: envById, environments: async () => { const { view, ordered } = await shape(); return ordered.map(view); } };
}

module.exports = { makeFleet, UNGROUPED };
