# ARCHITECTURE: infra (repo deploy)

Trạng thái: **đã làm** (2026-10-07, quyết định D-007 và D-008 trong `DECISIONS.md`). Tệp này mô tả mã ĐANG CÓ. Sửa cấu trúc thì sửa tệp này trong cùng lần commit.

Repo deploy là MỘT dịch vụ: lệnh điều khiển, máy chủ web và giao diện nằm chung một chỗ, thuần Node.js, không thư viện ngoài (D-001).

## 1. Mục tiêu của thiết kế

1. Luật deploy (khi nào từ chối, khi nào tự lùi, lùi về đâu) chỉ viết MỘT lần và không biết Docker, git, tệp hay HTTP là gì.
2. Người (trình duyệt), agent (JSON qua HTTP) và dòng lệnh đi qua cùng các ca sử dụng; không cửa nào có luật riêng.
3. Thêm một đích chạy mới, một lệnh mới hay một phần của trang là THÊM tệp, không sửa tệp cũ.
4. Mọi thứ thử được mà không cần Docker, mạng hay máy chủ; bộ nối thật và bộ nối trong bộ nhớ qua cùng một bộ test.
5. Ranh giới giữa các lớp do test giữ, không do lời dặn.

## 2. Bốn lớp, phụ thuộc một chiều

```
infra/
  bsn.js                      cửa vào mỏng: lắp bằng composition rồi gọi interfaces/cli
  src/
    domain/                   LUẬT THUẦN. Không nhập gì ngoài chính lớp này, kể cả module node:.
    application/              CA SỬ DỤNG. Nhập domain. Nói chuyện với bên ngoài qua CỔNG (ports.js).
    infrastructure/           BỘ NỐI cho từng cổng: docker, git, tệp, khóa, HTTP, tiến trình con; memory/ là bộ nối trong bộ nhớ.
    interfaces/
      cli/                    dòng lệnh: mỗi lệnh một tệp
      http/                   máy chủ web: bảng định tuyến, chuỗi lớp chặn, bộ điều khiển
      web/                    giao diện: HTML, CSS, module JavaScript (trình duyệt tải thẳng, không có bước build)
    composition.js            NƠI DUY NHẤT lắp bộ nối vào ca sử dụng
  ci/                         tệp chạy trên máy của GitHub: decide, scan-image, prune-images
  services/  platform.json    tờ khai báo (dữ liệu)
  local/  server/             compose của tầng dùng chung; tệp chuẩn bị máy chủ
  test/  ci/test/             test theo lớp, test hợp đồng, test kiến trúc
```

| Lớp | Được nhập | KHÔNG được nhập |
|---|---|---|
| `domain` | `domain` | mọi thứ khác, kể cả mọi module `node:` |
| `application` | `domain`, `application` | `infrastructure`, `interfaces`, mọi module `node:` |
| `infrastructure` | `domain`, `infrastructure`, `application/ports.js`, module `node:` | `interfaces`, các ca sử dụng |
| `interfaces/cli` | `domain`, `application`, `interfaces/cli`, `node:path` | `infrastructure` |
| `interfaces/http` | `domain`, `application`, `interfaces/http`, `node:http`, `node:fs`, `node:path` | `infrastructure` |
| `interfaces/web` | chỉ `interfaces/web` | mọi thứ khác (nó chạy trong trình duyệt) |
| `composition.js` | tất cả | (chỉ `bsn.js` và test nhập nó) |
| `ci/decide.js`, `ci/scan-image.js` | chỉ trong `ci/` | `src/` (workflow dùng chung chỉ lấy `ci/` và `services/` về máy của GitHub) |
| `ci/prune-images.js` | `src/domain`, `src/infrastructure` | (chạy trong repo đầy đủ ở workflow `prune`) |

`test/architecture.test.js` quét mọi lệnh `require` và `import` và đỏ khi: có một dòng trái bảng trên; một tệp trong `src/` dài quá 250 dòng; một tệp ngoài `infrastructure` và `composition.js` nhập `node:child_process`; các lệnh của dòng lệnh không cùng một hình dạng.

## 3. Lớp domain (`src/domain/`)

Hàm thuần. Vào là dữ kiện, ra là dữ liệu hoặc một quyết định có tên.

