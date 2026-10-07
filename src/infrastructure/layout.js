'use strict';
// Các đường dẫn trên đĩa của một bản cài. root là thư mục làm việc chung (nơi có repo của các dịch vụ);
// thư mục của repo deploy thường là <root>/infra. Repo deploy còn chạy một mình (máy của GitHub), nơi thư mục chứa nó
// tên gì cũng được: khi root đúng là thư mục cha của repo này thì dùng chính thư mục của repo. Test dùng root giả
// nên luôn ra <root>/infra (D-002).
const path = require('node:path');

const REPO_DIR = path.resolve(__dirname, '..', '..');

function makeLayout(root) {
  const base = path.resolve(root) === path.resolve(REPO_DIR, '..') ? REPO_DIR : path.join(root, 'infra');
  const run = path.join(base, 'local', '.run');
  return Object.freeze({
    root,
    base,
    run,
    services: path.join(base, 'services'),
    platform: path.join(base, 'platform.json'),
    tierCompose: path.join(base, 'local', 'docker-compose.yml'),
    secrets: path.join(run, 'secrets.env'),
    ledger: path.join(run, 'deployments.json'),
    files: (name) => path.join(run, 'files', name),
    lock: (key) => path.join(run, `lock.${key}.json`),
    stack: (key) => path.join(run, `${key}.compose.json`),
    repo: (rel) => path.join(root, rel),
  });
}

module.exports = { makeLayout, REPO_DIR };
