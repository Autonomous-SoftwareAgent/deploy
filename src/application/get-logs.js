'use strict';
// spec: BDK-S-004
// Ca sử dụng XEM LOG: mấy dòng cuối mà một dịch vụ đang chạy in ra (log của container), cho người vận hành nhìn nhanh trên
// bảng điều khiển. Chỉ đọc. Đây không phải hệ thu log: dòng cũ hơn giới hạn của Docker, hay của bản đã bị thay, thì không có.
const MAX_TAIL = 500;

/** Một dòng log của Docker (có dấu thời gian đứng đầu) thành { at, text }. Dòng không có dấu thời gian: at là null. */
function parseLine(line) {
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s(.*)$/.exec(line);
  return m ? { at: m[1], text: m[2] } : { at: null, text: line };
}

/** @param {{runtime: import('./ports').Runtime}} deps */
function makeGetLogs({ runtime }) {
  /** Trả { ok: true, lines: [{at, text}] } hoặc { ok: false, reason }. */
  return async function getLogs({ service, tail = 200 }) {
    const n = Math.max(1, Math.min(MAX_TAIL, Number(tail) || 200));
    const text = await runtime.logs(service, n);
    if (text === null) return { ok: false, reason: 'the service has no container on this environment' };
    return { ok: true, lines: text.split('\n').filter(Boolean).slice(-n).map(parseLine) };
  };
}

module.exports = { makeGetLogs, parseLine, MAX_TAIL };