| Tệp | Việc |
|---|---|
| `declaration.js` | Kiểm một bộ tờ khai báo và `platform.json`; tên bí mật một dịch vụ cần; chọn dịch vụ theo tên |
| `naming.js` | Tên bản ở máy, tên bản trên kho, tên container, các bản của một dịch vụ, commit đọc từ nhãn của bản |
| `ledger.js` | Sổ deploy như một giá trị: thêm dòng, bản đang chạy, bản liền trước, "đã từng chạy khỏe chưa", tìm commit theo tiền tố, kiểm số phiên bản của sổ |
| `deploy-policy.js` | `planDeploy`, `planRollback` trả một trong ba: từ chối (kèm mã), không đổi, chuyển từ bản A sang bản B; `rollbackImageAvailable`; `revertTarget` |
| `stack-plan.js` | Mô tả chạy (theo khuôn compose) của các dịch vụ; hằng số của tầng dùng chung; biến môi trường nền cấp cho dịch vụ |
| `outcome.js` | Các kết quả có tên: `NOT_DECLARED`, `WAITING_BUILD`, `NO_PREVIOUS`, `UNKNOWN_REF`, `NEVER_RAN_HERE`, `IMAGE_GONE`, `BUSY`, `SWITCH_FAILED`, `UNEXPECTED` |

## 4. Lớp application (`src/application/`)

Mỗi ca sử dụng là một hàm tạo `makeXxx({ các cổng nó cần })`. Nó TRẢ kết quả (`{ok, outcome?, reason?, ...}`), không in, không thoát; chỉ ném khi gặp điều không lường được. Việc nó làm được kể qua hàm `say` do bên gọi đưa vào.

| Tệp | Ca sử dụng | Cổng dùng |
|---|---|---|
| `check.js` | Đọc và kiểm tờ khai báo; hỏi repo của dịch vụ có trên máy không | Declarations, Source |
| `pin.js` | Ghim một commit vào tờ của đúng một dịch vụ | Declarations, Source |
| `get-status.js`, `get-images.js` | Trạng thái của mọi dịch vụ; bản đã có trên kho chưa | Source, Runtime, Ledger, Locks; Registry |
| `images.js` | Các bước build từ commit được ghim; kéo bản CI và kiểm commit ghi bên trong | Source, ConfigFiles, Runtime |
| `prepare-tier.js` | Các bước chuẩn bị: bí mật, tầng dùng chung, cơ sở dữ liệu, topic | Secrets, SharedTier |
| `stack.js` | Bật và tắt cả hệ | Runtime, ConfigFiles, Health, Ledger, Secrets, SharedTier, Clock |
| `switch-version.js` | Khung chung: bật một commit, chờ khỏe, hỏng thì bật lại bản trước, ghi sổ | Runtime, ConfigFiles, Health, Ledger, Clock |
| `deploy.js`, `rollback.js` | Hỏi luật ở domain, giữ khóa của dịch vụ, gọi `switch-version`; rollback ghi lại tờ khai báo | Runtime, Registry, Locks, Ledger, Declarations |
| `service-lock.js` | Mỗi dịch vụ một lần đưa lên tại một thời điểm | Locks, Clock |
| `plan.js` | Chạy một kế hoạch (danh sách bước): chỉ in, hoặc chạy thật | (không) |
| `console.js` | Bảng điều khiển: trang trạng thái gộp; nhận yêu cầu Deploy, Rollback | (các ca sử dụng trên), Clock |
| `jobs.js` | Sổ việc: nhận việc, từ chối việc trùng dịch vụ, giữ kết quả | JobExecutor, Clock, Random |
| `auth.js` | Mật khẩu quản trị, phiên có hạn, token của agent, khóa tạm khi sai nhiều lần | Credentials, Hasher, Random, Clock |

### Các cổng (`ports.js`, khai bằng JSDoc)

Mọi hàm trả Promise (trừ `ConfigFiles.hostPath`, `Clock`, `Random`, `Hasher` là hàm thuần ngắn), để một bộ nối sau này gọi máy từ xa được mà ca sử dụng không đổi. `assertPort(tên, bộ nối)` ném lỗi khi bộ nối thiếu hàm; `composition.js` gọi nó cho mọi cổng.

