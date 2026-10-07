'use strict';
// Đăng nhập và đăng xuất của người quản trị.
const { json, fail } = require('../respond');
const cookie = require('../session-cookie');

function sessionController({ auth }) {
  return {
    async login(ctx) {
      const res = await auth.login(ctx.body.password);
      if (res.ok) return json(200, { ok: true }, { 'set-cookie': cookie.format(res.sid, res.maxAge) });
      if (res.code === 'LOCKED_OUT') return fail(429, `sai mật khẩu nhiều lần; thử lại sau ${res.retrySeconds} giây`);
      return fail(401, 'sai mật khẩu');
    },
    async logout(ctx) {
      if (ctx.who.sid) await auth.logout(ctx.who.sid);
      return json(200, { ok: true }, { 'set-cookie': cookie.format('', 0) });
    },
  };
}

module.exports = { sessionController };
