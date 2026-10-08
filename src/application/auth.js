'use strict';
// Ca sử dụng ĐĂNG NHẬP vào bảng điều khiển: tên `admin` cùng một mật khẩu quản trị cho người (trình duyệt hỏi bằng hộp thoại
// của nó và gửi kèm mọi yêu cầu, HTTP Basic), một token cho agent. Không có phiên, không có cookie.
// Nơi lưu chỉ giữ dạng băm; bản rõ được công bố MỘT lần lúc sinh. Sai mật khẩu nhiều lần thì khóa tạm.
const SCHEMA = 1;
const ADMIN = 'admin';
const MAX_FAILS = 5;
const LOCKOUT_MS = 60000;
const MAX_PASSWORD = 200;

/**
 * @param {{credentials: import('./ports').Credentials, hasher: import('./ports').Hasher, random: import('./ports').Random, clock: import('./ports').Clock}} ports
 */
function makeAuth({ credentials, hasher, random, clock }) {
  let verified = null; // dấu của mật khẩu đã qua phép băm chậm; chỉ nằm trong bộ nhớ
  const fails = { count: 0, until: 0 };
  let record = null;

  async function load() {
    const found = await credentials.load();
    if (found && Number(found.schema) > SCHEMA) throw new Error(`thông tin đăng nhập đã lưu có schema ${found.schema}, bản này chỉ hiểu tới ${SCHEMA}`);
    record = found && found.password && found.password.salt && found.password.hash && found.tokenSha256 ? found : null;
    return record;
  }

  /** Sinh mật khẩu và token nếu chưa có (reset: sinh lại cả hai, mật khẩu và token cũ hết dùng ngay). Trả {created, where?}. */
  async function ensure({ reset = false } = {}) {
    if (!reset && (await load())) return { created: false };
    const password = random.bytes(15).toString('base64url');
    const token = 'bsn_' + random.bytes(30).toString('base64url');
    const salt = random.bytes(16).toString('hex');
    record = { schema: SCHEMA, password: { salt, hash: hasher.slowHash(password, salt) }, tokenSha256: hasher.fastHash(token) };
    await credentials.save(record);
    verified = null;
    const where = await credentials.publishFirstLogin([
      'Bảng điều khiển deploy của BSN: thông tin đăng nhập (sinh ngẫu nhiên trên máy này).',
      'ĐỌC XONG THÌ XÓA. Bảng điều khiển chỉ giữ dạng băm, không đọc lại nội dung này.',
      'Quên thì sinh lại: node infra/bsn.js console --reset-auth',
      '',
      `Tên đăng nhập trên trình duyệt: ${ADMIN}`,
      `Mật khẩu quản trị (đăng nhập trên trình duyệt): ${password}`,
      `Token cho agent (header "Authorization: Bearer <token>"): ${token}`,
      '',
    ].join('\n'));
    return { created: true, where };
  }

  /**
   * Kiểm tên và mật khẩu của người (trình duyệt gửi kèm MỌI yêu cầu, theo HTTP Basic).
   * Lần đúng đầu tiên phải qua phép băm chậm; các lần sau so với một dấu giữ trong bộ nhớ, để mỗi yêu cầu không tốn một lần băm chậm.
   * Trả {ok: true, who} hoặc {ok: false, code: 'WRONG'|'LOCKED_OUT', retrySeconds?}.
   */
  async function basic(user, password) {
    const now = clock.millis();
    if (fails.until > now) return { ok: false, code: 'LOCKED_OUT', retrySeconds: Math.ceil((fails.until - now) / 1000) };
    const rec = record || (await load());
    const sane = !!rec && user === ADMIN && typeof password === 'string' && password.length <= MAX_PASSWORD;
    const mark = sane ? hasher.fastHash(`${rec.password.salt}\n${password}`) : null;
    let good = sane && verified !== null && hasher.equal(mark, verified);
    if (sane && !good && hasher.equal(hasher.slowHash(password, rec.password.salt), rec.password.hash)) { good = true; verified = mark; }
    if (!good) {
      if (++fails.count >= MAX_FAILS) { fails.count = 0; fails.until = now + LOCKOUT_MS; }
      return { ok: false, code: 'WRONG' };
    }
    fails.count = 0;
    return { ok: true, who: { actor: ADMIN, via: 'basic' } };
  }

  /** Agent: token đúng thì trả {actor: 'agent'}; sai thì null. */
  async function identify({ token }) {
    const rec = record || (await load());
    return rec && token !== undefined && token !== null && hasher.equal(hasher.fastHash(String(token)), rec.tokenSha256) ? { actor: 'agent', via: 'token' } : null;
  }

  return { ensure, basic, identify };
}

module.exports = { makeAuth, ADMIN };
