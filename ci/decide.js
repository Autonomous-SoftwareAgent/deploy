#!/usr/bin/env node
'use strict';
// Workflow dùng chung hỏi: lần chạy này CÓ đóng gói Docker không, và đóng gói thành bản tên gì (S-023, S-029).
// Luật "khai báo trước, build sau": KHAI COMMIT NÀO THÌ ĐÓNG GÓI ĐÚNG COMMIT ĐÓ. Commit được đóng gói là commit ghi trong tờ
// services/<dịch-vụ>.json của repo deploy, dù nó là đầu nhánh hay nằm phía dưới, miễn nó đã có trên nhánh main vừa đẩy
// và chưa có bản. Lần chạy không có commit nào chờ đóng gói thì chỉ chạy test. Chỉ nhánh main.
// Chạy trong repo của dịch vụ (thư mục hiện tại, đã lấy đủ lịch sử), đọc biến môi trường của GitHub Actions, ghi kết quả
// vào $GITHUB_OUTPUT. BSN_DEPLOY_DIR: thư mục đã checkout repo deploy (có services/ và platform.json).
// Hai cách gọi:
//   BSN_MODE=pin            workflow service-pin: commit cần đóng gói là commit ĐÃ KHAI; in thêm danh sách commit phải test.
//   BSN_BUILD_COMMIT=<mã>   workflow service-image: đóng gói đúng commit này (bỏ trống: commit đang chạy, cách gọi cũ).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const NAME_RE = /^[a-z][a-z0-9-]{0,30}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const BUILD_BRANCH = 'main';
const BUILD_EVENTS = new Set(['push', 'workflow_dispatch']);
const short = (c) => String(c || '').slice(0, 12);

/**
 * Quyết định thuần (không đọc đĩa, không gọi lệnh) để test được.
 * in: { event, ref, sha (commit đang chạy), repo ("org/tên"), prefix, config (nội dung bsn.ci.json đã đọc),
 *       declaration: undefined (không có tờ khai báo) | { commit: <40 ký tự> | null },
 *       mode?: 'pin' (commit cần đóng gói là commit đã khai), buildCommit?: commit cần đóng gói (mặc định: sha),
 *       onBranch?: commit cần đóng gói có nằm trên nhánh vừa đẩy không (chỉ hỏi khi nó khác sha),
 *       imageExists?: bản của commit đó đã có trên kho chưa }
 * out: { build, reason, service, target, repoName, tag, commit (commit được xét), refs (các commit phải test), error?, note? }
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
  const declared = i.declaration ? i.declaration.commit : null;
  // Commit được xét: commit đã khai (chế độ pin), commit được chỉ định, hoặc commit đang chạy.
  const commit = (i.mode === 'pin' ? declared : i.buildCommit) || i.sha;
  const base = { service: cfg.service, target: typeof cfg.dockerTarget === 'string' ? cfg.dockerTarget : '', repoName, tag: `${BUILD_BRANCH}-${short(commit)}`, commit, refs: [i.sha], note: extra.length ? `buildBranches có ${extra.join(', ')}: hiện chỉ nhánh main được đóng gói, các nhánh khác bị bỏ qua` : '' };
  if (!COMMIT_RE.test(i.sha || '') || !COMMIT_RE.test(commit || '')) return { ...base, build: false, error: true, reason: 'không có mã commit đủ 40 ký tự' };
  if (!BUILD_EVENTS.has(i.event)) return { ...base, build: false, reason: `sự kiện "${i.event}" chỉ chạy test, không đóng gói` };
  if (i.ref !== `refs/heads/${BUILD_BRANCH}`) return { ...base, build: false, reason: `nhánh ${String(i.ref).replace('refs/heads/', '')} chỉ chạy test; chỉ nhánh main được đóng gói` };
  if (!branches.includes(BUILD_BRANCH)) return { ...base, build: false, reason: 'bsn.ci.json không khai main trong buildBranches' };
  if (!i.declaration) return { ...base, build: false, reason: `dịch vụ "${cfg.service}" chưa có tờ khai báo services/${cfg.service}.json ở repo deploy: không đóng gói` };
  if (declared !== commit) {
    return { ...base, build: false, reason: `commit ${short(commit)} không phải bản đã khai (tờ khai báo đang ghi ${declared ? short(declared) : 'chưa ghim commit nào'}): chỉ chạy test, không đóng gói. ` +
      'Muốn đóng gói commit này: ghim nó vào tờ khai báo, đẩy repo deploy, rồi chạy lại workflow này.' };
  }
  if (commit !== i.sha && !i.onBranch) {
    return { ...base, build: false, reason: `commit đã khai ${short(commit)} chưa có trên nhánh main vừa đẩy (đầu nhánh là ${short(i.sha)}): chỉ chạy test. Đẩy mã có commit đó lên main rồi chạy lại.` };
  }
  if (i.imageExists) return { ...base, build: false, reason: `commit đã khai ${short(commit)} đã có bản đóng gói: không đóng gói lại` };
  // Đóng gói commit nằm dưới đầu nhánh: test cả đầu nhánh lẫn chính commit đó (bản chỉ sinh ra từ commit đã qua test).
  return { ...base, build: true, refs: commit === i.sha ? [i.sha] : [i.sha, commit], reason: `commit ${short(commit)} đúng là bản đã khai trong services/${cfg.service}.json${commit === i.sha ? '' : ` (nằm dưới đầu nhánh ${short(i.sha)})`}` };
}

/** Đọc tờ khai báo của dịch vụ từ bản checkout của repo deploy. Không có tệp: undefined. Tệp hỏng: ném lỗi. */
function readDeclaration(deployDir, service) {
  const file = path.join(deployDir, 'services', `${service}.json`);
  if (!fs.existsSync(file)) return undefined;
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { commit: typeof j.commit === 'string' ? j.commit : null };
}

