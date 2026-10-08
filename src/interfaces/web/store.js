// Trạng thái của trang và mọi thao tác đổi nó. Màn hình chỉ đọc `state` và gọi `actions`; không màn nào tự gọi máy chủ.
import { api, errorOf } from './api.js';

export const state = {
  view: 'loading', // loading | login | overview | service | run
  loginError: '',
  filters: { projectId: 'all', environmentId: 'all', status: 'all', q: '' },
  overview: null, // câu trả lời của GET /api/v1/overview
  error: '', // lỗi của lần đọc gần nhất
  collapsed: {}, // nhóm dự án đang gập
  selected: {}, // dịch vụ đang được chọn để thao tác nhiều cái một lượt
  serviceId: null, service: null, serviceTab: 'deployments',
  dialog: null, // { kind, environmentId, items: [{serviceId, targetSha}], pre, loading, error, commits: {dịch-vụ: [...]}, sending }
  run: null, // { id, data, log: [], after }
  activeRuns: [],
};

let render = () => {};
let lastPainted = '';
/** Vẽ lại khi dữ liệu thật sự đổi (lần hỏi định kỳ trả cùng dữ liệu thì không vẽ lại, để ô chọn đang mở không bị đóng). */
function paint(force) {
  const snap = JSON.stringify(state);
  if (!force && snap === lastPainted) return;
  lastPainted = snap;
  render();
}
export function onRender(fn) { render = fn; }

const selectedIds = () => Object.keys(state.selected).filter((k) => state.selected[k]);

async function loadOverview() {
  const r = await api.overview(state.filters);
  if (r.status === 401) { state.view = 'login'; return paint(); }
  if (r.status !== 200) { state.error = errorOf(r); return paint(); }
  state.error = '';
  state.overview = r.body;
  if (state.view === 'loading' || state.view === 'login') state.view = 'overview';
  paint();
}

async function loadService() {
  if (!state.serviceId) return;
  const r = await api.service(state.serviceId);
  if (r.status === 401) { state.view = 'login'; return paint(); }
  if (r.status !== 200) { state.error = errorOf(r); return paint(); }
  state.error = '';
  state.service = r.body;
  paint();
}

async function loadActiveRuns() {
  const r = await api.activeRuns();
  if (r.status === 200) { state.activeRuns = r.body.items; paint(); }
}

async function pollRun() {
  const cur = state.run;
  if (!cur) return;
  const [r, logs] = await Promise.all([api.run(cur.id), api.runLogs(cur.id, cur.after)]);
  if (state.run !== cur) return;
  if (r.status === 200) cur.data = r.body;
  if (logs.status === 200 && logs.body.items.length) { cur.log.push(...logs.body.items); cur.after = cur.log[cur.log.length - 1].seq; }
  paint();
}

async function preflight() {
  const d = state.dialog;
  if (!d) return;
  d.loading = true; d.error = ''; paint();
  const r = await api.preflight({ kind: d.kind, environmentId: d.environmentId, items: d.items.map((i) => ({ serviceId: i.serviceId, ...(i.targetSha ? { targetSha: i.targetSha } : {}) })) });
  if (state.dialog !== d) return;
  d.loading = false;
  if (r.status === 200) { d.pre = r.body; for (const it of r.body.items) { const mine = d.items.find((x) => x.serviceId === it.serviceId); if (mine && !mine.targetSha && it.to) mine.targetSha = it.to.sha; } }
  else { d.pre = null; d.error = errorOf(r); }
  paint();
}

export const actions = {
  async boot() { paint(true); await loadOverview(); await loadActiveRuns(); },
  async login(password) {
    const r = await api.login(password);
    if (r.status !== 200) { state.loginError = r.status === 429 ? 'Sai quá nhiều lần, chờ một phút rồi thử lại.' : 'Mật khẩu không đúng.'; return paint(true); }
    state.loginError = ''; state.view = 'loading'; paint();
    await actions.boot();
  },
  async logout() { await api.logout(); state.view = 'login'; state.overview = null; paint(); },
  goOverview() { state.view = 'overview'; state.serviceId = null; state.service = null; paint(); loadOverview(); },
  setFilter(patch) { Object.assign(state.filters, patch); paint(); loadOverview(); },
  toggleGroup(id) { state.collapsed[id] = !state.collapsed[id]; paint(); },
  toggleSelect(id) { state.selected[id] = !state.selected[id]; paint(); },
  selectAll(ids, on) { for (const id of ids) state.selected[id] = on; paint(); },
  clearSelection() { state.selected = {}; paint(); },
  selectedIds,
  openService(id) { state.view = 'service'; state.serviceId = id; state.service = null; state.serviceTab = 'deployments'; paint(); loadService(); },
  setServiceTab(tab) { state.serviceTab = tab; paint(); },
  /** Mở hộp thoại Deploy hoặc Rollback cho một hay nhiều dịch vụ. opts: { environmentId?, targetSha? (chỉ khi một dịch vụ) }. */
  async openDialog(kind, serviceIds, opts = {}) {
    const envs = (state.overview && state.overview.allEnvironments) || [];
    if (!serviceIds.length || !envs.length) return;
    state.dialog = { kind, environmentId: opts.environmentId || envs[0].id, items: serviceIds.map((id) => ({ serviceId: id, targetSha: serviceIds.length === 1 ? opts.targetSha || null : null })), pre: null, loading: true, error: '', commits: {}, sending: false };
    paint();
    preflight();
    // Danh sách commit để chọn commit đích: lấy một lần cho mỗi dịch vụ trong hộp thoại.
    for (const id of serviceIds) api.service(id).then((r) => { if (state.dialog && r.status === 200) { state.dialog.commits[id] = r.body.commits; paint(); } });
  },
  closeDialog() { state.dialog = null; paint(); },
  dialogEnvironment(id) { const d = state.dialog; if (!d) return; d.environmentId = id; for (const i of d.items) i.targetSha = null; preflight(); },
  dialogTarget(serviceId, sha) { const d = state.dialog; if (!d) return; const it = d.items.find((x) => x.serviceId === serviceId); if (it) it.targetSha = sha; preflight(); },
  async confirmDialog() {
    const d = state.dialog;
    if (!d || d.sending) return;
    d.sending = true; paint();
    const r = await api.start({ kind: d.kind, environmentId: d.environmentId, items: d.items.map((i) => ({ serviceId: i.serviceId, targetSha: i.targetSha })) });
    if (state.dialog !== d) return;
    d.sending = false;
    if (r.status !== 201) { d.error = errorOf(r); if (r.body.error && r.body.error.details && r.body.error.details.preflight) d.pre = r.body.error.details.preflight; return paint(); }
    state.dialog = null; state.selected = {};
    actions.openRun(r.body.runId, r.body.run);
  },
  openRun(id, data = null) { state.view = 'run'; state.run = { id, data, log: [], after: 0 }; paint(); pollRun(); loadActiveRuns(); },
  /** Gọi định kỳ từ main.js. */
  tick(n) {
    if (state.view === 'run' && state.run && (!state.run.data || state.run.data.status === 'running')) pollRun();
    if (n % 5 === 0) {
      if (state.view === 'overview' && !state.dialog) loadOverview();
      if (state.view === 'service' && !state.dialog) loadService();
      if (state.view !== 'login' && state.view !== 'loading') loadActiveRuns();
    }
  },
};
