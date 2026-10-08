'use strict';
// CỔNG: những gì các ca sử dụng cần ở thế giới bên ngoài. Lớp application chỉ biết tệp này; bộ nối nằm ở src/infrastructure.
// Mọi hàm trả Promise, để một bộ nối sau này gọi máy từ xa được mà ca sử dụng không phải đổi.
// JavaScript không có interface: hình dạng dưới đây được giữ bằng bộ test hợp đồng (test/contract/), chạy cho cả bộ nối
// thật lẫn bộ nối trong bộ nhớ.

/**
 * @typedef {object} Manifest
 * @property {Object<string, object>} services  tên dịch vụ -> tờ khai báo
 * @property {object|null} platform             nội dung platform.json
 *
 * @typedef {object} Declarations  Tờ khai báo của các dịch vụ.
 * @property {() => Promise<Manifest>} load
 * @property {(name: string, declaration: object) => Promise<void>} save  ghi tờ của ĐÚNG một dịch vụ
 *
 * @typedef {object} Source  Repo mã nguồn của dịch vụ (đường dẫn tương đối như khai trong tờ khai báo).
 * @property {(repo: string) => Promise<boolean>} has
 * @property {(manifest: Manifest) => Promise<boolean>} anyPresent  máy này có repo dịch vụ nào không
 * @property {(repo: string) => Promise<string>} head
 * @property {(repo: string) => Promise<number>} dirtyCount
 * @property {(repo: string, ref: string) => Promise<string>} resolve  ném lỗi nếu không có commit đó
 * @property {(repo: string, commit: string) => Promise<string>} subject
 * @property {(repo: string, limit: number) => Promise<Array<{sha: string, message: string, author: string, at: string}>>} log  lịch sử của nhánh đang lấy ra, mới trước
 * @property {(repo: string, commit: string, key: string) => Promise<string>} extract  trích đúng commit, trả thư mục
 * @property {(dir: string) => Promise<void>} discard
 *
 * @typedef {object} ConfigFiles  Tệp cấu hình của dịch vụ đã trích ra máy để gắn vào container.
 * @property {(name: string, declaration: object) => Promise<boolean>} stale
 * @property {(name: string, declaration: object, fromDir: string) => Promise<void>} install
 * @property {(name: string, from: string) => string} hostPath  (đồng bộ: chỉ ghép đường dẫn)
 *
 * @typedef {object} Runtime  Nơi các bản chạy (Docker trên máy này).
 * @property {() => Promise<Map<string, {commit: string, status: string}>|null>} list  null: không hỏi được
 * @property {(name: string) => Promise<string|null>} runningCommit
 * @property {(image: string) => Promise<boolean>} hasImage
 * @property {(image: string) => Promise<string>} imageCommit  commit ghi bên trong bản; không đọc được: ''
 * @property {(remote: string, opts?: object) => Promise<{ok: boolean, detail: string}>} pull
 * @property {(from: string, to: string) => Promise<void>} tag
 * @property {(spec: {image: string, dir: string, commit: string, target?: string}, opts?: object) => Promise<void>} build
 * @property {(key: string, plan: object, opts?: {removeOrphans?: boolean}) => Promise<void>} applyStack
 * @property {(key: string) => Promise<boolean>} hasStack
 * @property {(key: string) => Promise<void>} removeStack
 *
 * @typedef {object} Registry  Kho bản đóng gói.
 * @property {(remote: string) => Promise<{present: boolean, reason: string}>} lookup
 * @property {(repository: string) => Promise<string[]|null>} tags  mọi nhãn của một kho ("tài-khoản/tên"); không hỏi được: null
 *
 * @typedef {object} SharedTier  Tầng dùng chung: PostgreSQL, broker, mạng.
 * @property {() => Promise<void>} ensureUp
 * @property {(db: string) => Promise<void>} ensureDatabase
 * @property {(topics: string[]) => Promise<void>} ensureTopics
 * @property {(opts: {volumes: boolean}) => Promise<void>} down
 *
 * @typedef {object} Secrets  Kho bí mật của đích.
 * @property {(names: string[]) => Promise<Object<string, string>>} ensure  sinh cái còn thiếu, trả đủ
 *
 * @typedef {object} Ledger  Sổ deploy của đích.
 * @property {() => Promise<object>} read
 * @property {(name: string, entry: object) => Promise<void>} append  đọc lại, ghi thêm, lưu, trong một khóa
 *
 * @typedef {object} Locks
 * @property {(key: string, info?: object) => Promise<{ok: boolean, holder?: object}>} acquire
 * @property {(key: string) => Promise<void>} release
 * @property {(key: string) => Promise<object|null>} holder
 * @property {<T>(key: string, fn: () => Promise<T>) => Promise<T>} within  chờ tới khi lấy được khóa rồi chạy fn
 *
 * @typedef {object} Health
 * @property {(target: {port: number, path: string}, seconds: number) => Promise<void>} waitHealthy  ném lỗi nếu không khỏe
 *
 * @typedef {object} Clock
 * @property {() => string} now  giờ dạng ISO
 * @property {() => number} millis
 *
 * @typedef {object} Credentials  Nơi giữ dạng băm của mật khẩu quản trị và token của agent.
 * @property {() => Promise<object|null>} load
 * @property {(record: object) => Promise<void>} save
 * @property {(text: string) => Promise<string>} publishFirstLogin  ghi bản rõ MỘT lần, trả nơi đã ghi
 *
 * @typedef {object} ConfigStore  Cấu hình của bảng điều khiển kèm lịch sử phiên bản (không chứa bí mật).
 * @property {() => Promise<object|null>} load
 * @property {(record: object) => Promise<void>} save
 *
 * @typedef {object} AuditLog  Sổ thao tác của bảng điều khiển: chỉ thêm.
 * @property {(entry: object) => Promise<void>} append
 * @property {(limit: number, filter?: {actor?: string, action?: string, outcome?: string, q?: string}) => Promise<object[]>} list  mới trước
 *
 * @typedef {object} Members  Người dùng của bảng điều khiển ngoài admin: {name, role, salt, hash, createdAt}. Chỉ giữ dạng băm.
 * @property {() => Promise<object[]>} list
 * @property {(name: string) => Promise<object|null>} get
 * @property {(member: object) => Promise<void>} put  thêm hoặc thay theo tên
 * @property {(name: string) => Promise<boolean>} remove
 *
 * @typedef {object} DocumentStore  Kho đối tượng theo mã, dùng cho yêu cầu chờ duyệt (approvalStore) và lịch sử lần chạy (runStore).
 * @property {(doc: {id: string, status: string}) => Promise<void>} put
 * @property {(limit: number) => Promise<object[]>} recent  cũ trước
 *
 * @typedef {object} TargetStore  Môi trường do trang thêm: {name, spec, managed, state, createdBy, createdAt, detail}.
 * @property {() => Promise<object[]>} list
 * @property {(target: object) => Promise<void>} put
 * @property {(name: string) => Promise<boolean>} remove
 *
 * @typedef {object} Cloud  Tạo và xóa máy trên cloud. Không ném lỗi: hỏng thì ok là false kèm lời giải thích.
 * @property {(req: {configuration?: string, name: string, zone: string, machineType: string, labels?: object}) => Promise<{ok: boolean, error?: string}>} createInstance
 * @property {(req: {configuration?: string, name: string, zone: string}) => Promise<{ok: boolean, error?: string}>} deleteInstance  xóa cả đĩa; máy không còn thì coi như xong
 * @property {(req: {configuration?: string, name: string, zone: string}) => Promise<boolean|null>} instanceExists
 *
 * @typedef {object} SetupScript  Đoạn lệnh chuẩn bị một máy mới để nhận lệnh điều khiển.
 * @property {() => string} read
 *
 * @typedef {object} Meta  Dấu của những việc chỉ làm một lần.
 * @property {(key: string) => Promise<string|null>} get
 * @property {(key: string, value: string) => Promise<void>} set
 *
 * @typedef {object} Hasher  Băm mật khẩu (chậm, có muối), băm token (nhanh) và so sánh không lộ thời gian.
 * @property {(password: string, salt: string) => string} slowHash
 * @property {(text: string) => string} fastHash
 * @property {(a: string, b: string) => boolean} equal
 *
 * @typedef {object} Random
 * @property {(n: number) => Buffer} bytes
 *
 * @typedef {object} RemoteShell  Chạy một đoạn lệnh trên máy đích từ xa. Không ném lỗi: lệnh hỏng thì code khác 0.
 * @property {(script: string) => Promise<{code: number, stdout: string, stderr: string}>} exec
 *
 * @typedef {object} JobExecutor  Chạy một việc deploy hay rollback tới cuối, trả kết quả của ca sử dụng.
 * @property {(job: {service: string, action: string, commit?: string, by: string}, watch?: {onEvent?: (e: object) => void}) => Promise<object>} run
 *   onEvent nhận dần {event:'step', step, status, phase} và {event:'log', text} trong lúc việc chạy (không bắt buộc bộ nối phải báo)
 */

