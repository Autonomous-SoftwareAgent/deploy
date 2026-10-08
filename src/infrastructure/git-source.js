'use strict';
// Cổng Source bằng lệnh git và tar trên repo của dịch vụ ở máy này.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { COMMIT_RE, short } = require('../domain/naming');

function makeGitSource({ layout, run }) {
  function git(repo, args) {
    const dir = layout.repo(repo);
    const r = run('git', ['-C', dir, ...args]);
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} (ở ${dir}): ${r.stderr.trim() || 'lỗi'}`);
    return r.stdout.trim();
  }
  return {
    async has(repo) { return fs.existsSync(path.join(layout.repo(repo), '.git')); },
    /** Máy này có repo của dịch vụ không (máy của GitHub chỉ có repo deploy nên không có). */
    async anyPresent(manifest) {
      return Object.values(manifest.services).some((s) => s && typeof s.repo === 'string' && fs.existsSync(layout.repo(s.repo.split(/[\\/]/)[0])));
    },
    async head(repo) { return git(repo, ['rev-parse', 'HEAD']); },
    async dirtyCount(repo) { return git(repo, ['status', '--porcelain']).split('\n').filter(Boolean).length; },
    async resolve(repo, ref) {
      const dir = layout.repo(repo);
      const r = run('git', ['-C', dir, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      const full = r.stdout.trim();
      if (r.status !== 0 || !COMMIT_RE.test(full)) throw new Error(`không có commit "${ref}" trong ${dir}`);
      return full;
    },
    async subject(repo, commit) { return git(repo, ['log', '-1', '--format=%s', commit]); },
    /** Lịch sử của nhánh đang lấy ra, mới trước. Các trường cách nhau bằng ký tự 0x1f, không thể có trong tên hay lời nhắn một dòng. */
    async log(repo, limit) {
      const n = Math.max(1, Math.min(500, Number(limit) || 50));
      const out = git(repo, ['log', '-n', String(n), '--format=%H%x1f%an%x1f%aI%x1f%s']);
      return out.split('\n').filter(Boolean).map((line) => { const [sha, author, at, message] = line.split('\x1f'); return { sha, author, at, message: message || '' }; });
    },
    /**
     * Trích ĐÚNG một commit ra thư mục tạm. Không đọc thư mục làm việc: tệp sửa dở và tệp chưa theo dõi không bao giờ có mặt.
     * Dùng `git archive` (không đụng index hay worktree) rồi `tar` có sẵn của hệ điều hành.
     */
    async extract(repo, commit, key) {
      if (!COMMIT_RE.test(commit)) throw new Error('extract cần mã commit đủ 40 ký tự');
      const dest = path.join(os.tmpdir(), 'bsn-build', `${key}-${short(commit)}`);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(dest, { recursive: true });
      const tarFile = path.join(dest, '..', path.basename(dest) + '.tar');
      // core.autocrlf=false: trên Windows git mặc định đổi xuống dòng thành CRLF khi xuất, làm hỏng tệp chạy trong ảnh Linux.
      let r = run('git', ['-c', 'core.autocrlf=false', '-C', layout.repo(repo), 'archive', '--format=tar', '-o', tarFile, commit]);
      if (r.status !== 0) throw new Error(`git archive ${short(commit)}: ${r.stderr.trim()}`);
      // Chạy tar ngay trong thư mục chứa tệp và dùng tên tương đối: đường dẫn có ổ đĩa làm tar của Git Bash hiểu nhầm là máy từ xa.
      r = run('tar', ['-xf', path.basename(tarFile), '-C', path.basename(dest)], { cwd: path.dirname(tarFile) });
      fs.rmSync(tarFile, { force: true });
      if (r.status !== 0) throw new Error(`tar: ${r.stderr.trim()}`);
      return dest;
    },
    async discard(dir) { fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

module.exports = { makeGitSource };
