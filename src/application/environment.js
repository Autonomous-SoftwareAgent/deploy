'use strict';
// Một MÔI TRƯỜNG của bảng điều khiển: một đích chạy hệ (máy này, hoặc một máy từ xa), nhìn qua hai ca sử dụng đọc có cùng
// hình dạng ở mọi loại đích: check (tờ khai báo của đích đó đọc được không) và getStatus (đang chạy gì, sổ ghi gì).
// Bảng điều khiển không biết đích là loại nào: composition lắp ca sử dụng thật, từ xa, hay trong bộ nhớ vào đây.

/**
 * @param {{id: string, name: string, color: string, description?: string, kind: 'local'|'remote'|'memory',
 *          check: Function, getStatus: Function}} deps
 */
function makeEnvironment({ id, name, color, description = '', kind, check, getStatus, getLogs }) {
  return {
    id, name, color, description, kind,
    /** Mấy dòng log cuối của một dịch vụ ở môi trường này. Trả { ok, lines } hoặc { ok: false, reason }. Không ném lỗi. */
    async logs(service, tail) {
      if (!getLogs) return { ok: false, reason: 'this environment does not expose logs' };
      try { return await getLogs({ service, tail }); } catch (e) { return { ok: false, reason: e.message }; }
    },
    /** Trả { ok: true, services: [dòng trạng thái] } hoặc { ok: false, unreachable, error }. Không ném lỗi. */
    async status() {
      try {
        const checked = await check({ requireRepos: kind !== 'remote' });
        if (!checked.ok) return { ok: false, unreachable: !!checked.unreachable, error: checked.errors.join('; ') };
        const s = await getStatus({ manifest: checked.manifest });
        return s && Array.isArray(s.services) ? { ok: true, services: s.services } : { ok: false, unreachable: true, error: 'không đọc được trạng thái' };
      } catch (e) { return { ok: false, unreachable: true, error: e.message }; }
    },
  };
}

// Màu mặc định cho môi trường, lấy theo thứ tự (bảng màu của bản design). Người dùng đổi màu là việc của đợt cấu hình.
const PALETTE = Object.freeze(['#6B7686', '#7A4CC2', '#0E8383', '#B1275E', '#B46A00', '#2F6FDE', '#3B7D3B', '#5A4A42']);

module.exports = { makeEnvironment, PALETTE };
