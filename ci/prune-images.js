#!/usr/bin/env node
'use strict';
// Dọn bản đóng gói cũ trên Docker Hub (S-023): mỗi dịch vụ giữ N bản mới nhất (registry.keep trong infra/platform.json),
// cùng bản đang được ghim và bản ghim liền trước dù cũ đến đâu (để còn lùi được). Chỉ đụng nhãn dạng main-<12 ký tự commit>.
//   node infra/ci/prune-images.js            chỉ in kế hoạch
//   node infra/ci/prune-images.js --apply    xóa thật
// Cần DOCKERHUB_USERNAME và DOCKERHUB_TOKEN (token có quyền xóa) trong biến môi trường. Không in token.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
// Tệp này chạy trong repo deploy đầy đủ (workflow prune), nên dùng chung cách đọc tờ khai báo và cách đặt tên với lệnh điều khiển.
const { makeLayout } = require('../src/infrastructure/layout');
const { makeFsDeclarations } = require('../src/infrastructure/fs-declarations');
const { short } = require('../src/domain/naming');

const ROOT = path.resolve(__dirname, '..', '..');
const HUB = 'https://hub.docker.com/v2';
const TAG_RE = /^main-[0-9a-f]{12}$/;

/** Thuần: chọn nhãn giữ và nhãn xóa. tags: [{name, last_updated}]; protect: các nhãn không bao giờ xóa. */
function plan(tags, keep, protect) {
  const ours = tags.filter((t) => TAG_RE.test(t.name)).sort((a, b) => String(b.last_updated).localeCompare(String(a.last_updated)));
  const keepSet = new Set([...ours.slice(0, keep).map((t) => t.name), ...ours.map((t) => t.name).filter((n) => protect.has(n))]);
  return { keep: ours.filter((t) => keepSet.has(t.name)).map((t) => t.name), remove: ours.filter((t) => !keepSet.has(t.name)).map((t) => t.name), ignored: tags.filter((t) => !TAG_RE.test(t.name)).map((t) => t.name) };
}

/** Bản đang ghim và bản ghim liền trước của một dịch vụ, đọc từ lịch sử git của tờ khai báo. */
function pinnedTags(root, name, current, run = spawnSync) {
  // Chạy git ngay trong thư mục infra và dùng đường dẫn tương đối (./...), để đúng cả khi thư mục đó là gốc của
  // repo deploy lẫn khi nó là thư mục con của một repo khác.
  const dir = makeLayout(root).base;
  const file = `services/${name}.json`;
  const commits = [];
  if (current) commits.push(current);
  const log = run('git', ['-C', dir, 'log', '--format=%H', '-n', '30', '--', file], { encoding: 'utf8' });
  for (const h of (log.status === 0 ? log.stdout.split('\n').filter(Boolean) : [])) {
    const show = run('git', ['-C', dir, 'show', `${h}:./${file}`], { encoding: 'utf8' });
    if (show.status !== 0) continue;
    try { const c = JSON.parse(show.stdout).commit; if (c && !commits.includes(c)) commits.push(c); } catch { /* bản cũ hỏng thì bỏ qua */ }
    if (commits.length >= 2) break;
  }
  return new Set(commits.slice(0, 2).map((c) => `main-${short(c)}`));
}

async function hub(fetchFn, method, url, token, body) {
  const r = await fetchFn(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* không phải JSON */ }
  return { status: r.status, json };
}

async function listTags(fetchFn, token, repo) {
  const tags = [];
  let url = `${HUB}/repositories/${repo}/tags/?page_size=100`;
  while (url) {
    const r = await hub(fetchFn, 'GET', url, token);
    if (r.status === 404) return null; // kho chưa có (dịch vụ chưa đẩy bản nào)
    if (r.status !== 200) throw new Error(`liệt kê nhãn của ${repo}: HTTP ${r.status}`);
    tags.push(...r.json.results.map((t) => ({ name: t.name, last_updated: t.last_updated || t.tag_last_pushed || '' })));
    url = r.json.next;
  }
  return tags;
}

async function main(argv, io = {}) {
  const log = io.log || ((s) => process.stdout.write(s + '\n'));
  const fetchFn = io.fetch || fetch;
  const root = io.root || ROOT;
  const env = io.env || process.env;
  const apply = argv.includes('--apply');
  const m = await makeFsDeclarations({ layout: makeLayout(root) }).load();
  if (!m.platform || !m.platform.registry) throw new Error('thiếu infra/platform.json');
  const reg = m.platform.registry;
  if (!env.DOCKERHUB_USERNAME || !env.DOCKERHUB_TOKEN) { log('Thiếu DOCKERHUB_USERNAME hoặc DOCKERHUB_TOKEN: không dọn gì.'); return 0; }
  const login = await hub(fetchFn, 'POST', `${HUB}/users/login`, '', { username: env.DOCKERHUB_USERNAME, password: env.DOCKERHUB_TOKEN });
  if (login.status !== 200 || !login.json || !login.json.token) throw new Error(`đăng nhập Docker Hub hỏng: HTTP ${login.status}`);
  const token = login.json.token;
  let failed = 0;
  for (const [name, svc] of Object.entries(m.services)) {
    const repo = `${reg.namespace}/${reg.repoPrefix || ''}${name}`;
    const tags = await listTags(fetchFn, token, repo);
    if (!tags) { log(`${repo}: kho chưa có trên Docker Hub, bỏ qua`); continue; }
    const protect = (io.pinnedTags || pinnedTags)(root, name, svc.commit);
    const p = plan(tags, reg.keep, protect);
    log(`${repo}: ${p.keep.length} bản giữ (luôn giữ: ${[...protect].join(', ') || 'không có'}), ${p.remove.length} bản ${apply ? 'xóa' : 'sẽ xóa'}${p.ignored.length ? `, ${p.ignored.length} nhãn khác không đụng` : ''}`);
    for (const t of p.remove) {
      if (!apply) { log(`  (kế hoạch) xóa ${repo}:${t}`); continue; }
      const r = await hub(fetchFn, 'DELETE', `${HUB}/repositories/${repo}/tags/${t}/`, token);
      if (r.status === 204 || r.status === 200) log(`  đã xóa ${repo}:${t}`); else { failed++; log(`  KHÔNG xóa được ${repo}:${t}: HTTP ${r.status}`); }
    }
  }
  if (!apply) log('Chưa xóa gì. Thêm --apply để xóa thật.');
  return failed ? 1 : 0;
}

module.exports = { plan, pinnedTags, main, TAG_RE };

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }).catch((e) => { process.stderr.write(`LỖI: ${e.message}\n`); process.exitCode = 1; });
