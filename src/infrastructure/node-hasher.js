'use strict';
// Cổng Hasher bằng node:crypto: scrypt cho mật khẩu, SHA-256 cho token (token dài và ngẫu nhiên nên không cần băm chậm).
const crypto = require('node:crypto');

const nodeHasher = {
  slowHash: (password, salt) => crypto.scryptSync(password, salt, 32).toString('hex'),
  fastHash: (text) => crypto.createHash('sha256').update(text).digest('hex'),
  equal: (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); },
};

module.exports = { nodeHasher };
