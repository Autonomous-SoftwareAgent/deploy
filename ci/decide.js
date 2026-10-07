#!/usr/bin/env node
'use strict';
// Workflow dùng chung hỏi: lần chạy này CÓ đóng gói Docker không, và đóng gói thành bản tên gì (S-023, S-029).
// Luật "khai báo trước, build sau": chỉ đóng gói khi commit đang chạy ĐÚNG LÀ commit dịch vụ đã khai trong tờ
// services/<dịch-vụ>.json của repo deploy. Lần đẩy khác chỉ chạy test. Chỉ nhánh main.
// Chạy trong repo của dịch vụ (thư mục hiện tại), đọc biến môi trường của GitHub Actions, ghi kết quả vào $GITHUB_OUTPUT.
// BSN_DEPLOY_DIR: thư mục đã checkout repo deploy (có services/).
const fs = require('node:fs');
const path = require('node:path');

const NAME_RE = /^[a-z][a-z0-9-]{0,30}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const BUILD_BRANCH = 'main';
const BUILD_EVENTS = new Set(['push', 'workflow_dispatch']);
const short = (c) => String(c || '').slice(0, 12);

/**
 * Quyết định thuần (không đọc đĩa, không gọi lệnh) để test được.
 * in: { event, ref, sha, repo ("org/tên"), prefix, config (nội dung bsn.ci.json đã đọc),
 *       declaration: undefined (không có tờ khai báo) | { commit: <40 ký tự> | null } }
 * out: { build, reason, service, target, repoName, tag, error?, note? }
 */
function decide(i) {
  const cfg = i.config;
  if (!cfg || typeof cfg !== 'object') return { build: false, error: true, reason: 'thiếu bsn.ci.json ở gốc repo (cần ít nhất {"service": "<tên>"})' };
  if (!NAME_RE.test(cfg.service || '')) return { build: false, error: true, reason: `bsn.ci.json: "service" không hợp lệ (${JSON.stringify(cfg.service)})` };
  const repoName = `${i.prefix || ''}${cfg.service}`;
  const actual = String(i.repo || '').split('/').pop();
  // Một repo chỉ được đẩy bản dưới tên dịch vụ của chính nó.
  if (actual !== repoName) return { build: false, error: true, reason: `repo "${actual}" khai service "${cfg.service}" nhưng tên repo phải là "${repoName}"` };
  const branches = Array.isArray(cfg.buildBranches) && cfg.buildBranches.length ? cfg.buildBranches : [BUILD_BRANCH];
  const extra = branches.filter((b) => b !== BUILD_BRANCH);
  const base = { service: cfg.service, target: typeof cfg.dockerTarget === 'string' ? cfg.dockerTarget : '', repoName, tag: `${BUILD_BRANCH}-${short(i.sha)}`, note: extra.length ? `buildBranches có ${extra.join(', ')}: hiện chỉ nhánh main được đóng gói, các nhánh khác bị bỏ qua` : '' };
  if (!COMMIT_RE.test(i.sha || '')) return { ...base, build: false, error: true, reason: 'không có mã commit đủ 40 ký tự' };
  if (!BUILD_EVENTS.has(i.event)) return { ...base, build: false, reason: `sự kiện "${i.event}" chỉ chạy test, không đóng gói` };
  if (i.ref !== `refs/heads/${BUILD_BRANCH}`) return { ...base, build: false, reason: `nhánh ${String(i.ref).replace('refs/heads/', '')} chỉ chạy test; chỉ nhánh main được đóng gói` };
  if (!branches.includes(BUILD_BRANCH)) return { ...base, build: false, reason: 'bsn.ci.json không khai main trong buildBranches' };
  if (!i.declaration) return { ...base, build: false, reason: `dịch vụ "${cfg.service}" chưa có tờ khai báo services/${cfg.service}.json ở repo deploy: không đóng gói` };
  const want = i.declaration.commit;
  if (want !== i.sha) {
    return { ...base, build: false, reason: `commit ${short(i.sha)} không phải bản đã khai (tờ khai báo đang ghi ${want ? short(want) : 'chưa ghim commit nào'}): chỉ chạy test, không đóng gói. ` +
      'Muốn đóng gói commit này: ghim nó vào tờ khai báo, đẩy repo deploy, rồi chạy lại workflow này.' };
  }
  return { ...base, build: true, reason: `commit ${short(i.sha)} đúng là bản đã khai trong services/${cfg.service}.json` };
}

/** Đọc tờ khai báo của dịch vụ từ bản checkout của repo deploy. Không có tệp: undefined. Tệp hỏng: ném lỗi. */
function readDeclaration(deployDir, service) {
  const file = path.join(deployDir, 'services', `${service}.json`);
  if (!fs.existsSync(file)) return undefined;
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { commit: typeof j.commit === 'string' ? j.commit : null };
}

function main() {
  const env = process.env;
  let config = null;
  try { config = JSON.parse(fs.readFileSync('bsn.ci.json', 'utf8')); } catch { /* decide báo thiếu */ }
  let declaration;
  let d;
  try {
    if (config && NAME_RE.test(config.service || '')) {
      if (!env.BSN_DEPLOY_DIR) throw new Error('thiếu BSN_DEPLOY_DIR (thư mục đã checkout repo deploy)');
      declaration = readDeclaration(env.BSN_DEPLOY_DIR, config.service);
    }
    d = decide({ event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, sha: env.GITHUB_SHA, repo: env.GITHUB_REPOSITORY, prefix: env.BSN_REPO_PREFIX || '', config, declaration });
  } catch (e) {
    d = { build: false, error: true, reason: `không đọc được tờ khai báo: ${e.message}` };
  }
  const lines = [`build=${d.build ? 'true' : 'false'}`, `service=${d.service || ''}`, `target=${d.target || ''}`, `repo_name=${d.repoName || ''}`, `tag=${d.tag || ''}`];
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  process.stdout.write(`${d.error ? 'LỖI' : d.build ? 'ĐÓNG GÓI' : 'KHÔNG đóng gói'}: ${d.reason}\n${d.note ? d.note + '\n' : ''}`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `**${d.error ? 'Lỗi' : d.build ? 'Đóng gói' : 'Không đóng gói'}**: ${d.reason}\n`);
  return d.error ? 1 : 0;
}

module.exports = { decide, readDeclaration };

if (require.main === module) process.exitCode = main();
