'use strict';
// Ca sử dụng ĐĂNG NHẬP vào bảng điều khiển: một mật khẩu quản trị cho người (đổi lấy phiên có hạn), một token cho agent.
// Nơi lưu chỉ giữ dạng băm; bản rõ được công bố MỘT lần lúc sinh. Sai mật khẩu nhiều lần thì khóa tạm.
const SCHEMA = 1;
const SESSION_SECONDS = 8 * 3600;
const MAX_FAILS = 5;
const LOCKOUT_MS = 60000;
const MAX_PASSWORD = 200;

/**
 * @param {{credentials: import('./ports').Credentials, hasher: import('./ports').Hasher, random: import('./ports').Random, clock: import('./ports').Clock}} ports
 */
function makeAuth({ credentials, hasher, random, clock }) {
  const sessions = new Map(); // mã phiên -> hạn (mili giây)
  const fails = { count: 0, until: 0 };
  let record = null;

  async function load() {
    const found = await credentials.load();
    if (found && Number(found.schema) > SCHEMA) throw new Error(`thông tin đăng nhập đã lưu có schema ${found.schema}, bản này chỉ hiểu tới ${SCHEMA}`);
    record = found && found.password && found.password.salt && found.password.hash && found.tokenSha256 ? found : null;
    return record;
  }

  /** Sinh mật khẩu và token nếu chưa có (reset: sinh lại cả hai, mọi phiên đang mở hết dùng). Trả {created, where?}. */
  async function ensure({ reset = false } = {}) {
    if (!reset && (await load())) return { created: false };
    const password = random.bytes(15).toString('base64url');
    const token = 'bsn_' + random.bytes(30).toString('base64url');
    const salt = random.bytes(16).toString('hex');
    record = { schema: SCHEMA, password: { salt, hash: hasher.slowHash(password, salt) }, tokenSha256: hasher.fastHash(token) };
    await credentials.save(record);
    sessions.clear();
    const where = await credentials.publishFirstLogin([
      'Bảng điều khiển deploy của BSN: thông tin đăng nhập (sinh ngẫu nhiên trên máy này).',
      'ĐỌC XONG THÌ XÓA. Bảng điều khiển chỉ giữ dạng băm, không đọc lại nội dung này.',
      'Quên thì sinh lại: node infra/bsn.js console --reset-auth',
      '',
      `Mật khẩu quản trị (đăng nhập trên trình duyệt): ${password}`,
      `Token cho agent (header "Authorization: Bearer <token>"): ${token}`,
      '',
    ].join('\n'));
    return { created: true, where };
  }

  /** Đổi mật khẩu lấy một phiên. Trả {ok, sid, maxAge} hoặc {ok:false, code: 'WRONG'|'LOCKED_OUT', retrySeconds?}. */
  async function login(password) {
    const now = clock.millis();
    if (fails.until > now) return { ok: false, code: 'LOCKED_OUT', retrySeconds: Math.ceil((fails.until - now) / 1000) };
    const rec = record || (await load());
    const good = !!rec && typeof password === 'string' && password.length <= MAX_PASSWORD && hasher.equal(hasher.slowHash(password, rec.password.salt), rec.password.hash);
    if (!good) {
      if (++fails.count >= MAX_FAILS) { fails.count = 0; fails.until = now + LOCKOUT_MS; }
      return { ok: false, code: 'WRONG' };
    }
    fails.count = 0;
    const sid = random.bytes(24).toString('hex');
    sessions.set(sid, now + SESSION_SECONDS * 1000);
    return { ok: true, sid, maxAge: SESSION_SECONDS };
  }

  /** Ai đang gọi: {actor: 'agent'} với token đúng, {actor: 'admin', sid} với phiên còn hạn; còn lại null. */
  async function identify({ token, sid }) {
    const rec = record || (await load());
    if (token !== undefined && token !== null) return rec && hasher.equal(hasher.fastHash(String(token)), rec.tokenSha256) ? { actor: 'agent', via: 'token' } : null;
    if (sid && sessions.has(sid)) {
      if (sessions.get(sid) > clock.millis()) return { actor: 'admin', via: 'session', sid };
      sessions.delete(sid);
    }
    return null;
  }

  return { ensure, login, identify, logout: async (sid) => { sessions.delete(sid); } };
}

module.exports = { makeAuth, SESSION_SECONDS };
