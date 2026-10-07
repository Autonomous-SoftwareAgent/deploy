'use strict';
// check: kiểm các tờ khai báo infra/services/<dịch-vụ>.json.
module.exports = {
  name: 'check',
  usage: 'check',
  requireRepos: 'if-present',
  async run({ checked, say, json }) {
    const names = Object.keys(checked.manifest.services);
    if (json) { say(JSON.stringify({ ok: checked.ok, errors: checked.errors, reposChecked: checked.reposChecked, services: names })); return checked.ok ? 0 : 1; }
    if (!checked.ok) { for (const e of checked.errors) say(`LỖI: ${e}`); return 1; }
    if (!checked.reposChecked) say('(máy này không có repo của dịch vụ: bỏ qua phần kiểm repo, chỉ kiểm nội dung tờ khai báo)');
    say(`OK: ${names.length} dịch vụ, cổng local ${Object.values(checked.manifest.services).map((s) => s.port.local).join(', ')}`);
    return 0;
  },
};