/** Kho và tài khoản của bản đóng gói, đọc từ platform.json của repo deploy. Không có: null. */
function readRegistry(deployDir) {
  try { return JSON.parse(fs.readFileSync(path.join(deployDir, 'platform.json'), 'utf8')).registry || null; } catch { return null; }
}

/** commit có nằm trên lịch sử của head không (cần bản checkout đủ lịch sử). */
function isAncestor(commit, head, run = spawnSync) {
  return run('git', ['merge-base', '--is-ancestor', commit, head], { encoding: 'utf8' }).status === 0;
}

/** Bản đã có trên kho chưa. Kho công khai nên không cần đăng nhập. Không hỏi được thì coi là chưa có (bước đẩy còn kiểm lại). */
function imageOnRegistry(image, run = spawnSync) {
  return run('docker', ['manifest', 'inspect', image], { encoding: 'utf8' }).status === 0;
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
    const input = { event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, sha: env.GITHUB_SHA, repo: env.GITHUB_REPOSITORY, prefix: env.BSN_REPO_PREFIX || '', config, declaration,
      mode: env.BSN_MODE === 'pin' ? 'pin' : undefined, buildCommit: env.BSN_BUILD_COMMIT || undefined };
    // Hỏi lần đầu để biết commit nào được xét, rồi mới hỏi git và kho về đúng commit đó.
    const first = decide({ ...input, onBranch: true, imageExists: false });
    if (first.build) {
      const registry = readRegistry(env.BSN_DEPLOY_DIR);
      const account = (registry && registry.namespace) || env.DOCKERHUB_USERNAME || '';
      input.onBranch = first.commit === env.GITHUB_SHA || isAncestor(first.commit, env.GITHUB_SHA);
      input.imageExists = account ? imageOnRegistry(`${account}/${first.repoName}:${first.tag}`) : false;
    }
    d = decide(input);
  } catch (e) {
    d = { build: false, error: true, reason: `không đọc được tờ khai báo: ${e.message}` };
  }
  const lines = [`build=${d.build ? 'true' : 'false'}`, `service=${d.service || ''}`, `target=${d.target || ''}`, `repo_name=${d.repoName || ''}`, `tag=${d.tag || ''}`,
    `commit=${d.commit || ''}`, `refs=${JSON.stringify(d.refs && d.refs.length ? d.refs : [env.GITHUB_SHA || ''])}`];
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  process.stdout.write(`${d.error ? 'LỖI' : d.build ? 'ĐÓNG GÓI' : 'KHÔNG đóng gói'}: ${d.reason}\n${d.note ? d.note + '\n' : ''}`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `**${d.error ? 'Lỗi' : d.build ? 'Đóng gói' : 'Không đóng gói'}**: ${d.reason}\n`);
  return d.error ? 1 : 0;
}

module.exports = { decide, readDeclaration, readRegistry, isAncestor, imageOnRegistry };

if (require.main === module) process.exitCode = main();
