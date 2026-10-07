// Mọi lời gọi tới máy chủ của bảng điều khiển đi qua tệp này. Trả { status, body }; không ném lỗi cho câu trả lời có mã lỗi.

const HEADERS = { 'x-bsn-console': '1' };

async function call(method, path, body) {
  const res = await fetch(path, { method, headers: { ...HEADERS, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* câu trả lời không phải JSON */ }
  return { status: res.status, body: parsed || { ok: false, error: `máy chủ trả mã ${res.status}` } };
}

export const api = {
  state: () => call('GET', '/api/state'),
  login: (password) => call('POST', '/api/login', { password }),
  logout: () => call('POST', '/api/logout', {}),
  deploy: (service) => call('POST', `/api/services/${encodeURIComponent(service)}/deploy`, {}),
  rollback: (service, commit) => call('POST', `/api/services/${encodeURIComponent(service)}/rollback`, commit ? { commit } : {}),
};
