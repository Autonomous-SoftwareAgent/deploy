// Cách hiển thị các giá trị, và hàm dựng phần tử DOM. Thuần: không gọi mạng, không giữ trạng thái.

export const short = (commit) => (commit ? String(commit).slice(0, 12) : '(không có)');

export const when = (iso) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('vi-VN'); };

export const ACTION = { deploy: 'Deploy', rollback: 'Rollback', 'auto-revert': 'Tự bật lại bản trước', up: 'Bật cả hệ' };
export const actionName = (a) => ACTION[a] || a;

/** Dựng một phần tử. Chữ luôn đi qua textContent hoặc append (không bao giờ innerHTML), nên dữ liệu không thành mã được. */
export function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children)) if (child !== null && child !== undefined && child !== '') node.append(child);
  return node;
}

export const badge = (text, kind) => el('span', { className: `badge ${kind}`, textContent: text });
export const code = (text) => el('code', { textContent: text });
