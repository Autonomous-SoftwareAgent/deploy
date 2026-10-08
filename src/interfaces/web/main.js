// Cửa vào của giao diện: nối trạng thái với các màn và vẽ lại khi trạng thái đổi. Không có bước build; trình duyệt nạp thẳng các module.
import { mount, h } from './dom.js';
import { T } from './text.js';
import { state, actions, onRender } from './store.js';
import { sideView, deniedView } from './views/shell.js';
import { overviewView } from './views/overview.js';
import { serviceView } from './views/service.js';
import { dialogView } from './views/dialog.js';
import { runView } from './views/run.js';
import { configActions, isDirty } from './config-store.js';
import { configView } from './views/config.js';
import { approvalsView } from './views/approvals.js';

const side = document.getElementById('side');
const main = document.getElementById('main');
const overlay = document.getElementById('overlay');

Object.assign(actions, configActions);
const VIEWS = { denied: deniedView, overview: overviewView, service: serviceView, run: runView, config: configView, approvals: approvalsView, loading: () => h('div', { class: 'empty' }, T.loading) };

onRender(() => {
  mount(side, sideView(state, actions));
  mount(main, (VIEWS[state.view] || VIEWS.loading)(state, actions));
  mount(overlay, dialogView(state, actions));
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.dialog) actions.closeDialog(); });

let n = 0;
setInterval(() => { actions.tick(n += 1); if (n % 3 === 0 && state.view === 'config' && state.cfg.tab === 'environments') actions.pollEnvironments(); if (n % (state.live ? 60 : 10) === 0 && state.view !== 'denied' && state.view !== 'loading') actions.loadApprovals(); }, 1000);
actions.boot().then(() => {
  actions.loadMe(); actions.loadApprovals();
  actions.connectEvents((topic) => {
    if (topic === 'approvals') actions.loadApprovals();
    if (topic === 'environments' && state.view === 'config' && state.cfg.tab === 'environments') actions.pollEnvironments(true);
  });
});
// Rời trang khi bản nháp cấu hình chưa lưu: để trình duyệt hỏi lại.
window.addEventListener('beforeunload', (e) => { if (isDirty()) e.preventDefault(); });
