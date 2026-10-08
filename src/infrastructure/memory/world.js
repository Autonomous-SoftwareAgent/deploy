'use strict';
// "Thế giới" trong bộ nhớ mà các bộ nối trong memory/ cùng nhìn: tờ khai báo, repo, kho bản, bản ở máy, container, sổ, khóa.
// Dùng cho test và cho bảng điều khiển chạy với --memory (phát triển giao diện mà không đụng hệ nào).
// Tên dịch vụ ở dữ liệu mẫu là tên mẫu, không phải dịch vụ thật.
const { remoteImage, localImage, containerName } = require('../../domain/naming');
const ledger = require('../../domain/ledger');

const commit = (ch) => ch.repeat(40);
const BROKEN = 'bad' + '1'.repeat(37);
const PLATFORM = { schema: 1, github: { org: 'mau', platformRepo: 'deploy', serviceRepoPrefix: 'svc-' }, registry: { namespace: 'mau', repoPrefix: 'svc-', branch: 'main', keep: 20 } };

function emptyWorld() {
  return {
    manifest: { schema: 1, services: {}, platform: PLATFORM },
    repos: new Map(), // đường dẫn repo -> { head, commits: Set, dirty, history: [{sha, message, author, at}] mới trước }
    published: new Map(), // tên bản trên kho -> commit ghi bên trong
    images: new Map(), // nhãn bản ở máy -> commit ghi bên trong
    running: new Map(), // tên container -> { commit, status, port }
    unhealthy: new Set(), // commit mà dịch vụ chạy nó sẽ không khỏe
    stacks: new Map(), // key -> mô tả chạy
    files: new Map(), // dịch vụ -> commit của tệp cấu hình đã trích
    ledger: ledger.empty(),
    locks: new Map(),
    secrets: {},
    credentials: null,
    consoleConfig: null, // cấu hình của bảng điều khiển kèm lịch sử phiên bản
    audit: [], // sổ thao tác của bảng điều khiển
    firstLogin: null,
    databases: new Set(),
    topics: new Set(),
    tierUp: false,
    delayMs: 0, // mỗi lần chờ khỏe mất bấy nhiêu mili giây
    time: Date.parse('2026-01-01T00:00:00Z'),
  };
}

/**
 * Thêm một dịch vụ đang chạy khỏe ở commit `running`, đã khai commit `declared`; `published` là các commit đã có bản trên kho.
 * Lịch sử của repo: `history` (mới trước) nếu truyền, không thì suy ra: commit đã khai là đầu nhánh, bản đang chạy nằm dưới.
 */
function addService(world, name, { declared, running, published = [], port, project, kind, history }) {
  const repo = `mau/${name}`;
  world.manifest.services[name] = { repo, commit: declared, port: { local: port, container: 8080 }, health: '/health', ...(project ? { project } : {}), ...(kind ? { kind } : {}) };
  const order = history || [...new Set([declared, ...published.filter((c) => c !== declared && c !== running).reverse(), running])];
  const log = order.map((sha, i) => ({ sha, message: `sample change ${order.length - i} of ${name}`, author: 'Sample Author', at: new Date(Date.parse('2025-12-31T00:00:00Z') - i * 3600000).toISOString() }));
  world.repos.set(repo, { head: declared, commits: new Set([declared, running, ...published, ...order]), dirty: 0, history: log });
  for (const c of published) world.published.set(remoteImage(PLATFORM, name, c), c);
  world.images.set(localImage(name, running), running);
  world.running.set(containerName(name), { commit: running, status: 'Up (trong bộ nhớ)', port });
  ledger.record(world.ledger, name, { action: 'up', commit: running, from: null, result: 'ok', at: '2026-01-01T00:00:00.000Z', by: 'mau' });
  return world;
}

/** Dữ liệu mẫu cho đủ mọi trạng thái: một bản tốt chờ deploy, một bản hỏng, một bản chờ build. */
function sampleWorld({ delayMs = 0 } = {}) {
  const w = emptyWorld();
  w.delayMs = delayMs;
  addService(w, 'mau-tot', { declared: commit('b'), running: commit('a'), published: [commit('a'), commit('b')], port: 8000, project: 'Sample group A', kind: 'api' });
  addService(w, 'mau-hong', { declared: BROKEN, running: commit('c'), published: [commit('c'), BROKEN], port: 8001, project: 'Sample group A', kind: 'web' });
  addService(w, 'mau-cho-build', { declared: commit('e'), running: commit('d'), published: [commit('d')], port: 8002, project: 'Sample group B', kind: 'worker' });
  w.unhealthy.add(BROKEN);
  return w;
}

module.exports = { emptyWorld, addService, sampleWorld, PLATFORM, BROKEN, commit };
