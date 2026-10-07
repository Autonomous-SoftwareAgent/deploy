'use strict';
// deploy <dịch-vụ>: đưa bản đã khai lên chạy, kiểm sức khỏe; không khỏe thì tự bật lại bản trước.
const { makeSwitchCommand } = require('./switch');

module.exports = makeSwitchCommand({
  action: 'deploy',
  usage: 'deploy <dịch-vụ>',
  call: ({ app, manifest, apply, verbose, seconds, by }, name, say) => app.deploy({ manifest, name, apply, verbose, seconds, by, say }),
});
