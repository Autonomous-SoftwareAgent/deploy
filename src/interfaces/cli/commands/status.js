'use strict';
// status: commit được ghim so với HEAD, bản, container, cổng, và thông tin từ sổ deploy.
const short = (c) => String(c).slice(0, 12);

function line(s) {
  const pinned = s.pinned ? short(s.pinned) : 'CHƯA GHIM';
  const behind = s.pinned && !s.pinnedIsHead ? `, HEAD là ${short(s.head)} (bản ghim cũ hơn hoặc khác)` : s.pinned ? ', trùng HEAD' : '';
  const img = s.imageBuilt === null ? '-' : s.imageBuilt ? 'đã build' : 'chưa build';
  const live = s.running ? `đang chạy (${s.containerStatus})${s.runningCommit && s.pinned && s.runningCommit !== s.pinned ? ' TỪ COMMIT KHÁC BẢN GHIM' : ''}` : 'không chạy';
  return `${s.service}: ghim ${pinned}${behind}; ${s.uncommittedFiles} tệp chưa commit (không vào ảnh); ảnh ${img}; ${live}; cổng local ${s.portLocal}`;
}

function ledgerLine(s) {
  if (!s.deployed) return null;
  const last = s.lastAttempt;
  return `   sổ deploy: đang chạy ${short(s.deployed.commit)} (${s.deployed.action}, ${s.deployed.at})${s.previous ? `; bản liền trước ${short(s.previous)}` : ''}${last && last.result === 'failed' ? `; LẦN GẦN NHẤT HỎNG: ${last.action} ${short(last.commit)}` : ''}`;
}

module.exports = {
  name: 'status',
  // Máy chỉ có repo deploy (máy vừa chuẩn bị, chưa nhận dịch vụ nào) vẫn xem được trạng thái; máy có repo dịch vụ thì đòi đủ.
  requireRepos: 'if-present',
  usage: 'status',
  async run({ app, manifest, say, json }) {
    const status = await app.getStatus({ manifest });
    if (json) { say(JSON.stringify(status)); return 0; }
    if (!status.dockerReachable) say('(không hỏi được Docker; cột ảnh và container bỏ trống)');
    for (const s of status.services) { say(line(s)); const l = ledgerLine(s); if (l) say(l); }
    return 0;
  },
};
