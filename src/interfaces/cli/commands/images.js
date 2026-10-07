'use strict';
// images [--strict]: bản đóng gói của mọi commit được ghim đã có trên Docker Hub chưa. Chỉ đọc, không kéo về.
// --strict dùng ở chỗ cần chắc mọi bản đã có (trước khi deploy): thiếu bất kỳ bản nào thì mã thoát 1.
module.exports = {
  name: 'images',
  usage: 'images [--strict]',
  requireRepos: 'if-present',
  async run({ app, manifest, flags, say, json }) {
    const strict = flags.has('strict');
    const res = await app.getImages({ manifest });
    if (json) say(JSON.stringify({ ok: res.ok, strict, waiting: res.waiting, images: res.images }));
    else for (const r of res.images) say(`${r.service}: ${r.present ? 'CÓ' : 'CHỜ BUILD'} ${r.image || '(chưa ghim)'}${r.present ? '' : ` (${r.reason})`}`);
    if (!res.ok && !json) say('"Chờ build": commit đã khai nhưng chưa có bản đóng gói. Bản sinh ra khi commit đó được đẩy lên nhánh main của dịch vụ và test qua (hoặc chạy lại workflow của dịch vụ). Chưa có bản thì chưa deploy được.');
    return res.ok || !strict ? 0 : 1;
  },
};
