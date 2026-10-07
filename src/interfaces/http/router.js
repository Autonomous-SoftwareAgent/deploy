'use strict';
// Bảng định tuyến: "phương thức + đường dẫn -> bộ điều khiển". Đường dẫn có thể có tham số dạng :tên.
// Thêm một đường mới là thêm một dòng vào bảng, không có if nối dài.

function compile(path) {
  const names = [];
  const pattern = path.split('/').map((part) => {
    if (part.startsWith(':')) { names.push(part.slice(1)); return '([^/]+)'; }
    if (part === '*') { names.push('rest'); return '(.*)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { regex: new RegExp(`^${pattern}$`), names };
}

/** routes: [{ method, path, handler, open? }]. open: không cần đăng nhập. */
function makeRouter(routes) {
  const table = routes.map((r) => ({ ...r, ...compile(r.path) }));
  /** Trả { route, params } hoặc null. Tham số chưa giải mã được (%.. sai) thì coi như không khớp. */
  return function match(method, pathname) {
    for (const route of table) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      try {
        const params = Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
        return { route, params };
      } catch { return null; }
    }
    return null;
  };
}

module.exports = { makeRouter };
