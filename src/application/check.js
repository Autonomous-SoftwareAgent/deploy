'use strict';
// Ca sử dụng CHECK: đọc mọi tờ khai báo và kiểm. Luật nội dung nằm ở domain; "repo có trên máy không" hỏi qua cổng Source.
const { validate, repoPathValid } = require('../domain/declaration');

/** @param {{declarations: import('./ports').Declarations, source: import('./ports').Source}} ports */
function makeCheck({ declarations, source }) {
  /**
   * requireRepos: true thì đòi repo của mọi dịch vụ có trên máy; 'if-present' thì chỉ đòi khi máy có repo dịch vụ nào đó
   * (máy của GitHub chỉ có repo deploy: khi đó bỏ phần kiểm repo và nói rõ đã bỏ).
   */
  return async function check({ requireRepos = true } = {}) {
    const manifest = await declarations.load();
    const reposChecked = requireRepos === 'if-present' ? await source.anyPresent(manifest) : !!requireRepos;
    const errors = validate(manifest);
    if (reposChecked) {
      for (const [name, svc] of Object.entries(manifest.services)) {
        if (repoPathValid(svc) && !(await source.has(svc.repo))) errors.push(`services.${name}.repo: không thấy repo git ở ${svc.repo}`);
      }
    }
    return { ok: !errors.length, errors, reposChecked, manifest };
  };
}

module.exports = { makeCheck };
