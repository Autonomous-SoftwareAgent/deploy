'use strict';
// Cổng SharedTier: PostgreSQL và broker dùng chung, chạy bằng local/docker-compose.yml của repo này.
const { must } = require('./process-runner');
const { TIER_PROJECT, PG, BROKER } = require('../domain/stack-plan');

function makeComposeSharedTier({ layout, run }) {
  const base = ['compose', '-p', TIER_PROJECT, '--env-file', layout.secrets, '-f', layout.tierCompose];
  const psql = (sql, flags) => must(run, 'docker', ['exec', PG.container, 'psql', '-U', PG.user, '-d', 'postgres', ...flags, sql], 'hỏi PostgreSQL');
  const rpk = (args, what) => must(run, 'docker', ['exec', BROKER.container, 'rpk', 'topic', ...args, '-X', 'brokers=localhost:9092'], what);
  return {
    async ensureUp() { must(run, 'docker', [...base, 'up', '-d', '--wait'], 'bật tầng dùng chung'); },
    async ensureDatabase(db) {
      if (!psql(`SELECT 1 FROM pg_database WHERE datname='${db}'`, ['-tAc']).stdout.trim()) {
        must(run, 'docker', ['exec', PG.container, 'psql', '-U', PG.user, '-d', 'postgres', '-c', `CREATE DATABASE "${db}"`], 'tạo cơ sở dữ liệu');
      }
    },
    async ensureTopics(topics) {
      const have = rpk(['list'], 'liệt kê topic').stdout;
      const missing = topics.filter((t) => !new RegExp(`^${t.replace(/[.]/g, '\\.')}\\s`, 'm').test(have));
      if (missing.length) must(run, 'docker', ['exec', BROKER.container, 'rpk', 'topic', 'create', ...missing, '-p', '3', '-X', 'brokers=localhost:9092'], 'tạo topic');
    },
    async down({ volumes }) { must(run, 'docker', [...base, 'down', ...(volumes ? ['--volumes'] : [])], 'tắt tầng dùng chung'); },
  };
}

module.exports = { makeComposeSharedTier };
