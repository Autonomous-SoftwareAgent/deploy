// spec: BDK-S-004
// Trạng thái và thao tác của phần cấu hình, phân quyền, duyệt và sổ thao tác. Bản NHÁP nằm ở trình duyệt; chỉ khi bấm lưu
// máy chủ mới kiểm và ghi thành một phiên bản mới. Màn hình chỉ đọc state.cfg và gọi các hàm ở đây.
import { api, errorOf } from './api.js';
import { state, paint } from './store.js';

const copy = (v) => JSON.parse(JSON.stringify(v));
const fresh = () => ({ tab: 'environments', loaded: null, draft: null, note: '', preview: null, error: '', saving: false, users: null, roles: [], shownPassword: null, matrix: null, tester: null, audit: null, auditFilter: { actor: '', action: '', outcome: '', q: '' }, confirmWord: '', importText: '', importError: '' });
state.cfg = fresh();
state.approvals = [];
state.me = null;

export const isDirty = () => !!state.cfg.loaded && JSON.stringify(state.cfg.loaded.config) !== JSON.stringify(state.cfg.draft);

async function loadConfig(keepDraft) {
  const r = await api.config();
  if (r.status !== 200) { state.cfg.error = errorOf(r); return paint(); }
  state.cfg.loaded = r.body;
  if (!keepDraft || !state.cfg.draft) state.cfg.draft = copy(r.body.config);
  state.cfg.error = '';
  paint();
}

async function loadSide() {
  const tab = state.cfg.tab;
  if (tab === 'matrix' || tab === 'rules') { const r = await api.branchMatrix(); if (r.status === 200) state.cfg.matrix = r.body.items; }
  if (tab === 'access' && state.cfg.loaded && state.cfg.loaded.canEdit) { const r = await api.users(); if (r.status === 200) { state.cfg.users = r.body.items; state.cfg.roles = r.body.roles; } }
  if (tab === 'history') { const r = await api.audit(state.cfg.auditFilter); if (r.status === 200) state.cfg.audit = r.body; }
  paint();
}

/** Sau một lệnh ghi của người dùng: báo lỗi nếu có, không thì nạp lại phần liên quan. */
async function after(r, reload) {
  if (r.status >= 400 || r.status === 0) { state.cfg.error = errorOf(r); return paint(); }
  state.cfg.error = '';
  await reload(r);
}

export const configActions = {
  async openConfig(tab) { state.view = 'config'; state.cfg.tab = tab; state.cfg.preview = null; state.cfg.tester = null; paint(); await loadConfig(true); await loadSide(); },
  /** Sửa bản nháp bằng một hàm đổi tại chỗ. */
  edit(change) { change(state.cfg.draft); state.cfg.preview = null; paint(); },
  setNote(v) { state.cfg.note = v; },
  discard() { state.cfg.draft = copy(state.cfg.loaded.config); state.cfg.preview = null; state.cfg.error = ''; paint(); },
  async preview() { const r = await api.configPreview(state.cfg.draft); await after(r, async () => { state.cfg.preview = r.body; paint(); }); },
  async save() {
    state.cfg.saving = true; paint();
    const r = await api.configSave({ config: state.cfg.draft, expectedVersion: state.cfg.loaded.version, note: state.cfg.note });
    state.cfg.saving = false;
    await after(r, async () => { state.cfg.note = ''; state.cfg.preview = null; await loadConfig(false); await loadSide(); });
  },
  async restore(version) { await after(await api.configRestore(version), async () => { await loadConfig(false); await loadSide(); }); },
  async filterAudit(patch) { Object.assign(state.cfg.auditFilter, patch); await loadSide(); },
  setConfirmWord(v) { state.cfg.confirmWord = v; paint(); },
  async reset() { state.cfg.confirmWord = ''; await after(await api.configReset(), async () => { await loadConfig(false); }); },
  setImport(v) { state.cfg.importText = v; },
  applyImport(badJson) {
    try { const parsed = JSON.parse(state.cfg.importText); state.cfg.draft = parsed && parsed.config ? parsed.config : parsed; state.cfg.importError = ''; state.cfg.preview = null; }
    catch (e) { state.cfg.importError = badJson(e.message); }
    paint();
  },
  async testBranch(branch, serviceId) { const r = await api.branchTest({ branch, serviceId: serviceId || undefined }); await after(r, async () => { state.cfg.tester = r.body; paint(); }); },
  async addUser(name, role) { const r = await api.userAdd({ name, role }); await after(r, async () => { state.cfg.shownPassword = { name: r.body.user.name, password: r.body.password }; await loadSide(); }); },
  async setRole(name, role) { await after(await api.userRole(name, role), loadSide); },
  async removeUser(name) { await after(await api.userRemove(name), loadSide); },
  async resetPassword(name) { const r = await api.userPassword(name); await after(r, async () => { state.cfg.shownPassword = { name, password: r.body.password }; paint(); }); },
  hidePassword() { state.cfg.shownPassword = null; paint(); },

  async openApprovals() { state.view = 'approvals'; paint(); await configActions.loadApprovals(); },
  async loadApprovals() { const r = await api.approvals(); if (r.status === 200) { state.approvals = r.body.items; paint(); } },
  async decide(id, approve, openRun) {
    const r = await api.approvalDecide(id, approve);
    await after(r, async () => { await configActions.loadApprovals(); if (r.body.run) openRun(r.body.run.id, r.body.run); });
  },
  async loadMe() { const r = await api.me(); if (r.status === 200) { state.me = r.body; paint(); } },
};