| Cổng | Hàm | Bộ nối thật | Trong bộ nhớ |
|---|---|---|---|
| `Declarations` | `load`, `save` | `fs-declarations.js` | có |
| `Source` | `has`, `anyPresent`, `head`, `dirtyCount`, `resolve`, `subject`, `extract`, `discard` | `git-source.js` | có |
| `ConfigFiles` | `stale`, `install`, `hostPath` | `fs-config-files.js` | có |
| `Runtime` | `list`, `runningCommit`, `hasImage`, `imageCommit`, `pull`, `tag`, `build`, `applyStack`, `hasStack`, `removeStack` | `docker-runtime.js` | có |
| `Registry` | `lookup` | `docker-registry.js` | có |
| `SharedTier` | `ensureUp`, `ensureDatabase`, `ensureTopics`, `down` | `compose-shared-tier.js` | có |
| `Secrets` | `ensure` | `fs-secrets.js` | có |
| `Ledger` | `read`, `append` | `fs-ledger.js` (ghi trong khóa) | có |
| `Locks` | `acquire`, `release`, `holder`, `within` | `file-locks.js` (tệp ghi pid) | có |
| `Health` | `waitHealthy` | `http-health.js` | có |
| `Clock`, `Random` | `now`, `millis`; `bytes` | `system.js` | đồng hồ tự nhích |
| `Hasher` | `slowHash`, `fastHash`, `equal` | `node-hasher.js` | (dùng chung bộ thật) |
| `Credentials` | `load`, `save`, `publishFirstLogin` | `fs-credentials.js` | có |
| `JobExecutor` | `run` | `job-executors.js`: tiến trình con tách rời; `application/remote-jobs.js`: dựng trên `RemoteShell` cho đích từ xa | `job-executors.js`: gọi thẳng ca sử dụng |
| `RemoteShell` | `exec` | `gcloud-ssh-shell.js`: hỏi gcloud một lần rồi gọi thẳng ssh | (test dùng bản giả; "máy đích" là các ca sử dụng trên bộ nối trong bộ nhớ) |

## 5. Lớp infrastructure (`src/infrastructure/`)

- Mỗi bộ nối một tệp, tên theo công nghệ và cổng. `layout.js` giữ mọi đường dẫn trên đĩa của một bản cài (D-002). `process-runner.js` là NƠI DUY NHẤT chạy lệnh ngoài một cách đồng bộ; bộ nối nhận hàm `run` của nó qua tham số, nên test thay được.
- `memory/`: `world.js` (đối tượng dữ liệu và dữ liệu mẫu: một bản tốt chờ deploy, một bản hỏng, một bản chờ build), `storage.js` (Declarations, Ledger, Locks, Secrets, ConfigFiles, Credentials), `platform.js` (Runtime, Registry, Source, SharedTier, Health, Clock). Bảng điều khiển chạy với `--memory` dùng CÙNG các ca sử dụng trên các bộ nối này, nên không có chỗ nào chép lại luật.
- `test/contract.test.js` chạy một bộ kiểm cho cả bộ nối trên đĩa lẫn bộ nối trong bộ nhớ (Declarations, Locks, Ledger, Secrets, ConfigFiles, và "đủ hàm đã khai"). Bộ nối Docker và kho bản thật không chạy được trong CI: phần đó kiểm bằng lần thử thật, ghi ở README.
- `job-executors.js`: việc của bảng điều khiển chạy trong một tiến trình con với cờ `detached` (D-008). Đừng bỏ cờ đó.

## 6. Lớp interfaces (`src/interfaces/`)

### Dòng lệnh (`cli/`)

- `index.js`: phân tích tham số, tìm lệnh trong bảng `COMMANDS`, gọi ca sử dụng `check` một lần, rồi chạy lệnh. Đây là chỗ duy nhất của dòng lệnh quyết định mã thoát.
- `commands/<tên>.js`: mỗi lệnh một tệp, cùng hình dạng `{ name, usage, requireRepos?, standalone?, run(ctx) }`. `switch.js` là khung chung của `deploy` và `rollback`. Lệnh `console` nhận hàm mở bảng điều khiển từ `bsn.js`, nên nó không nhập `composition`.
- Tên lệnh, tham số và đầu ra `--json` là giao diện công bố: `check`, `status`, `images`, `pin`, `build`, `up`, `down`, `deploy`, `rollback`, `console`.

### Máy chủ web (`http/`)

- `server.js`: bảng định tuyến và chuỗi lớp chặn; chỉ nghe trên `127.0.0.1`. `router.js`: bảng `phương thức + đường dẫn -> bộ điều khiển`. `pipeline.js`: ghép các lớp chặn. `respond.js`: dạng của một câu trả lời. `session-cookie.js`: cách đặt và đọc cookie phiên.
- `middleware/`, theo đúng thứ tự chạy: `security-headers` (gắn vào mọi câu trả lời), `host-guard` (chỉ nhận đúng tên máy của chính nó), tìm đường, `authenticate` (phiên hoặc token), `csrf` (yêu cầu ghi từ trình duyệt phải có header riêng), `json-body` (giới hạn kích thước).
- `controllers/`: `session.js` (đăng nhập, đăng xuất), `deployments.js` (trạng thái, Deploy, Rollback, xem một việc; đổi kết quả có tên thành mã HTTP), `static.js` (phục vụ `web/`, không ra khỏi thư mục đó).

