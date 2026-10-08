'use strict';
// Ca sử dụng ĐĂNG NHẬP vào bảng điều khiển: tên `admin` cùng một mật khẩu quản trị cho người (trình duyệt hỏi bằng hộp thoại
// của nó và gửi kèm mọi yêu cầu, HTTP Basic), một token cho agent. Không có phiên, không có cookie.
// Ngoài admin còn có người dùng do admin tạo, mỗi người một vai trò (quyền theo vai trò: domain/access.js).
// Nơi lưu chỉ giữ dạng băm; bản rõ được công bố MỘT lần lúc sinh. Sai mật khẩu nhiều lần thì khóa tạm.
const { ROLES, ADMIN_ROLE } = require('../domain/access');

const SCHEMA = 1;
const ADMIN = 'admin';
const AGENT = 'agent';
const RESERVED = [ADMIN, AGENT];
const NAME_RE = /^[a-z][a-z0-9._-]{1,30}$/;
const MAX_FAILS = 5;
const LOCKOUT_MS = 60000;
const MAX_PASSWORD = 200;

/**
 * @param {{credentials: import('./ports').Credentials, hasher: import('./ports').Hasher, random: import('./ports').Random, clock: import('./ports').Clock}} ports
 */
function makeAuth({ credentials, hasher, random, clock }) {
  const verified = new Map(); // tên -> dấu của mật khẩu đã qua phép băm chậm; chỉ nằm trong bộ nhớ
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
    const old = await load();
    if (!reset && old) return { created: false };
    const password = random.bytes(15).toString('base64url');
    const token = 'bsn_' + random.bytes(30).toString('base64url');
    const salt = random.bytes(16).toString('hex');
    // Sinh lại chỉ đổi mật khẩu quản trị và token; người dùng đã tạo được giữ nguyên.
    record = { schema: SCHEMA, password: { salt, hash: hasher.slowHash(password, salt) }, tokenSha256: hasher.fastHash(token), users: (old && old.users) || [] };
    await credentials.save(record);
    verified.delete(ADMIN);
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
   * Kiểm tên và mật khẩu của người (trình duyệt gửi kèm MỌI yêu cầu, theo HTTP Basic). Người là `admin` hoặc một người dùng đã tạo.
   * Lần đúng đầu tiên phải qua phép băm chậm; các lần sau so với một dấu giữ trong bộ nhớ, để mỗi yêu cầu không tốn một lần băm chậm.
   * Trả {ok: true, who: {actor, role, via}} hoặc {ok: false, code: 'WRONG'|'LOCKED_OUT', retrySeconds?}.
   */
  async function basic(user, password) {
    const now = clock.millis();
    if (fails.until > now) return { ok: false, code: 'LOCKED_OUT', retrySeconds: Math.ceil((fails.until - now) / 1000) };
    const rec = record || (await load());
    const found = !rec ? null : user === ADMIN ? { name: ADMIN, role: ADMIN_ROLE, ...rec.password } : (rec.users || []).find((u) => u.name === user) || null;
    const sane = !!found && typeof password === 'string' && password.length <= MAX_PASSWORD;
    const mark = sane ? hasher.fastHash(`${found.salt}\n${password}`) : null;
    let good = sane && verified.has(found.name) && hasher.equal(mark, verified.get(found.name));
    if (sane && !good && hasher.equal(hasher.slowHash(password, found.salt), found.hash)) { good = true; verified.set(found.name, mark); }
    if (!good) {
      if (++fails.count >= MAX_FAILS) { fails.count = 0; fails.until = now + LOCKOUT_MS; }
      return { ok: false, code: 'WRONG' };
    }
    fails.count = 0;
    return { ok: true, who: { actor: found.name, role: found.role, via: 'basic' } };
  }

  /** Agent: token đúng thì trả người gọi có vai trò Agent; sai thì null. */
  async function identify({ token }) {
    const rec = record || (await load());
    return rec && token !== undefined && token !== null && hasher.equal(hasher.fastHash(String(token)), rec.tokenSha256) ? { actor: AGENT, role: 'Agent', via: 'token' } : null;
  }

  const refuse = (outcome, reason) => ({ ok: false, outcome, reason });
  const publicUser = (u) => ({ name: u.name, role: u.role, createdAt: u.createdAt || null });
  const fresh = () => { const password = random.bytes(15).toString('base64url'); const salt = random.bytes(16).toString('hex'); return { password, salt, hash: hasher.slowHash(password, salt) }; };

  async function change(fn) {
    const rec = record || (await load());
    if (!rec) return refuse('NOT_READY', 'the console has no credentials yet');
    const users = [...(rec.users || [])];
    const res = fn(users);
    if (!res.ok) return res;
    record = { ...rec, users };
    await credentials.save(record);
    return res;
  }

  /** Người dùng ngoài admin: tên và vai trò (không bao giờ trả băm). */
  async function users() { const rec = record || (await load()); return ((rec && rec.users) || []).map(publicUser); }

  /** Tạo người dùng. Mật khẩu sinh ngẫu nhiên, trả về ĐÚNG MỘT lần trong kết quả; nơi lưu chỉ giữ dạng băm. */
  const addUser = ({ name, role }) => change((list) => {
    if (typeof name !== 'string' || !NAME_RE.test(name) || RESERVED.includes(name)) return refuse('BAD_INPUT', 'user name: 2 to 31 lowercase letters, digits, dot, dash or underscore, starting with a letter; admin and agent are reserved');
    if (!ROLES.includes(role) || role === 'Agent') return refuse('BAD_INPUT', `role must be one of: ${ROLES.filter((r) => r !== 'Agent').join(', ')}`);
    if (list.some((u) => u.name === name)) return refuse('CONFLICT', `user ${name} already exists`);
    const f = fresh();
    list.push({ name, role, salt: f.salt, hash: f.hash, createdAt: clock.now() });
    return { ok: true, user: { name, role }, password: f.password };
  });

  const setRole = (name, role) => change((list) => {
    const u = list.find((x) => x.name === name);
    if (!u) return refuse('NOT_FOUND', `no user ${name}`);
    if (!ROLES.includes(role) || role === 'Agent') return refuse('BAD_INPUT', 'unknown role');
    list[list.indexOf(u)] = { ...u, role };
    return { ok: true, user: { name, role } };
  });

  const removeUser = (name) => change((list) => {
    const i = list.findIndex((x) => x.name === name);
    if (i < 0) return refuse('NOT_FOUND', `no user ${name}`);
    list.splice(i, 1); verified.delete(name);
    return { ok: true };
  });

  /** Sinh lại mật khẩu của một người dùng; mật khẩu cũ hết dùng ngay. */
  const resetPassword = (name) => change((list) => {
    const u = list.find((x) => x.name === name);
    if (!u) return refuse('NOT_FOUND', `no user ${name}`);
    const f = fresh();
    list[list.indexOf(u)] = { ...u, salt: f.salt, hash: f.hash }; verified.delete(name);
    return { ok: true, user: { name, role: u.role }, password: f.password };
  });

  return { ensure, basic, identify, users, addUser, setRole, removeUser, resetPassword };
}

module.exports = { makeAuth, ADMIN, AGENT };
