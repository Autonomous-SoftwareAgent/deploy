'use strict';
// Bộ nối trong bộ nhớ cho các cổng CHẠY và NGUỒN: Runtime, Registry, Source, SharedTier, Health, Clock.
const { COMMIT_RE, containerName, COMMIT_LABEL } = require('../../domain/naming');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeMemoryPlatform(world) {
  const runtime = {
    async list() { return new Map([...world.running].map(([n, v]) => [n, { commit: v.commit, status: v.status }])); },
    async runningCommit(name) { const c = world.running.get(containerName(name)); return c && COMMIT_RE.test(c.commit) ? c.commit : null; },
    async hasImage(image) { return world.images.has(image); },
    async imageCommit(image) { return world.images.get(image) || ''; },
    async pull(remote) {
      if (!world.published.has(remote)) return { ok: false, detail: 'manifest unknown' };
      world.images.set(remote, world.published.get(remote));
      return { ok: true, detail: '' };
    },
    async tag(from, to) { world.images.set(to, world.images.get(from)); },
    async build({ image, commit }) { world.images.set(image, commit); },
    async applyStack(key, plan) {
      for (const svc of Object.values(plan.services)) if (!world.images.has(svc.image)) throw new Error(`không có ảnh ${svc.image}`);
      world.stacks.set(key, plan);
      for (const svc of Object.values(plan.services)) {
        const port = svc.ports && svc.ports[0] ? Number(svc.ports[0].split(':')[1]) : null;
        world.running.set(svc.container_name, { commit: svc.labels[COMMIT_LABEL], status: 'Up (trong bộ nhớ)', port });
      }
    },
    async hasStack(key) { return world.stacks.has(key); },
    async removeStack(key) {
      for (const svc of Object.values((world.stacks.get(key) || { services: {} }).services)) world.running.delete(svc.container_name);
      world.stacks.delete(key);
    },
  };

  const registry = {
    async lookup(remote) { return world.published.has(remote) ? { present: true, reason: '' } : { present: false, reason: 'manifest unknown' }; },
  };

  const repoOf = (repo) => { const r = world.repos.get(repo); if (!r) throw new Error(`không có repo ${repo}`); return r; };
  const source = {
    async has(repo) { return world.repos.has(repo); },
    async anyPresent() { return world.repos.size > 0; },
    async head(repo) { return repoOf(repo).head; },
    async dirtyCount(repo) { return repoOf(repo).dirty; },
    async resolve(repo, ref) {
      const r = repoOf(repo);
      const found = ref === 'HEAD' ? [r.head] : [...r.commits].filter((c) => c.startsWith(ref));
      if (found.length !== 1) throw new Error(`không có commit "${ref}" trong ${repo}`);
      return found[0];
    },
    async subject(repo, commit) { return `commit ${commit.slice(0, 7)} (trong bộ nhớ)`; },
    async extract(repo, commit, key) {
      if (!COMMIT_RE.test(commit)) throw new Error('extract cần mã commit đủ 40 ký tự');
      if (!repoOf(repo).commits.has(commit)) throw new Error(`git archive ${commit.slice(0, 12)}: không có commit`);
      return `/bo-nho/build/${key}`;
    },
    async discard() { /* không có gì để dọn */ },
  };

  const sharedTier = {
    async ensureUp() { world.tierUp = true; },
    async ensureDatabase(db) { world.databases.add(db); },
    async ensureTopics(topics) { for (const t of topics) world.topics.add(t); },
    async down() { world.tierUp = false; },
  };

  const health = {
    /** Dịch vụ nghe ở cổng này đang chạy một commit nằm trong world.unhealthy thì không khỏe. */
    async waitHealthy({ port }, seconds) {
      if (world.delayMs) await sleep(world.delayMs);
      const live = [...world.running.values()].find((c) => c.port === port);
      if (!live) throw new Error(`không khỏe sau ${seconds} giây (ECONNREFUSED)`);
      if (world.unhealthy.has(live.commit)) throw new Error(`không khỏe sau ${seconds} giây (HTTP 500)`);
    },
  };

  // Đồng hồ tự nhích một giây mỗi lần hỏi, để thứ tự các dòng trong sổ đoán trước được.
  const clock = { now: () => new Date((world.time += 1000)).toISOString(), millis: () => world.time };

  return { runtime, registry, source, sharedTier, health, clock };
}

module.exports = { makeMemoryPlatform };