/** Tên hàm của từng cổng: bộ test hợp đồng và composition dùng để kiểm một bộ nối có đủ hàm không. */
const PORTS = Object.freeze({
  declarations: ['load', 'save'],
  source: ['has', 'anyPresent', 'head', 'dirtyCount', 'resolve', 'subject', 'log', 'extract', 'discard'],
  configFiles: ['stale', 'install', 'hostPath'],
  runtime: ['list', 'runningCommit', 'hasImage', 'imageCommit', 'pull', 'tag', 'build', 'applyStack', 'hasStack', 'removeStack', 'logs'],
  registry: ['lookup', 'tags'],
  sharedTier: ['ensureUp', 'ensureDatabase', 'ensureTopics', 'down'],
  secrets: ['ensure'],
  ledger: ['read', 'append'],
  locks: ['acquire', 'release', 'holder', 'within'],
  health: ['waitHealthy'],
  clock: ['now', 'millis'],
  credentials: ['load', 'save', 'publishFirstLogin'],
  configStore: ['load', 'save'],
  auditLog: ['append', 'list'],
  members: ['list', 'get', 'put', 'remove'],
  approvalStore: ['put', 'recent'],
  runStore: ['put', 'recent'],
  targetStore: ['list', 'put', 'remove'],
  meta: ['get', 'set'],
  cloud: ['createInstance', 'deleteInstance', 'instanceExists'],
  setupScript: ['read'],
  random: ['bytes'],
  hasher: ['slowHash', 'fastHash', 'equal'],
  jobExecutor: ['run'],
  remoteShell: ['exec'],
});

/** Ném lỗi nếu một bộ nối thiếu hàm của cổng nó nhận là mình cài. */
function assertPort(name, adapter) {
  for (const fn of PORTS[name] || []) if (!adapter || typeof adapter[fn] !== 'function') throw new Error(`bộ nối cho cổng "${name}" thiếu hàm ${fn}()`);
  return adapter;
}

module.exports = { PORTS, assertPort };
