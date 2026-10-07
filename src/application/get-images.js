'use strict';
// Ca sử dụng XEM BẢN ĐÓNG GÓI: bản của mọi commit đã khai đã có trên kho chưa. Bằng chứng một commit đã qua CI là bản của nó
// có trên kho (S-019, S-023). Khai báo đi TRƯỚC bản (S-029): commit vừa khai mà chưa có bản là "chờ build", không phải lỗi.
const { remoteImage } = require('../domain/naming');

/** @param {{registry: import('./ports').Registry}} ports */
function makeGetImages({ registry }) {
  return async function getImages({ manifest }) {
    const images = [];
    for (const [name, svc] of Object.entries(manifest.services)) {
      if (!svc.commit) { images.push({ service: name, commit: null, image: null, present: false, reason: 'chưa ghim' }); continue; }
      const image = remoteImage(manifest.platform, name, svc.commit);
      const found = await registry.lookup(image);
      images.push({ service: name, commit: svc.commit, image, present: found.present, reason: found.reason });
    }
    return { ok: images.every((r) => r.present), waiting: images.filter((r) => !r.present).map((r) => r.service), images };
  };
}

module.exports = { makeGetImages };
