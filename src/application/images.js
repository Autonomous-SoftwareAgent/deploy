'use strict';
// Có được bản để chạy: build tại chỗ từ ĐÚNG commit được ghim, hoặc kéo bản CI rồi kiểm commit ghi bên trong (S-017, S-023).
const { short, localImage, remoteImage, imageTargets } = require('../domain/naming');

/** @param {{source: import('./ports').Source, configFiles: import('./ports').ConfigFiles, runtime: import('./ports').Runtime}} ports */
function makeImages({ source, configFiles, runtime }) {
  /**
   * Các bước build một dịch vụ từ commit được ghim. opts.only: tập nhãn bản cần build (mặc định build hết).
   * Bước trích commit và chép tệp cấu hình luôn chạy.
   */
  function buildSteps(manifest, name, opts = {}) {
    const svc = manifest.services[name];
    if (!svc.commit) throw new Error(`${name}: chưa ghim commit (chạy: node infra/bsn.js pin ${name} --apply)`);
    const targets = imageTargets(name, svc).filter((t) => !opts.only || opts.only.has(t.image));
    const box = {};
    const steps = [{
      text: `trích commit ${short(svc.commit)} của ${name} ra thư mục tạm (không đọc thư mục làm việc)`,
      run: async () => { box.dir = await source.extract(svc.repo, svc.commit, name); await configFiles.install(name, svc, box.dir); },
    }];
    for (const t of targets) {
      steps.push({
        text: `docker build ${t.target ? `--target ${t.target} ` : ''}-> ${t.image}`,
        run: () => runtime.build({ image: t.image, dir: box.dir, commit: svc.commit, target: t.target }, { verbose: opts.verbose }),
      });
    }
    steps.push({ text: 'xóa thư mục tạm', run: () => source.discard(box.dir) });
    return steps;
  }

  /** Kéo bản CI về, kiểm đúng commit ghi BÊN TRONG bản, rồi gắn nhãn ở máy. Không khớp thì từ chối. Trả tên bản trên kho. */
  async function fetch(manifest, name, opts = {}) {
    const svc = manifest.services[name];
    const remote = remoteImage(manifest.platform, name, svc.commit);
    const pulled = await runtime.pull(remote, { verbose: opts.verbose });
    if (!pulled.ok) throw new Error(`không kéo được ${remote}: ${pulled.detail}\n(Commit này đã qua CI và có bản đóng gói chưa? Commit chỉ sửa tài liệu thì không có bản.)`);
    const inside = await runtime.imageCommit(remote);
    if (inside !== svc.commit) throw new Error(`${remote}: bên trong bản ghi commit "${inside || '(trống)'}", khác commit được ghim ${svc.commit}. Không dùng bản này.`);
    await runtime.tag(remote, localImage(name, svc.commit));
    return remote;
  }

  /** Nhãn các bản ở máy còn thiếu của một dịch vụ. mainToo=false: chỉ xét tiến trình chạy kèm. */
  async function missing(name, svc, { mainToo = true } = {}) {
    const out = new Set();
    for (const t of imageTargets(name, svc)) if ((mainToo || !t.main) && !(await runtime.hasImage(t.image))) out.add(t.image);
    return out;
  }

  return { buildSteps, fetch, missing };
}

module.exports = { makeImages };
