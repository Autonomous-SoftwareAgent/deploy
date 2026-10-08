// Dựng phần tử trang. Chữ luôn đi qua textContent (không bao giờ ghép HTML từ dữ liệu), kiểu dáng động đặt qua CSSOM
// (chính sách nội dung của trang không cho thuộc tính style viết trong HTML).

/**
 * h('div', { class: 'row', onclick: fn, title: '...', css: { background: '#fff' } }, con1, 'chữ', [con2, con3])
 * Thuộc tính đặc biệt: class, css (đối tượng kiểu dáng), on<sự kiện>, và các thuộc tính boolean (disabled, checked, hidden).
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'css') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const kid of kids) {
    if (kid === undefined || kid === null || kid === false) continue;
    if (Array.isArray(kid)) append(el, kid);
    else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

/** Thay toàn bộ con của một phần tử. */
export function mount(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

export const short = (sha) => (sha ? String(sha).slice(0, 7) : '—');

/** "3 phút trước" từ một thời điểm ISO. Không có thời điểm: gạch ngang. */
export function ago(iso) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return '—';
  const m = (Date.now() - t) / 60000;
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${Math.round(m)} phút trước`;
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`;
  return `${Math.round(m / 1440)} ngày trước`;
}

export const HEALTH_LABEL = { healthy: 'khỏe', deploying: 'đang đưa lên', failed: 'hỏng' };
export const BUILD_LABEL = { passed: 'đã có bản', none: 'chưa đóng gói', unknown: 'không hỏi được kho' };
export const STEP_LABEL = { fetch: 'Lấy bản', start: 'Bật bản mới', health: 'Kiểm sức khỏe', record: 'Ghi sổ' };
export const ITEM_LABEL = { running: 'Đang chạy', succeeded: 'Thành công', failed: 'Thất bại', rolling_back: 'Đang bật lại bản cũ', rolled_back: 'Đã tự bật lại bản cũ' };
export const ITEM_CHIP = { running: 'run', succeeded: 'ok', failed: 'bad', rolling_back: 'warn', rolled_back: 'warn' };
