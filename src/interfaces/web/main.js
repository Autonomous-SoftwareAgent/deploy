// Nối trạng thái (store) với các phần của trang (views). Tệp này là chỗ duy nhất của giao diện tìm phần tử theo id.
import { createStore } from './store.js';
import { loginView } from './views/login.js';
import { serviceCard } from './views/service-card.js';
import { jobList } from './views/job-list.js';
import { createConfirm } from './views/confirm.js';

const $ = (id) => document.getElementById(id);
const store = createStore();
const actions = { confirm: createConfirm(), deploy: store.deploy, rollback: store.rollback };

const drawn = new Map();
function redraw(id, data, build) {
  const key = JSON.stringify(data);
  if (drawn.get(id) === key) return;
  drawn.set(id, key);
  $(id).replaceChildren(...build());
}

function render(state) {
  const loggedIn = state.view === 'app';
  $('login').hidden = state.view !== 'login';
  $('app').hidden = !loggedIn;
  $('logout').hidden = !loggedIn;
  if (state.view === 'login') { $('who').textContent = ''; $('login').replaceChildren(loginView({ error: state.loginError, onLogin: store.login })); return; }
  const problem = [state.notice, state.error].filter(Boolean).join(' ');
  $('error').hidden = !problem;
  $('error').textContent = problem;
  if (!loggedIn || !state.data) return;
  $('who').textContent = `Đang dùng với vai: ${state.data.actor}`;
  $('memory').hidden = !state.data.memory;
  $('target').textContent = state.data.target ? `Đích: ${state.data.target}. Mọi nút ở đây ra lệnh cho máy đó.` : 'Đích: chính máy đang chạy bảng điều khiển này.';
  // Chỉ vẽ lại phần nào có dữ liệu đổi: vẽ lại vô cớ làm mất tiêu điểm bàn phím và đóng ô chọn đang mở.
  redraw('services', state.data.services, () => state.data.services.map((s) => serviceCard(s, state.ui, actions)));
  redraw('jobs', state.data.jobs, () => jobList(state.data.jobs));
}

store.subscribe(render);
$('logout').addEventListener('click', store.logout);
store.refresh();
