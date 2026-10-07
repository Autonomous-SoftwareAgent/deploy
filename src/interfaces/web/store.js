// Trạng thái của trang và việc hỏi lại máy chủ định kỳ. Các phần của trang (views) không tự gọi mạng: chúng nhận dữ liệu
// và các hành động từ đây.
import { api } from './api.js';

const IDLE_MS = 5000;
const BUSY_MS = 1500;

export function createStore() {
  const listeners = new Set();
  let timer = null;
  // view: 'loading' | 'login' | 'app'. ui: lựa chọn của người dùng cần giữ qua các lần vẽ lại.
  // error: tình trạng hiện tại (tự hết khi lần hỏi sau thành công). notice: lời từ chối của việc vừa bấm (giữ tới lần bấm sau).
  const state = { view: 'loading', data: null, error: '', notice: '', loginError: '', ui: { openHistory: new Set(), picked: new Map() } };
  const emit = () => { for (const fn of listeners) fn(state); };
  const stop = () => { clearTimeout(timer); timer = null; };

  function toLogin(message = '') { stop(); Object.assign(state, { view: 'login', data: null, loginError: message }); emit(); }

  async function refresh() {
    stop();
    let res;
    try { res = await api.state(); }
    catch (e) { state.error = `Không gọi được bảng điều khiển: ${e.message}`; emit(); timer = setTimeout(refresh, IDLE_MS); return; }
    if (res.status === 401) return toLogin();
    state.view = 'app';
    if (res.body.ok) { state.data = res.body; state.error = res.body.dockerReachable === false ? 'Không hỏi được Docker trên máy này: trạng thái container có thể thiếu.' : ''; }
    else state.error = res.body.error || 'lỗi không rõ';
    emit();
    const active = res.body.ok && res.body.services.some((s) => s.job || s.busy);
    timer = setTimeout(refresh, active ? BUSY_MS : IDLE_MS);
  }

  async function act(call) {
    state.notice = '';
    const res = await call();
    if (res.status === 401) return toLogin('Phiên đăng nhập đã hết.');
    if (!res.body.ok) state.notice = res.body.error || 'Không chạy được.';
    return refresh();
  }

  return {
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    refresh,
    login: async (password) => { const res = await api.login(password); if (res.body.ok) return refresh(); return toLogin(res.body.error || 'Không đăng nhập được.'); },
    logout: async () => { await api.logout(); toLogin(); },
    deploy: (service) => act(() => api.deploy(service)),
    rollback: (service, commit) => act(() => api.rollback(service, commit)),
  };
}
