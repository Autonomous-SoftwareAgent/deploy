'use strict';
// Bộ nối trong bộ nhớ cho các cổng LƯU TRỮ: Declarations, Ledger, Locks, Secrets, ConfigFiles, Credentials.
// Cùng hành vi với bộ nối trên đĩa (bộ test hợp đồng giữ điều đó), chỉ khác là mọi thứ nằm trong đối tượng world.
const ledgerOf = require('../../domain/ledger');

const clone = (v) => JSON.parse(JSON.stringify(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeMemoryStorage(world) {
  const declarations = {
    async load() { return clone(world.manifest); },
    async save(name, declaration) { world.manifest.services[name] = clone(declaration); },
  };

  const locks = {
    async acquire(key, info = {}) {
      if (world.locks.has(key)) return { ok: false, holder: world.locks.get(key) };
      world.locks.set(key, { pid: 1, ...info });
      return { ok: true };
    },
    async release(key) { world.locks.delete(key); },
    async holder(key) { return world.locks.get(key) || null; },
    async within(key, fn) {
      const until = Date.now() + 30000;
      while (!(await locks.acquire(key)).ok) {
        if (Date.now() > until) throw new Error(`không lấy được khóa "${key}" sau 30 giây`);
        await sleep(5);
      }
      try { return await fn(); } finally { await locks.release(key); }
    },
  };

  const ledger = {
    async read() { return ledgerOf.accept(clone(world.ledger), 'bộ nhớ'); },
    async append(name, entry) {
      await locks.within('ledger', async () => { ledgerOf.accept(world.ledger, 'bộ nhớ'); ledgerOf.record(world.ledger, name, clone(entry)); });
    },
  };

  const secrets = {
    async ensure(names) {
      for (const n of names) if (!world.secrets[n]) world.secrets[n] = `bi-mat-gia-${n}`.padEnd(48, '0');
      return { ...world.secrets };
    },
  };

  const configFiles = {
    async stale(name, declaration) { return !!(declaration.files && declaration.files.length) && world.files.get(name) !== declaration.commit; },
    async install(name, declaration) { if (declaration.files && declaration.files.length) world.files.set(name, declaration.commit); },
    hostPath: (name, from) => `/bo-nho/files/${name}/${from}`,
  };

  const credentials = {
    async load() { return world.credentials ? clone(world.credentials) : null; },
    async save(record) { world.credentials = clone(record); },
    async publishFirstLogin(text) { world.firstLogin = text; return '(bộ nhớ: world.firstLogin)'; },
  };

  return { declarations, locks, ledger, secrets, configFiles, credentials };
}

module.exports = { makeMemoryStorage };
