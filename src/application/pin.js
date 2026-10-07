'use strict';
// Ca sử dụng GHIM: ghi commit mà một dịch vụ muốn chạy vào tờ khai báo của ĐÚNG dịch vụ đó (S-017, S-023).
const { short } = require('../domain/naming');
const { runPlan } = require('./plan');

/** @param {{declarations: import('./ports').Declarations, source: import('./ports').Source}} ports */
function makePin({ declarations, source }) {
  /** input: { manifest, name, ref?, apply, say } */
  return async function pin({ manifest, name, ref, apply, say }) {
    const svc = manifest.services[name];
    const commit = await source.resolve(svc.repo, ref || 'HEAD');
    const dirty = await source.dirtyCount(svc.repo);
    say(`${name}: ${svc.commit ? short(svc.commit) : 'chưa ghim'} -> ${short(commit)} (${await source.subject(svc.repo, commit)})`);
    if (dirty) say(`Lưu ý: ${dirty} tệp chưa commit trong ${svc.repo} KHÔNG nằm trong bản ghim.`);
    say('Chỉ ghim commit đã qua test của dịch vụ (S-017). Lệnh này không chạy test thay bạn.');
    await runPlan([{ text: `ghi commit ${commit} vào infra/services/${name}.json (chỉ tờ của ${name})`, run: () => declarations.save(name, { ...svc, commit }) }], { apply, say });
    return { ok: true, service: name, commit, applied: !!apply };
  };
}

module.exports = { makePin };
