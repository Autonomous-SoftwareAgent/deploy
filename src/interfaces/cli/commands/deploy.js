'use strict';
// deploy <dịch-vụ> [commit]: đưa bản đã khai (hoặc đúng commit được nêu) lên chạy, kiểm sức khỏe; không khỏe thì tự bật lại bản trước.
// Commit được nêu phải đã có bản đóng gói như mọi bản khác. Nhận mã đủ 40 ký tự, hoặc tiền tố nếu máy này có repo của dịch vụ.
const { makeSwitchCommand } = require('./switch');
const { COMMIT_RE, COMMIT_PREFIX_RE } = require('../../../domain/naming');

async function resolveCommit(app, manifest, name, ref) {
  if (!ref) return undefined;
  if (COMMIT_RE.test(ref)) return ref;
  if (!COMMIT_PREFIX_RE.test(ref)) throw new Error(`mã commit "${ref}" không hợp lệ (cần 7 đến 40 chữ số hệ 16)`);
  return app.ports.source.resolve(manifest.services[name].repo, ref);
}

module.exports = makeSwitchCommand({
  action: 'deploy',
  usage: 'deploy <dịch-vụ> [commit]',
  call: async ({ app, manifest, args, apply, verbose, seconds, by, step }, name, say) =>
    app.deploy({ manifest, name, commit: await resolveCommit(app, manifest, name, args[1]), apply, verbose, seconds, by, say, step }),
});
