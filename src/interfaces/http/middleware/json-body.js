'use strict';
// Đọc thân yêu cầu dạng JSON, có giới hạn kích thước. Thân trống là đối tượng rỗng.
const { fail } = require('../respond');

const LIMIT = 10 * 1024;

function read(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > LIMIT) { reject(new Error('thân yêu cầu quá lớn')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(j && typeof j === 'object' && !Array.isArray(j) ? j : {}); }
      catch { reject(new Error('thân yêu cầu không phải JSON')); }
    });
    req.on('error', reject);
  });
}

function jsonBody() {
  return async (ctx, next) => {
    if (ctx.method === 'GET') return next();
    try { ctx.body = await read(ctx.req); } catch (e) { return fail(400, e.message); }
    return next();
  };
}

module.exports = { jsonBody };
