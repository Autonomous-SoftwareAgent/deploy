// Mọi lời gọi tới máy chủ của bảng điều khiển đi qua tệp này. Trả { status, body }; không ném lỗi cho câu trả lời có mã lỗi.

import { T } from './text.js';

const HEADERS = { 'x-bsn-console': '1' };

async function call(method, path, body) {
  let res;
  try { res = await fetch(path, { method, headers: { ...HEADERS, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { return { status: 0, body: { error: { code: 'NETWORK', message: T.api.network(e.message) } } }; }
  let parsed = null;
  try { parsed = await res.json(); } catch { /* câu trả lời không phải JSON */ }
  return { status: res.status, body: parsed || { error: { code: 'BAD_RESPONSE', message: T.api.status(res.status) } } };
}

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '' && v !== 'all') q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

/** Lời giải thích của một câu trả lời lỗi, ở cả hai dạng (đường /api cũ và /api/v1). */
export const errorOf = (r) => (r.body && r.body.error && (r.body.error.message || r.body.error)) || T.api.status(r.status);

export const api = {
  login: (password) => call('POST', '/api/login', { password }),
  logout: () => call('POST', '/api/logout', {}),
  overview: (filters) => call('GET', `/api/v1/overview${query(filters)}`),
  service: (id) => call('GET', `/api/v1/services/${encodeURIComponent(id)}`),
  preflight: (req) => call('POST', '/api/v1/deployments/preflight', req),
  start: (req) => call('POST', '/api/v1/deployments', req),
  run: (id) => call('GET', `/api/v1/runs/${encodeURIComponent(id)}`),
  runLogs: (id, after) => call('GET', `/api/v1/runs/${encodeURIComponent(id)}/logs${query({ after })}`),
  activeRuns: () => call('GET', '/api/v1/runs?status=active'),
};
