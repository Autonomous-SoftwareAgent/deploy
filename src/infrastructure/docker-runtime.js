'use strict';
// Cổng Runtime bằng lệnh docker trên máy này. Bộ nối chỉ dịch lời gọi của cổng thành lệnh docker;
// luật (bản nào được chạy, hỏng thì làm gì) nằm ở domain và application.
const fs = require('node:fs');
const path = require('node:path');
const { REVISION_LABEL, COMMIT_LABEL, COMMIT_RE, containerName, commitFromLabels } = require('../domain/naming');

const tail = (r, n) => (r.stderr || r.stdout).trim().split('\n').slice(-n);

function makeDockerRuntime({ layout, run }) {
  const stackArgs = (key, project) => ['compose', '-p', project, '-f', layout.stack(key)];
  const projectOf = (key) => JSON.parse(fs.readFileSync(layout.stack(key), 'utf8')).name;
  return {
    /** Container đang chạy: tên -> {commit, status}. Không hỏi được Docker thì null. */
    async list() {
      const r = run('docker', ['ps', '--format', `{{.Names}}\t{{.Label "${COMMIT_LABEL}"}}\t{{.Status}}`]);
      if (r.status !== 0) return null;
      return new Map(r.stdout.split('\n').filter(Boolean).map((l) => { const [n, c, s] = l.split('\t'); return [n, { commit: c, status: s }]; }));
    },
    async runningCommit(name) {
      const r = run('docker', ['ps', '--filter', `name=^${containerName(name)}$`, '--format', `{{.Label "${COMMIT_LABEL}"}}`]);
      const c = r.status === 0 ? r.stdout.trim().split('\n')[0] : '';
      return COMMIT_RE.test(c) ? c : null;
    },
    async hasImage(image) { return run('docker', ['image', 'inspect', image]).status === 0; },
    /** Commit ghi BÊN TRONG một bản đang có ở máy (nhãn do CI ghi, hoặc nhãn của lệnh build tại chỗ). */
    async imageCommit(image) {
      const r = run('docker', ['image', 'inspect', '--format', `{{ index .Config.Labels "${REVISION_LABEL}" }}|{{ index .Config.Labels "${COMMIT_LABEL}" }}`, image]);
      if (r.status !== 0) return '';
      const [revision, own] = r.stdout.trim().split('|');
      return commitFromLabels(revision, own);
    },
    async pull(remote, opts = {}) {
      const r = run('docker', ['pull', remote], { stdio: opts.verbose ? 'inherit' : 'pipe' });
      return { ok: r.status === 0, detail: r.status === 0 ? '' : tail(r, 3).join(' ') };
    },
    async tag(from, to) {
      const r = run('docker', ['tag', from, to]);
      if (r.status !== 0) throw new Error(`docker tag ${from}: ${r.stderr.trim()}`);
    },
    async build({ image, dir, commit, target }, opts = {}) {
      const args = ['build', '-t', image, '--label', `${COMMIT_LABEL}=${commit}`, '--label', `${REVISION_LABEL}=${commit}`];
      if (target) args.push('--target', target);
      args.push(dir);
      const r = run('docker', args, { stdio: opts.verbose ? 'inherit' : 'pipe' });
      if (r.status !== 0) throw new Error(`docker build ${image} hỏng:\n${(r.stderr || r.stdout).split('\n').slice(-25).join('\n')}`);
    },
    /** Ghi mô tả chạy ra đĩa rồi bật. key phân biệt các mô tả ("services": cả hệ; "deploy.<tên>": một dịch vụ). */
    async applyStack(key, plan, opts = {}) {
      fs.mkdirSync(path.dirname(layout.stack(key)), { recursive: true });
      fs.writeFileSync(layout.stack(key), JSON.stringify(plan, null, 2), { mode: 0o600 });
      // Không --remove-orphans khi mô tả chỉ có MỘT dịch vụ: các dịch vụ khác trong cùng dự án phải được để yên.
      const r = run('docker', [...stackArgs(key, plan.name), 'up', '-d', ...(opts.removeOrphans ? ['--remove-orphans'] : [])]);
      if (r.status !== 0) throw new Error(tail(r, opts.removeOrphans ? 12 : 6).join(opts.removeOrphans ? '\n' : ' '));
    },
    async hasStack(key) { return fs.existsSync(layout.stack(key)); },
    async removeStack(key) {
      const r = run('docker', [...stackArgs(key, projectOf(key)), 'down', '--remove-orphans']);
      if (r.status !== 0) throw new Error(tail(r, 12).join('\n'));
    },
  };
}

module.exports = { makeDockerRuntime };
