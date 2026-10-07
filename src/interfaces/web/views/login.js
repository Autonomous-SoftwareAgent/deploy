// Phần đăng nhập. Hàm thuần từ dữ liệu ra phần tử; việc gọi máy chủ do hành động onLogin lo.
import { el } from '../format.js';

export function loginView({ error, onLogin }) {
  const input = el('input', { id: 'pw', type: 'password', autocomplete: 'current-password', required: true });
  const form = el('form', {}, [
    el('h2', { textContent: 'Đăng nhập' }),
    el('label', { className: 'hint', htmlFor: 'pw', textContent: 'Mật khẩu quản trị' }),
    input,
    el('button', { className: 'primary', type: 'submit', textContent: 'Đăng nhập' }),
    error ? el('p', { className: 'hint error-text', textContent: error }) : null,
  ]);
  form.addEventListener('submit', (e) => { e.preventDefault(); const value = input.value; input.value = ''; onLogin(value); });
  queueMicrotask(() => input.focus());
  return form;
}
