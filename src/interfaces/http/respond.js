'use strict';
// Dạng của một câu trả lời HTTP mà lớp chặn và bộ điều khiển trả về: { status, headers, body }. server.js mới là chỗ ghi ra mạng.

const json = (status, body, headers = {}) => ({ status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body: JSON.stringify(body) });
const fail = (status, error, extra = {}) => json(status, { ok: false, error, ...extra });
const raw = (status, body, contentType, headers = {}) => ({ status, headers: { 'content-type': contentType, ...headers }, body });

module.exports = { json, fail, raw };
