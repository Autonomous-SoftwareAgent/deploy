'use strict';
// Cách đặt tên của nền: dịch vụ, commit, bản đóng gói, container. Thuần: không đọc tệp, không gọi lệnh.

const NAME_RE = /^[a-z][a-z0-9-]{0,30}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const COMMIT_PREFIX_RE = /^[0-9a-f]{7,39}$/;
const ENV_RE = /^[A-Z][A-Z0-9_]*$/;

// Nhãn ghi mã commit bên trong một bản: nhãn chuẩn do CI ghi, và nhãn riêng của lệnh build tại chỗ.
const REVISION_LABEL = 'org.opencontainers.image.revision';
const COMMIT_LABEL = 'bsn.commit';

const short = (commit) => String(commit).slice(0, 12);

/** Nhãn của bản ở máy: bsn-<tên>:<12 ký tự commit>. */
const localImage = (name, commit) => `bsn-${name}:${short(commit)}`;

const containerName = (name) => `bsn-${name}`;

/** Tên bản do CI đẩy lên kho: <tài-khoản>/<tiền-tố><dịch-vụ>:<nhánh>-<12 ký tự commit> (S-023). Không có nhãn latest. */
function remoteImage(platform, name, commit) {
  if (!platform || !platform.registry) throw new Error('thiếu infra/platform.json (registry.namespace) nên không biết kho ảnh trên Docker Hub');
  const r = platform.registry;
  return `${r.namespace}/${r.repoPrefix || ''}${name}:${r.branch || 'main'}-${short(commit)}`;
}

/** Mọi bản ở máy của một dịch vụ (bản chính rồi tới tiến trình chạy kèm), kèm tầng Dockerfile. */
function imageTargets(name, declaration) {
  const targets = [{ image: localImage(name, declaration.commit), target: declaration.build && declaration.build.target, main: true }];
  for (const [sidecar, sc] of Object.entries(declaration.sidecars || {})) targets.push({ image: localImage(sidecar, declaration.commit), target: sc.target, main: false });
  return targets;
}

/** Mã commit đọc từ hai nhãn của một bản; không hợp lệ thì chuỗi rỗng. */
function commitFromLabels(revision, own) {
  if (COMMIT_RE.test(revision || '')) return revision;
  return COMMIT_RE.test(own || '') ? own : '';
}

module.exports = { NAME_RE, COMMIT_RE, COMMIT_PREFIX_RE, ENV_RE, REVISION_LABEL, COMMIT_LABEL, short, localImage, containerName, remoteImage, imageTargets, commitFromLabels };