### Giao diện (`web/`)

- `index.html`, `styles.css`: không có JavaScript hay CSS viết trong HTML, nên chính sách nội dung của trang không có `unsafe-inline`.
- `api.js` (mọi lời gọi tới máy chủ), `store.js` (trạng thái trang, hỏi lại định kỳ), `format.js` (cách hiển thị giá trị, hàm dựng phần tử).
- `views/`: `login.js`, `service-state.js` (đọc trạng thái thành nhãn, nút nào bấm được, lời nhắc: thuần, không đụng DOM), `service-card.js`, `history.js`, `job-list.js`, `confirm.js`. Mỗi tệp là hàm từ dữ liệu ra phần tử; chữ chỉ đi qua `textContent`.
- `main.js`: nối `store` với `views`; chỉ vẽ lại phần có dữ liệu đổi.

## 7. Một lần bấm Deploy đi qua các lớp

1. Trình duyệt: `views/service-card.js` hỏi lại rồi gọi `store.deploy` -> `api.deploy(tên)`.
2. `http`: chuỗi lớp chặn cho qua; `controllers/deployments.js` gọi ca sử dụng `console.request({service, action, by})`.
3. `application/console.js` kiểm đầu vào và tờ khai báo, rồi `jobs.start`: dịch vụ đang có việc thì trả `BUSY` (mã 409); không thì giao cho cổng `JobExecutor`.
4. `infrastructure/job-executors.js` chạy một tiến trình con tách rời với đúng lệnh `deploy <tên> --apply --json`.
5. Trong tiến trình con: `cli` gọi ca sử dụng `deploy`; ca này giữ khóa của dịch vụ qua `Locks`, hỏi `deploy-policy` nên làm gì, rồi gọi `switch-version`.
6. `switch-version` gọi `Runtime`, `Health`, `Ledger`; hỏng thì hỏi `deploy-policy` bật lại bản nào.
7. Kết quả thành một đối tượng JSON; `jobs` giữ nó; trình duyệt hỏi lại và `views/job-list.js` vẽ ra.

Dòng lệnh gõ tay đi từ bước 5. Agent gọi HTTP đi từ bước 2. Ba cửa, một đường.

### Khi đích là một máy từ xa (`console --target=<tên>`, D-009)

Bước 3 trở đi đổi như sau, các lớp trên không đổi:

- `composition.buildRemoteConsole` đưa vào ca sử dụng `console` ba hàm của `application/remote-target.js` thay cho `check`, `getStatus`, `getImages` của máy này. Ba hàm đó chạy `bsn.js status --json` và `images --json` TRÊN MÁY ĐÍCH qua cổng `RemoteShell` và đọc đầu ra.
- Cổng `JobExecutor` là `application/remote-jobs.js`: bảo máy đích bắt đầu đúng lệnh `deploy|rollback --apply --json` trong một tiến trình tách rời khỏi phiên SSH, rồi hỏi lại tới khi xong.
- Trên máy đích, lệnh đi tiếp từ bước 5 như thường. Luật, sổ deploy, khóa và bí mật đều ở máy đích; hợp đồng giữa hai máy chỉ là đầu ra `--json` của lệnh điều khiển.
- `domain/target.js` giữ luật của tờ khai đích (`targets/<tên>.json`); mọi giá trị chen vào một đoạn lệnh gửi đi đều được kiểm dạng ở `remote-target.js`.

## 8. Mẫu thiết kế, và vì sao

| Mẫu | Ở đâu | Bài toán nó giải |
|---|---|---|
| Cổng và bộ nối | `application/ports.js` + `infrastructure/` | Luật không dính Docker, git, tệp; đổi đích chạy không sửa luật |
| Repository | `Declarations`, `Ledger`, `Credentials` | Che cách lưu; sau này sổ nằm trên máy khác thì chỉ thêm bộ nối |
| Strategy | `Runtime`, `Health`, `JobExecutor` | Cùng một ca sử dụng chạy với máy này, với bộ nhớ, và sau này với máy từ xa |
| Command | `interfaces/cli/commands/`; một việc trong `jobs` | Thêm lệnh là thêm tệp; việc ghi lại được và chạy được ở tiến trình khác |
| Chain of Responsibility | `interfaces/http/middleware/` | Mỗi lớp chặn một việc; thêm bớt không đụng bộ điều khiển |
| Composition Root | `composition.js` | Phụ thuộc lắp ở một chỗ; không tệp nào tự tạo bộ nối |
| Template Method (dạng hàm) | `switch-version.js` | Deploy và rollback chung khung "bật, chờ khỏe, hỏng thì lùi" |

