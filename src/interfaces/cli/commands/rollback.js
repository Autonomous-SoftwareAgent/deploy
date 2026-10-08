'use strict';
// rollback <dịch-vụ> [commit]: lùi về bản liền trước, hoặc về một commit đã từng chạy khỏe ở đây.
const { makeSwitchCommand } = require('./switch');

module.exports = makeSwitchCommand({
  action: 'rollback',
  usage: 'rollback <dịch-vụ> [commit]',
  call: ({ app, manifest, args, apply, verbose, seconds, by, step }, name, say) => app.rollback({ manifest, name, ref: args[1], apply, verbose, seconds, by, say, step }),
});