Cố ý KHÔNG dùng: khung tiêm phụ thuộc, lớp kế thừa, bus sự kiện, khung giao diện, TypeScript. Mỗi thứ đó thêm phần phải hiểu hoặc phải cài mà bài toán hiện tại không cần.

## 9. SOLID được giữ bằng gì

| Nguyên tắc | Cách giữ |
|---|---|
| Một trách nhiệm | Mỗi tệp một việc theo các bảng trên; test kiến trúc chặn tệp quá 250 dòng |
| Mở để mở rộng, đóng để sửa | Lệnh, đường gọi, lớp chặn, bộ nối đều đăng ký vào bảng; thêm mới không sửa cái cũ |
| Thay thế được | `test/contract.test.js` chạy cho cả bộ nối thật lẫn bộ nối trong bộ nhớ; `test/http.test.js` chạy các ca sử dụng thật trên bộ nối trong bộ nhớ |
| Giao diện nhỏ | Mỗi cổng chỉ có hàm ca sử dụng gọi; ca sử dụng nhận đúng các cổng nó cần |
| Phụ thuộc vào trừu tượng | `application` chỉ biết `ports.js`; test kiến trúc chặn lệnh nhập sai chiều |

## 10. Thêm một việc mới thì đi theo thứ tự nào

1. Luật mới (nếu có) vào `domain`, kèm ca trong `test/domain.test.js`.
2. Cần thứ gì bên ngoài: thêm hàm vào cổng trong `ports.js` (cả JSDoc lẫn bảng `PORTS`), cài ở bộ nối thật VÀ ở `memory/`, thêm vào `test/contract.test.js`.
3. Ca sử dụng: một tệp trong `application`, nhận đúng các cổng nó cần.
4. Lắp ở `composition.js`.
5. Cửa vào: một tệp lệnh trong `interfaces/cli/commands/` và một dòng trong bảng `COMMANDS`; hoặc một dòng trong bảng định tuyến của `interfaces/http/server.js` và một hàm trong bộ điều khiển; rồi mới tới giao diện.
6. Cập nhật tệp này, `README.md`, và tài liệu ba tầng qua `bsn-docs`.

## 11. Giới hạn đã biết

- **Mô hình hai máy mới có bước đầu.** Các ca sử dụng deploy, rollback luôn chạy trên chính máy có hệ; bảng điều khiển ở máy khác ra lệnh qua `RemoteShell` (D-009). Chưa có máy quản trị riêng trên cloud; đường SSH hiện đi qua `gcloud` và khóa của người dùng.
- **Đích từ xa đọc chậm hơn**: một lần đọc trạng thái khoảng 1,3 tới 1,9 giây; hỏi kho bản khoảng 6 giây và chặn lần vẽ trang đó (kết quả giữ 30 giây).
- **Bộ nối thật gọi lệnh docker và git đồng bộ.** Cổng đã là Promise nhưng lời gọi bên trong chặn tiến trình. Trong tiến trình con của một việc thì không sao; trong bảng điều khiển, mỗi lần đọc trạng thái làm máy chủ web đứng vài trăm mili giây, và vài giây khi hỏi kho bản (kết quả được giữ 30 giây).
- **Lời diễn giải nằm trong ca sử dụng.** Các câu tiếng Việt kể lại một lần đưa lên là một phần của kết quả (`log`), do ca sử dụng viết qua hàm `say`; chúng chưa tách sang lớp trình bày.
- **Phiên đăng nhập và sổ việc nằm trong bộ nhớ** của tiến trình bảng điều khiển: khởi động lại thì mất. Bảng điều khiển chết giữa lúc một việc chạy thì việc vẫn xong nhưng kết quả không còn hiện trên trang (sổ deploy vẫn ghi).
- **Không có kiểm kiểu tĩnh**: hình dạng của cổng được giữ bằng JSDoc, `assertPort` và bộ test hợp đồng.
- **Giao diện chưa có test tự động.** Nó đã được mở bằng trình duyệt chạy ngầm một lần (kết quả ở README); phần đọc trạng thái (`views/service-state.js`) là hàm thuần nhưng chưa có test.
- **Bước "người duyệt trước khi lên máy chạy thật"** chưa thiết kế; sẽ là một trạng thái của việc.
