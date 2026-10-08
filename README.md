# deploy

Nền deploy và vận hành dùng chung của hệ BSN. Repo này là `Autonomous-SoftwareAgent/deploy` trên GitHub; trên máy làm việc nó nằm ở `BSN_/infra/` (một repo git riêng, như các dịch vụ trong `BSN_/system_service/`). Mã ở đây không chứa tên dịch vụ nào: mọi thứ về một dịch vụ nằm trong tờ khai báo của nó.

Các quyết định S-017, S-018, S-019, S-020, S-023, S-026, S-028, S-029 được nhắc trong tệp này nằm ở `docs/system/decisions.md` của repo harness (thư mục gốc `BSN_/` trên máy làm việc).

```
(gốc repo deploy = BSN_/infra/ trên máy làm việc)
  services/<dịch-vụ>.json  tờ khai báo: dịch vụ chạy commit nào, cổng nào. Mỗi dịch vụ MỘT tệp, do chính dịch vụ đó ghi
  platform.json            cấu hình chung của nền: tổ chức GitHub, tài khoản Docker Hub, tiền tố tên kho, số bản giữ lại
  bsn.js                   cửa vào của lệnh điều khiển (Node, không thư viện ngoài); chỉ lắp ráp và gọi
  src/domain/              luật thuần: tờ khai báo, đặt tên bản, sổ deploy, quyết định deploy và rollback
  src/application/         ca sử dụng (mỗi việc một tệp) và các cổng ra bên ngoài (ports.js)
  src/infrastructure/      bộ nối cho từng cổng: docker, git, tệp, khóa, HTTP; memory/ là bộ nối trong bộ nhớ
  src/interfaces/          cli/ (dòng lệnh), http/ (máy chủ web của bảng điều khiển), web/ (giao diện)
  src/composition.js       nơi duy nhất lắp bộ nối vào ca sử dụng
  ci/                      tệp phụ của workflow: decide.js (commit nào được đóng gói), scan-image.js (quét bí mật), smoke.js (chạy thử bản), prune-images.js (dọn bản cũ)
  .github/workflows/       ci, service-pin và service-image (hai workflow dùng chung cho mọi dịch vụ), pins, prune
  test/  ci/test/          test (không cần Docker, không cần mạng)
  local/docker-compose.yml tầng dùng chung ở local: PostgreSQL, broker, mạng chung
  local/.run/              tệp sinh khi chạy (mật khẩu local, compose của dịch vụ); không commit
  targets/                 tờ khai các đích từ xa cho bảng điều khiển (README.md là mẫu; các tệp .json không vào git)
  server/                  setup.sh (chuẩn bị một máy Ubuntu: Docker, Node, git, lấy các repo về /opt/bsn), sync.sh (lấy bản mới của repo dịch vụ)
```

Thiết kế bốn lớp, danh sách cổng và các mẫu thiết kế đang dùng: [docs/agent/ARCHITECTURE.md](docs/agent/ARCHITECTURE.md).

Lệnh trong tệp này viết theo cách gọi trên máy làm việc, từ `BSN_/`: `node infra/bsn.js ...`. Trong repo deploy đứng một mình (máy của GitHub) thì gọi `node bsn.js ...` từ gốc repo; khi đó không có repo của dịch vụ nên chỉ `check` và `images` chạy được.

## Nguyên tắc

- **Ảnh chỉ được build từ commit được ghim** trong tờ khai báo. Lệnh trích đúng commit đó ra thư mục tạm rồi build; không đọc thư mục làm việc. Phiên đang sửa dở một dịch vụ không phải dừng, và phần chưa commit không lọt vào ảnh.
- **Dịch vụ tự khai commit mình muốn chạy.** Phiên của dịch vụ chạy `pin` rồi commit tờ khai báo của mình ở repo deploy (`git -C infra add services/<dịch-vụ>.json`, commit, và `git -C infra push` khi người dùng bảo); không ghi tờ của dịch vụ khác, không sửa phần còn lại của repo deploy.
- **Nhãn ảnh là mã commit.** Ở máy: `bsn-<dịch-vụ>:<12 ký tự>`. Trên Docker Hub: `<tài-khoản>/svc-<dịch-vụ>:main-<12 ký tự>`. Không dùng nhãn `latest`.
- **Khai báo trước, build sau; không có build tự động (S-029), áp cho mọi dịch vụ.** Khai commit nào trong tờ khai báo thì GitHub đóng gói đúng commit đó (dù là đầu nhánh hay nằm phía dưới), và chỉ sau khi test của dịch vụ qua trên chính commit đó. Lần chạy không có commit nào chờ đóng gói thì chỉ chạy test. Lệnh `pin` không chạy test thay bạn.
- **Chỉ deploy commit đã có bản.** Khai báo đi trước bản đóng gói, nên "đã khai, chưa có bản" là trạng thái bình thường (`images` báo "CHỜ BUILD"); `images --strict` dùng khi cần chắc mọi bản đã có.
- Lệnh làm thay đổi (`pin`, `build`, `up`, `down`) mặc định chỉ in kế hoạch; thêm `--apply` mới chạy thật.

## Dùng (chạy từ `BSN_/`)

```
node infra/bsn.js check                  kiểm các tờ khai báo và platform.json
node infra/bsn.js status                 bản ghim so với HEAD, số tệp chưa commit, ảnh, container, cổng
node infra/bsn.js pin <dịch-vụ> [commit] ghim một commit (mặc định HEAD) vào tờ của đúng dịch vụ đó
node infra/bsn.js build [dịch-vụ...]     build ảnh từ commit được ghim
node infra/bsn.js up [dịch-vụ...]        bật tầng dùng chung và các dịch vụ từ ảnh đã ghim, chờ khỏe
node infra/bsn.js up --pull [dịch-vụ...] như trên, nhưng kéo bản CI đã đóng gói từ Docker Hub thay vì build tại chỗ
node infra/bsn.js images [--strict]      commit được ghim đã có bản trên Docker Hub chưa: CÓ hoặc CHỜ BUILD (chỉ hỏi, không kéo về);
                                         --strict: còn bản chờ build thì mã thoát 1
node infra/bsn.js down [--volumes]       tắt; kèm --volumes thì xóa cả dữ liệu local
node infra/bsn.js deploy <dịch-vụ>       đưa bản đã khai lên chạy, kiểm sức khỏe; không khỏe thì tự bật lại bản đang chạy trước đó
node infra/bsn.js rollback <dịch-vụ> [commit]  lùi về bản liền trước, hoặc về một commit đã từng chạy khỏe ở đây
node infra/bsn.js console [--port=8900]  bảng điều khiển web: xem trạng thái, bấm Deploy và Rollback (chỉ nghe trên 127.0.0.1)
node infra/bsn.js console --memory       như trên nhưng với dữ liệu mẫu trong bộ nhớ: không đụng hệ nào
node infra/bsn.js console --target=<tên> bảng điều khiển ở máy này, điều khiển hệ trên một máy từ xa (targets/<tên>.json) qua SSH
```

`check`, `status`, `images`, `deploy`, `rollback` nhận `--json`: in đúng một đối tượng JSON, không kèm chữ khác, để agent đọc.

## Deploy và rollback

Đích là MÁY ĐANG CHẠY LỆNH: máy làm việc, hoặc một máy chủ đã chuẩn bị bằng `server/setup.sh`. Mô hình hai máy (máy quản trị điều khiển máy chạy thật) chưa có (xem [ROADMAP.md](ROADMAP.md)).

- `deploy <dịch-vụ> --apply`: lấy commit đang được ghim; **từ chối nếu commit đó chưa có bản trên Docker Hub** (chờ build); kéo bản và kiểm commit ghi bên trong; bật ĐÚNG MỘT dịch vụ đó (các dịch vụ khác không bị đụng); gọi đường kiểm sức khỏe tối đa 120 giây (đổi bằng biến `BSN_HEALTH_SECONDS`). Không khỏe thì tự bật lại bản đang chạy trước đó, in lý do và thoát mã 1. Khi đó tờ khai báo KHÔNG bị sửa: `status` sẽ báo "TỪ COMMIT KHÁC BẢN GHIM".
- `rollback <dịch-vụ> [commit] --apply`: mặc định lùi về bản liền trước; hoặc về một commit (từ 7 ký tự) đã từng chạy khỏe trên đích này. Commit chưa từng chạy khỏe ở đây thì từ chối: rollback là lối đi riêng, không chạy lại bước kiểm nào của bản mới. Lùi xong thì lệnh ghi commit đó vào tờ khai báo; **bạn commit và đẩy repo deploy** để tờ khai báo trên GitHub khớp với thứ đang chạy.
- **Sổ deploy** `local/.run/deployments.json` (không commit): với mỗi dịch vụ ghi bản đang chạy, bản liền trước và 50 lần đưa lên gần nhất (ai, lúc nào, kết quả, lý do). Tờ khai báo nói điều dịch vụ MUỐN; sổ này nói điều ĐANG CHẠY trên máy này. `status` in cả hai. `up` cũng ghi vào sổ khi dịch vụ khỏe.
- Deploy và rollback chỉ đổi bản chương trình. Dữ liệu trong cơ sở dữ liệu không lùi theo.
- **Mỗi dịch vụ một lần đưa lên tại một thời điểm.** Lệnh có `--apply` giữ một khóa theo dịch vụ (`local/.run/lock.deploy.<dịch-vụ>.json`); lần thứ hai bị từ chối kèm thông tin ai đang chạy. Dịch vụ khác nhau thì chạy song song. Tiến trình giữ khóa đã chết thì khóa tự coi như bỏ.
- Không còn nút deploy trên GitHub Actions (D-007): deploy và rollback chỉ đi qua dòng lệnh và bảng điều khiển dưới đây.

## Bảng điều khiển web

`node infra/bsn.js console` mở http://127.0.0.1:8900. Đây là cửa cho người vận hành; agent dùng cùng các đường gọi dưới dạng JSON. Giao diện dùng tiếng Anh toàn bộ (người dùng chốt 2026-10-08); bản design gốc và yêu cầu API nằm ở `design/`, tiến độ ở `docs/agent/CONSOLE-PLAN.md`.

- **Chỉ nghe trên 127.0.0.1**: máy khác trong mạng không gọi vào được. Trên máy chủ thì vào qua đường hầm SSH (chưa làm).
- **Đăng nhập (D-011)**: trình duyệt tự hiện hộp thoại hỏi tên và mật khẩu (HTTP Basic); không có trang đăng nhập, không có cookie. Lần chạy đầu sinh mật khẩu của `admin` và một token cho agent, ghi bản rõ vào `local/.run/console.first-login.txt`. Đọc xong thì xóa tệp đó; bảng điều khiển chỉ giữ dạng băm. Quên thì `node infra/bsn.js console --reset-auth`. Chỉ `/healthz` mở; trang và tệp giao diện cũng phải đăng nhập. Sai 5 lần thì khóa tạm một phút (429). Muốn đăng xuất thì đóng trình duyệt.
- **Môi trường** là một máy chạy hệ: máy này (`local`) và mỗi tệp `targets/<tên>.json`. Trang Tổng quan có mỗi môi trường một cột.
- **Người dùng và vai trò (D-012)**: `admin` tạo người dùng (Developer, QA, Tech lead, DevOps); mật khẩu sinh ngẫu nhiên, hiện đúng một lần. Agent dùng token có vai trò `Agent`. Bảng phân quyền đặt cho từng vai trò ở từng môi trường: chỉ xem, deploy, hoặc deploy và rollback.
- **Bảo vệ môi trường**: đòi người thứ hai duyệt, đòi gõ tên để xác nhận, chỉ nhận người có tên trong danh sách, khung giờ khóa hằng tuần. Máy chủ kiểm mọi điều này ở cả bước kiểm tra trước lẫn lúc chạy; trang chỉ hiện lại.
- **Cấu hình có phiên bản**: mỗi lần lưu là một phiên bản (ai, lúc nào, ghi chú); lưu lệch phiên bản thì bị từ chối; khôi phục được bản cũ.
- **Sổ thao tác**: ai làm gì, lúc nào, được hay bị từ chối; chỉ thêm; lọc được theo người, loại việc, kết quả và chữ.
- **DB riêng của bảng điều khiển (D-014)**: một tệp SQLite `local/.run/console.db` (không vào git), mở bằng `node:sqlite` có sẵn trong Node nên không thêm thư viện nào. Trong đó: cấu hình và lịch sử phiên bản, bảng phân quyền, thành viên (mật khẩu chỉ ở dạng băm), sổ thao tác, yêu cầu chờ duyệt, lịch sử các lần chạy, môi trường do trang thêm. Mật khẩu quản trị và token của agent vẫn ở tệp `console.auth.json` (DB hỏng thì admin vẫn vào được). Lần khởi động đầu, dữ liệu ở `console.config.json` và `console.audit.jsonl` được chép vào DB; hai tệp cũ giữ nguyên. Sao lưu là chép tệp `console.db`. Bí mật của dịch vụ không bao giờ vào DB này.
- **Thêm và gỡ môi trường trên trang (D-015)**: ở mục Environments, khai một máy đã có, hoặc cho bảng điều khiển TẠO một máy mới trên GCP (tốn tiền; trang hiện giá ước tính và bắt gõ tên). Tạo xong chỉ có một máy sẵn sàng nhận lệnh (Docker, Node, bộ lệnh điều khiển); không bật hệ, không deploy gì. Gỡ thì chọn giữ máy hay xóa cả máy (chỉ máy do bảng điều khiển tạo). Bảng điều khiển gọi `gcloud` bằng tài khoản đang đăng nhập ở máy chạy nó.
- **Cập nhật trực tiếp**: trang nghe `GET /api/v1/events` (Server-Sent Events); máy chủ chỉ gửi TÊN chủ đề vừa đổi, trang tự hỏi lại dữ liệu. Mất kết nối thì trang quay về hỏi định kỳ.
- **Ánh xạ nhánh chỉ là khai báo**: nền không tự deploy khi có push (S-029); không có công tắc tự chạy.
- **Bảng điều khiển không có luật deploy riêng.** Mỗi mục của một lần chạy là một việc chạy trong một tiến trình riêng với đúng lệnh `deploy` hay `rollback` ở trên. Vì vậy bảng điều khiển tắt hay khởi động lại không dừng dịch vụ nào và không cắt ngang lần đưa lên đang chạy.
- **Agent**: gửi header `Authorization: Bearer <token>`. Lệnh ghi của người (đăng nhập kiểu Basic) phải kèm header `x-bsn-console: 1`.

Đường gọi cho bảng điều khiển theo môi trường. Lỗi trả `{error: {code, message, details}}`.

| Đường gọi | Việc |
|---|---|
| `GET /api/v1/overview` | Mọi dịch vụ ở mọi môi trường; lọc bằng `projectId`, `environmentId`, `status`, `q` |
| `GET /api/v1/environments` | Danh sách môi trường theo thứ tự, màu và mức bảo vệ đã đặt |
| `GET /api/v1/services/<tên>` | Chi tiết một dịch vụ: từng môi trường, commit (đã có bản chưa), dòng thời gian deploy, biến môi trường (bí mật chỉ có tên) |
| `GET /api/v1/services/<tên>/diff?from=&to=` | Tệp nào đổi giữa hai commit, thêm bớt bao nhiêu dòng |
| `GET /api/v1/services/<tên>/logs?environmentId=&tail=` | Mấy dòng log cuối của container ở một môi trường (tối đa 500) |
| `POST /api/v1/deployments/preflight` | Kiểm tra trước: từ bản nào sang bản nào, mục bị chặn, cổng an toàn (`gate`); không ghi gì |
| `POST /api/v1/deployments` | `{kind, environmentId, items: [{serviceId, targetSha?}], confirmation?}`. `201` chạy ngay, `202` chờ người thứ hai duyệt, `422` bị chặn, `409` đang chạy dở |
| `GET /api/v1/runs`, `/runs/<mã>`, `/runs/<mã>/logs?after=` | Lần chạy, từng bước của từng mục, log đến dần |
| `GET /api/v1/approvals`, `POST /api/v1/approvals/<mã>/approve\|reject` | Yêu cầu chờ duyệt; người gửi không tự duyệt được |
| `GET /api/v1/config`, `PUT /api/v1/config`, `POST /api/v1/config/preview\|restore\|reset` | Cấu hình và lịch sử phiên bản (ghi: Admin, DevOps) |
| `GET /api/v1/branches/matrix`, `POST /api/v1/branches/test` | Ánh xạ nhánh của từng dịch vụ; thử một tên nhánh |
| `GET\|POST /api/v1/users`, `PATCH\|DELETE /api/v1/users/<tên>`, `POST /api/v1/users/<tên>/password` | Người dùng (Admin, DevOps) |
| `GET /api/v1/audit?actor=&action=&outcome=&q=`, `GET /api/v1/me` | Sổ thao tác (lọc được); người đang gọi là ai |
| `GET /api/v1/environments/managed`, `POST /api/v1/environments`, `DELETE /api/v1/environments/<tên>`, `GET /api/v1/environments/operations/<mã>` | Môi trường do trang thêm; thêm (`mode`: `create` hoặc `register`), gỡ (`deleteMachine`), và tiến trình từng bước (Admin, DevOps) |
| `GET /api/v1/events` | Dòng sự kiện: tên chủ đề vừa đổi (`runs`, `approvals`, `environments`, `config`) |

Đường gọi cũ, một đích (đích là môi trường đầu tiên của bảng điều khiển); chúng đi qua cùng cổng an toàn, và từ chối môi trường đòi gõ tên hay đòi duyệt:

| Đường gọi | Việc |
|---|---|
| `GET /api/state` | Trạng thái mọi dịch vụ và 10 việc gần nhất |
| `POST /api/services/<tên>/deploy` | Đưa bản đã khai lên; trả `202` kèm mã việc, `409` nếu dịch vụ đang có việc chạy dở |
| `POST /api/services/<tên>/rollback` | Lùi về bản liền trước, hoặc về `{"commit": "..."}` đã từng chạy khỏe |
| `GET /api/jobs/<mã>` | Một việc và kết quả của nó |

Thử giao diện mà không đụng hệ nào: `node infra/bsn.js console --memory` (dữ liệu mẫu, hai môi trường mẫu).

## Cổng ở local

| Thứ | Cổng trên máy | Trong mạng chung |
|---|---|---|
| payment-hub | 127.0.0.1:8000 | `payment-hub:8080` (bí danh `hub`) |
| ingest | 127.0.0.1:8001 | `ingest:8080` |
| momo-sim (cổng MoMo giả, đi kèm payment-hub) | 127.0.0.1:8100 | `momo-sim:8081` |
| PostgreSQL chung | 127.0.0.1:55440 | `postgres:5432` |
| Broker chung (Redpanda 25.1.7, giao thức Kafka) | 127.0.0.1:19192 | `redpanda:9092` |

Dịch vụ mới lấy cổng kế tiếp từ 8002; đồ giả lập lấy từ 8101. Dịch vụ gọi nhau qua mạng chung bằng tên, không qua cổng 800x.

Hai cách chạy một dịch vụ:

- **Chạy một mình** (đang viết và thử riêng dịch vụ đó): `docker compose up` trong thư mục dịch vụ, như trước. Nó tự mang cơ sở dữ liệu và broker. Cổng của cách này do dịch vụ tự đặt; hiện `payment-hub` và `ingest` cùng dùng 8080 nên không bật hai cái này cùng lúc được.
- **Chạy trong hệ** (thử các dịch vụ nối với nhau): `node infra/bsn.js up --apply`. Không cần sửa compose của dịch vụ: infra chạy ảnh đã ghim và cấp địa chỉ cơ sở dữ liệu, broker, mật khẩu local qua biến môi trường.

## Thêm một dịch vụ

1. Tạo tệp `infra/services/<tên>.json` (tên tệp là tên dịch vụ) theo bảng dưới.
2. Trong repo của dịch vụ: thêm `bsn.ci.json` và workflow gọi workflow dùng chung (mục "CI trên GitHub").
3. `node infra/bsn.js check`, rồi `pin <tên> --apply`.

Không sửa mã của nền.

| Trường | Ý nghĩa |
|---|---|
| `repo` | thư mục repo của dịch vụ, tính từ `BSN_/` |
| `commit` | mã commit được ghim (40 ký tự) hoặc `null` |
| `build.target` | tầng trong Dockerfile, nếu có |
| `port.local`, `port.container` | cổng trên máy (từ 8000, không trùng dịch vụ khác) và cổng chương trình nghe trong container |
| `health` | đường kiểm sức khỏe |
| `env` | biến môi trường không bí mật |
| `secretEnv` | TÊN các biến bí mật; giá trị local được sinh ngẫu nhiên vào `local/.run/secrets.env` |
| `database` | tên cơ sở dữ liệu, tên biến nhận địa chỉ, dạng địa chỉ |
| `broker.bootstrapEnv` | tên biến nhận địa chỉ broker; `null` nếu dịch vụ đọc địa chỉ từ tệp cấu hình |
| `topics` | topic cần có sẵn |
| `files` | tệp cấu hình lấy TỪ COMMIT ĐƯỢC GHIM rồi gắn vào container |
| `aliases` | tên phụ trong mạng chung |
| `sidecars` | đồ giả lập đi kèm, build từ cùng commit; không đẩy lên Docker Hub |
| `project` | (tùy chọn) nhóm dự án, để bảng điều khiển gom dịch vụ |
| `kind` | (tùy chọn) loại dịch vụ, ví dụ `api`, `web`, `worker`: chỉ là nhãn trên bảng điều khiển |
| `cloud.route` | đường vào trên cloud; để `null` cho tới khi có máy chủ |

## CI trên GitHub

Tổ chức `Autonomous-SoftwareAgent`, repo công khai: repo này là `deploy`, dịch vụ là `svc-<dịch-vụ>`. Bộ công cụ Claude (harness) và các quyết định chung chỉ nằm ở máy làm việc, không có repo trên GitHub. Docker Hub: kho công khai `nguyen1410/svc-<dịch-vụ>`.

| Workflow ở repo deploy | Chạy khi | Làm gì |
|---|---|---|
| `ci.yml` | push lên `main`, pull request | `bsn.js check`; test của lệnh điều khiển và tệp phụ của CI |
| `service-pin.yml` | dịch vụ gọi, TRƯỚC job test của nó | đọc tờ khai báo: commit nào chờ đóng gói, và job test phải chạy trên những commit nào |
| `service-image.yml` | dịch vụ gọi, sau job test của nó | đóng gói đúng commit đã khai (dùng lại lớp từ bản trước), quét bí mật, chạy thử bản cạnh PostgreSQL và broker, rồi đẩy Docker Hub; không có commit chờ thì dừng |
| `pins.yml` | tờ khai báo đổi, hoặc chạy tay | `bsn.js images`: commit được ghim đã có bản chưa; còn bản chờ build thì vẫn xanh kèm cảnh báo; chạy tay với `strict` thì đỏ |
| `prune.yml` | thứ Hai hằng tuần, hoặc chạy tay | dọn bản cũ: giữ `registry.keep` bản mới nhất, cùng bản đang ghim và bản ghim liền trước |

Trong repo của dịch vụ:

- `bsn.ci.json` ở gốc: `{"service": "<tên>", "dockerTarget": "<tầng Dockerfile, nếu có>"}`. Tên repo phải đúng là `svc-<tên>`, nếu không workflow từ chối.
- Workflow của dịch vụ có `workflow_dispatch` trong `on:` (để chạy tay) và ba job: `pin` của nền, `test` của riêng nó (ngôn ngữ, cơ sở dữ liệu, broker chạy kèm) chạy trên từng commit mà `pin` nêu, rồi `image` của nền:

```yaml
  pin:
    uses: Autonomous-SoftwareAgent/deploy/.github/workflows/service-pin.yml@main
  test:
    needs: pin
    strategy:
      fail-fast: false
      matrix:
        ref: ${{ fromJSON(needs.pin.outputs.refs) }}
    steps:
      - uses: actions/checkout@<mã commit>
        with:
          ref: ${{ matrix.ref }}
      # cài ngôn ngữ, chạy đúng lệnh test của dịch vụ
  image:
    needs: [pin, test]
    uses: Autonomous-SoftwareAgent/deploy/.github/workflows/service-image.yml@main
    with:
      commit: ${{ needs.pin.outputs.commit }}
    secrets: inherit
```

Cách gọi cũ (chỉ có `test` và `image`, không truyền `commit`) vẫn chạy, nhưng khi đó chỉ commit ở đầu nhánh được xét.

Luật đóng gói (S-029): chỉ nhánh `main` (push hoặc chạy tay), và commit được đóng gói là commit đang được ghim trong `services/<dịch-vụ>.json` của repo này ở thời điểm chạy, miễn nó đã có trên nhánh `main` vừa đẩy và chưa có bản. Commit đó nằm dưới đầu nhánh thì job `test` chạy trên cả đầu nhánh lẫn chính nó. Không có commit nào chờ thì job `image` dừng sau bước quyết định, vẫn xanh, và ghi lý do. Commit nào được ghim cũng được đóng gói, kể cả commit chỉ sửa tài liệu. Một commit chỉ có một bản: chạy lại không ghi đè. Trước khi đẩy, bản được bật thử theo đúng tờ khai báo (cùng biến môi trường như lúc chạy trong hệ, cạnh PostgreSQL và broker cùng phiên bản với tầng dùng chung; đồ giả lập đi kèm không được bật) và phải trả 2xx ở đường kiểm sức khỏe đã khai; không khỏe thì không đẩy. Có commit chờ đóng gói mà thiếu secret `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` thì lần chạy ĐỎ.

Máy của GitHub không giữ lớp giữa các lần chạy, nên bước build ghi kèm thông tin đệm vào bản và lấy lớp từ bản `main-` gần nhất của chính dịch vụ đó: lớp không đổi giữ nguyên mã băm và không phải tải lên lại.

Bộ quét bí mật (`ci/scan-image.js`) chỉ bắt các dạng token có khuôn rõ, tệp `.env`, tệp khóa, thư mục `.git`, và biến ENV/ARG tên như bí mật mà mang giá trị. Nó bỏ qua thư mục thư viện và thư mục hệ thống của ảnh nền. Qua được bước này không chứng minh bản sạch.

## Đã kiểm và chưa kiểm

Đã kiểm ngày 2026-10-08, ở tổ chức `Autonomous-SoftwareAgent` (các lần chạy ghi ở các khối bên dưới thuộc tổ chức cũ đã xóa, không còn xem được):

- Repo deploy: workflow `ci` xanh (lần chạy 37717124730).
- `svc-payment-hub`, lần chạy 37717244528: tờ khai báo ghi `d942b02259e5`, nằm dưới đầu nhánh `8f9f1ef`. Job `pin` chọn đúng commit đã khai; job `test` chạy trên cả hai commit (mỗi bên 773 ca, 771 qua, 0 hỏng, 2 bỏ qua vì cần Kafka thật); job `image` đóng gói đúng commit đã khai, quét bí mật không thấy gì trong các dạng được kiểm, bật thử bản cạnh PostgreSQL và nhận 2xx ở `/health`, đẩy `nguyen1410/svc-payment-hub:main-d942b02259e5`.
- `svc-payment-hub`, lần chạy 37719609170: ghim đầu nhánh `dd90147e95c3`; xanh, dùng lại lớp từ bản trước, chạy thử khỏe, đẩy `main-dd90147e95c3`.
- Qua bảng điều khiển ở máy (đích là hệ local) với hai bản trên: Deploy 24 giây và 20 giây, Rollback về bản liền trước 8 giây (tờ khai báo được ghi lại), Deploy lại 12 giây; sau mỗi lần đường `/health` thật của dịch vụ trả 200; dịch vụ còn lại không bị khởi động lại.
- `ci/smoke.js` ở máy làm việc: khỏe với bản của payment-hub và của ingest, không khỏe với một bản không khởi động được, không để lại container hay mạng.
- Bảy bản đóng gói cũ trên Docker Hub đã xóa theo lệnh người dùng.

Đã kiểm ngày 2026-10-05, trên máy này:

- `payment-hub` và `ingest` chạy cùng lúc từ commit được ghim ở cổng 8000 và 8001, đều báo khỏe.
- Demo của `payment-hub` chạy qua cổng 8000 và cổng giả 8100: tạo thanh toán, khách trả, cổng giả báo về, đơn chuyển PAID; sự kiện có trong topic `payment.events.v1` của broker chung. Trong lần chạy của phiên harness, bước cuối của demo báo lỗi kết nối vì đọc Kafka ở cổng mặc định 19092 (cổng của cách chạy một mình); phiên payment-hub sau đó chạy lại với `KAFKA_BROKER=127.0.0.1:19192` và báo demo đạt trọn, kể cả bước Kafka.
- `ingest` chạy với Redpanda: đăng ký đối tác và danh mục qua API nội bộ, nhà cung cấp mô phỏng gửi một lô nhận 202, ba topic `ingest.ari.*` mỗi topic có thêm một tin, outbox về 0. Bộ test Kafka của `ingest` (tạm dừng broker, khởi động lại) CHƯA chạy với Redpanda.
- Lúc build, `payment-hub` có 10 tệp đang sửa dở; tệp `src/adapters/registry.js` trong ảnh trùng băm với bản đã commit, khác bản đang sửa.

Đã kiểm ngày 2026-10-06:

- Dự án GCP `ai-sdlc-bsn` (tên hiện "AI-SDLC", S-020): trạng thái ACTIVE, đã gắn tài khoản thanh toán, vùng `asia-southeast1`. Dự án còn RỖNG: chưa có VM, đĩa, địa chỉ IP nào. Dùng bằng cấu hình `gcloud` riêng tên `bsn` (thêm `--configuration=bsn` vào lệnh; cấu hình `default` của máy không đổi). Có cảnh báo ngân sách 3.900.000 VND mỗi tháng (khoảng 150 USD), báo email ở mức 50%, 90%, 100%; cảnh báo không tự chặn chi tiêu.
- Đẩy thử lên một kho riêng tư `nguyen1410/bsn-test` để đo (Docker Hub tính bản đã nén): `payment-hub` 62,0 MB, `ingest` 68,4 MB; bản thứ hai của `payment-hub` (commit khác mã) tốn thêm 0,10 MB. Xóa một nhãn bằng token đọc/ghi/xóa: được. Giới hạn kéo về khi đã đăng nhập: máy chủ Docker trả 200 lần mỗi giờ cho tài khoản này.
- Sau khi tách tờ khai báo (S-023): test của lệnh infra và tệp phụ của CI 31/31 qua, test harness 263/263 qua (trên Windows); `up --apply` chạy lại từ tờ khai báo mới, hai dịch vụ vẫn khỏe (8000 `/health` và 8001 `/healthz` trả 200), container không bị dựng lại.
- Bộ quét bí mật chạy trên hai bản thật ở máy (`bsn-payment-hub`, `bsn-ingest`): không thấy gì trong các dạng được kiểm.

Đã kiểm ngày 2026-10-07, lần đẩy đầu lên GitHub (S-026):

- Ba repo công khai trong tổ chức `Autonomous-SoftwareAgent`: `platform`, `svc-payment-hub`, `svc-ingest`; mỗi repo chỉ có nhánh `main`. Trước khi đẩy đã quét cây mã và lịch sử sẽ đẩy: không thấy token, tệp khóa, địa chỉ thư thật hay tên dự án cũ trong các dạng được quét.
- `svc-payment-hub`, workflow `ci` (lần chạy 37501488888): job test xanh, 687 ca, 685 qua, 0 hỏng, 2 bỏ qua (cần Kafka thật); job image xanh, bung 3126 tệp để quét, không thấy bí mật, đã đẩy `nguyen1410/svc-payment-hub:main-0db13d6d6264`.
- `svc-ingest`, workflow `ci` (lần chạy 37501492056): job test xanh, 104 qua, 0 hỏng, 3 bỏ qua (ba ca Kafka cần tạm dừng broker, CI KHÔNG phủ phần này); job image xanh, bung 6403 tệp để quét, không thấy bí mật, đã đẩy `nguyen1410/svc-ingest:main-c4bc4f8c59cc`.
- `platform`, workflow `ci` (lần chạy 37501420219): job `infra` xanh. Job `harness` ĐỎ: 269 test, 263 qua, 5 hỏng trên Linux, đều quanh việc bảo vệ tệp của cổng duyệt; đã ghi `docs/handoff/2026-10-07-infra-to-root-5-test-harness-hong-tren-linux.md`.
- `platform`, workflow `pins` (lần chạy 37501420225): ĐỎ, đúng như thiết kế, vì lúc đó chưa commit được ghim nào có bản. Sau khi hai dịch vụ có bản: `node infra/bsn.js images` báo CÓ cho `ingest`, THIẾU cho `payment-hub` (đang ghim `ff08f38674c7`, commit chưa qua CI; bản có sẵn là của `0db13d6d6264`). Workflow `pins` còn đỏ cho tới khi phiên payment-hub ghim commit có bản.
- `up --pull` kéo thật bản CI của `ingest`, đọc mã commit ghi bên trong bản, thấy khớp commit được ghim, gắn nhãn cục bộ; `ingest` ở hệ local đang chạy từ chính bản đó và `/healthz` trả 200. Với `payment-hub`, `up --pull` dừng và nói rõ không có bản cho commit đang ghim; `up` thường thì build tại chỗ và dịch vụ khỏe.
- Kho trên Docker Hub của hai dịch vụ được tạo tự động ở lần đẩy đầu và là công khai.

Đã kiểm ngày 2026-10-07, sau khi tách thành repo deploy (S-028):

- Mã chạy được khi repo đứng một mình: thử trong container Linux với thư mục không tên `infra` và không có repo dịch vụ, `check` qua và 31/31 test qua.
- Lần chạy đầu của repo `Autonomous-SoftwareAgent/deploy` trên GitHub: workflow `ci` xanh (lần chạy 37505766287, 31/31 test), workflow `pins` xanh (lần chạy 37505766252, cả `ingest` và `payment-hub` đều CÓ bản cho commit đang ghim).
- Các kết quả ở mục 2026-10-07 phía trên ghi tên repo `platform`: đó là repo trước khi tách, sẽ bị xóa; workflow của hai dịch vụ lúc đó gọi workflow dùng chung ở repo ấy.

Đã kiểm ngày 2026-10-07, hai dịch vụ gọi workflow dùng chung ở repo này:

- `svc-payment-hub` (lần chạy 37506736416, commit `2d4c9e5ee6b6`) và `svc-ingest` (lần chạy 37506753010, commit `9f8c7e21bc2d`): test xanh, job `image` lấy workflow từ `Autonomous-SoftwareAgent/deploy`, quét bí mật sạch, có bản trên Docker Hub.
- Đo trên Docker Hub, bản thứ hai so với bản đầu (lúc CHƯA có bước dùng lại lớp): `payment-hub` tốn thêm 0,38 MB; `ingest` tốn thêm 21,4 MB, vì lớp cài thư viện 21,3 MB dựng lại lệch vài trăm byte nên bị coi là lớp mới.
- Repo `platform` đã xóa sau khi không còn workflow nào gọi nó.

Đã kiểm ngày 2026-10-07, luật khai báo trước, build sau và bước dùng lại lớp (S-029):

- `ingest`, khai trước rồi đẩy (lần chạy 37547717516, commit `83cd8f49b304`): test 104 qua, 3 bỏ qua; quyết định "ĐÓNG GÓI: đúng là bản đã khai"; có bản. Bản này là bản đầu mang thông tin đệm nên chưa dùng lại được lớp nào của bản trước.
- `ingest`, bản kế tiếp (lần chạy 37547910746, commit `b1d635a40483`): sáu bước build báo CACHED, cả 10 lớp "Layer already exists", không lớp nào phải tải lên.
- `payment-hub`, đẩy mà CHƯA khai (lần chạy 37551621082, commit `d732996ec25d`): test 685 qua, 0 hỏng; quyết định "KHÔNG đóng gói: không phải bản đã khai"; Docker Hub không có bản cho commit đó.
- `payment-hub`, khai sau rồi chạy tay (lần chạy 37552450251, cùng commit): đóng gói và đẩy; một phần lớp có sẵn, một phần phải tải lên (bản trước của nó chưa mang thông tin đệm).
- Lúc vừa khai mà chưa có bản: `images` báo "CHỜ BUILD" với mã thoát 0. Workflow `ci` và `pins` của repo này xanh sau mỗi lần đẩy tờ khai báo.
- `up --pull --apply` kéo hai bản CI mới, kiểm commit ghi bên trong bản; cả hai dịch vụ ở hệ local chạy từ bản CI và báo khỏe.

Đã kiểm ngày 2026-10-07, lệnh deploy và rollback trên hệ local (chặng 5):

- Test: 44/44 qua trên Windows và trong container Linux với repo đứng một mình (11 ca mới cho deploy và rollback, dùng Docker giả có trạng thái).
- Thử thật với `ingest` trên hệ local, bằng các bản đã có trên Docker Hub: deploy sang bản `83cd8f49b304` rồi deploy lại `b1d635a40483`, cả hai lần khỏe và `/healthz` trả 200.
- Thử bản hỏng: dựng ở máy một ảnh cố ý không mở cổng, mang nhãn và commit của `9f8c7e21bc2d` (không đẩy đi đâu), ghim commit đó rồi deploy với `BSN_HEALTH_SECONDS=25`. Kết quả: báo "không khỏe sau 25 giây", tự bật lại `b1d635a40483`, `/healthz` trả 200, lệnh thoát mã 1, `status` báo "TỪ COMMIT KHÁC BẢN GHIM", sổ ghi `deploy:failed` rồi `auto-revert:ok`. Container của `payment-hub` không bị khởi động lại trong suốt các phép thử.
- Rollback mặc định: về `83cd8f49b304`, khỏe, tờ khai báo được ghi lại. Rollback về một commit chưa từng chạy ở đây: bị từ chối.
- Sau phép thử đã trả hệ về `b1d635a40483`, xóa ảnh hỏng giả; tờ khai báo trong git không đổi.

Đã kiểm ngày 2026-10-07, trên một máy thử ở GCP (`e2-small`, 2 GB RAM, Ubuntu 24.04, vùng asia-southeast1; lệnh chạy NGAY TRÊN máy đó qua SSH):

- `server/setup.sh` chạy trên máy mới tinh: cài Docker 29.8.2, Node 24.21.0, git; lấy repo deploy và hai repo dịch vụ về `/opt/bsn`. `check` qua; test 44/44 qua trên máy đó.
- `up --pull --apply`: cả hệ lên trong 2 phút 9 giây, hai dịch vụ khỏe, bản kéo từ Docker Hub (bộ giả lập MoMo build tại chỗ từ repo dịch vụ).
- Deploy `ingest` sang `83cd8f49b304` (38 giây, có kéo bản) rồi về `b1d635a40483` (28 giây): cả hai khỏe.
- Bản hỏng (ảnh giả mang commit `9f8c7e21bc2d`, dựng trên máy thử, không đẩy đi đâu) với `BSN_HEALTH_SECONDS=60`: báo không khỏe, tự bật lại bản trước, bản trước khỏe, mã thoát 1, đầu ra `--json` có `"reverted":"ok"`. `payment-hub` không bị khởi động lại.
- **Cùng phép thử với `BSN_HEALTH_SECONDS=25` thì bản cũ cũng bị báo "không khỏe"** dù sau đó nó chạy bình thường: trên máy cỡ này `ingest` cần hơn 25 giây mới trả lời. Đừng đặt thời gian chờ dưới 60 giây trên máy nhỏ; mặc định là 120.
- Rollback mặc định chạy và ghi lại tờ khai báo; rollback về commit chưa từng chạy trên máy đó bị từ chối.
- Các bước của hai workflow `deploy` và `rollback` (bản đã sửa, làm việc trên `/opt/bsn`) đã được gõ tay lần lượt trên máy thử và chạy đúng, TRỪ bước đẩy tờ khai báo bằng token của GitHub.
- Bộ nhớ khi cả hệ chạy, không tải: dùng khoảng 810 MB trên 1960 MB.

Đã kiểm ngày 2026-10-07, sau khi chuyển mã sang bốn lớp và thêm bảng điều khiển (D-007):

- Test: 86/86 qua trên Windows và trong container Linux với repo đứng một mình. Gồm: luật thuần của domain; bộ test hợp đồng chạy cho cả bộ nối trên đĩa lẫn bộ nối trong bộ nhớ; 48 ca của dòng lệnh (giữ nguyên điều chúng kiểm từ trước khi chuyển); 13 ca của bảng điều khiển qua HTTP; ca "giết bảng điều khiển giữa chừng"; và test kiến trúc quét lệnh nhập giữa các lớp.
- Giao diện mở bằng Edge chạy ngầm (chế độ `--memory`): đăng nhập sai rồi đúng; ba thẻ vẽ đúng trạng thái; bấm Deploy rồi "Thôi" thì không có việc nào; bấm lại và đồng ý thì nút bị khóa trong lúc chạy; bản hỏng tự lùi; Rollback chạy; đăng xuất. Không có lỗi JavaScript, trang không tràn ngang.
- Hệ local thật, qua đường gọi JSON của bảng điều khiển, với `ingest`: rollback về `83cd8f49b304` (8 giây) và deploy lại `b1d635a40483` (11 giây) đều khỏe; bấm lần hai trong lúc chạy trả 409; lệnh `deploy` gõ tay chen vào bị từ chối vì khóa; bản cố ý hỏng với chờ khỏe 40 giây thì bản cũ tự chạy lại và `/healthz` trả 200; `payment-hub` không bị khởi động lại.
- **Lỗi thật tìm ra nhờ phép thử "giết bảng điều khiển giữa lúc rollback":** lần đầu, lần rollback dừng sau khi đã đổi container mà chưa ghi sổ và chưa ghi tờ khai báo, vì trên Windows Node tự giết tiến trình con khi tiến trình cha chết. Đã sửa (việc chạy trong tiến trình con tách rời) và thử lại: rollback xong sau 4 giây, sổ và tờ khai báo được ghi, khóa được nhả. `test/job-executor.test.js` giữ điều này và đỏ khi bỏ cách sửa.
- Sau phép thử đã trả hệ về `b1d635a40483` và xóa ảnh hỏng giả; tờ khai báo trong git không đổi.

Đã kiểm ngày 2026-10-07, bảng điều khiển ở máy làm việc (Windows) điều khiển hệ trên máy GCP thật (`--target`, D-009):

- Máy đích: `e2-small` ở asia-southeast1, đã cập nhật lên mã bốn lớp bằng `server/setup.sh`; 86/86 test qua trên máy đó; cả hệ tự chạy lại sau khi bật máy.
- Test: 94/94 qua ở máy làm việc (8 ca mới cho đích từ xa, đường SSH thay bằng bản giả; một ca đầu-cuối qua HTTP với "máy đích" là các ca sử dụng thật trên bộ nối trong bộ nhớ).
- Qua đường gọi JSON của bảng điều khiển, với `ingest` trên máy GCP: deploy sang `83cd8f49b304` xong sau 15 giây và khỏe; bấm lần hai trong lúc chạy trả 409; bản cố ý hỏng bị phát hiện sau 120 giây và bản cũ tự chạy lại (138 giây cả thảy); rollback về `b1d635a40483` xong sau 12 giây, tờ khai báo trên máy đích được ghi lại; `payment-hub` trên máy đích không bị khởi động lại.
- Giết bảng điều khiển ở máy làm việc giữa lúc rollback: máy GCP vẫn rollback xong, sổ deploy ghi, không còn khóa.
- Thời gian: đọc trạng thái 1,3 tới 1,9 giây; hỏi kho bản khoảng 6 giây (giữ 30 giây); lần đọc đầu sau khi khởi động khoảng 27 giây vì phải hỏi `gcloud` địa chỉ máy (được làm sẵn ở nền lúc khởi động). Bản đầu gọi `gcloud compute ssh` cho mỗi lần đọc mất 21 tới 32 giây, nên đã đổi sang gọi thẳng `ssh`.
- Trang mở bằng Edge chạy ngầm với đích thật (chỉ đọc): hiện đúng dòng đích và hai thẻ dịch vụ với bản đang chạy trên máy GCP; không lỗi JavaScript.
- Gặp thật trong lúc thử: mạng của máy làm việc rớt DNS một lúc, trang báo lỗi kèm lý do rồi tự chạy lại khi mạng có; `ssh` của Windows từ chối tệp khóa, dùng `BSN_SSH` thì chạy.
- Sau phép thử: hệ trên máy GCP chạy đúng hai bản đã khai, tờ khai báo ở đó không lệch git, ảnh hỏng giả đã xóa.

Chưa làm, chưa kiểm (thứ tự và thước đo xong ở [ROADMAP.md](ROADMAP.md)):

- **Người dùng thật chưa tự bấm trên trình duyệt** (đang chờ nghiệm thu). Bảng điều khiển chưa chạy trên Linux và chưa được đóng gói.
- **Đích từ xa**: chưa thử máy đích tắt bật lại trong lúc bảng điều khiển đang chạy (mới có test với ssh giả); chưa thử hai người cùng dùng; cứ khoảng 30 giây trang chờ thêm khoảng 6 giây vì hỏi lại kho bản.
- **Bảng điều khiển đọc trạng thái bằng lệnh docker đồng bộ**: mỗi lần đọc, máy chủ web đứng vài trăm mili giây, và vài giây khi hỏi kho bản (kết quả hỏi kho được giữ 30 giây). Chưa đo trên máy chủ.
- **Máy chủ vẫn phải có repo của dịch vụ.** Lệnh lấy tệp cấu hình và build đồ giả lập từ repo dịch vụ; cấu hình và mật khẩu là loại dùng cho local (sinh ngẫu nhiên trên máy). Máy chạy thật không được làm vậy: xem ROADMAP, chặng 6.
- Mô hình đã thử là MỘT máy tự chạy lệnh cho chính nó. Hai máy tách nhau (máy quản trị điều khiển máy chạy thật) chưa thử.
- Trường hợp bật lại bản cũ cũng hỏng mới có test với Docker giả, chưa gặp thật.

- Workflow `prune` (dọn bản cũ) chưa chạy lần nào. Chế độ `strict` của workflow `pins` mới kiểm bằng test ở máy.
- Bước dùng lại lớp mới đo với `ingest` trong trường hợp mã của ảnh không đổi; chưa đo trường hợp sửa mã thật (kỳ vọng: chỉ lớp mã tải lên, lớp thư viện dùng lại).
- Khai một commit nằm dưới đầu nhánh `main`, và lùi về commit cũ mà bản đã bị dọn: workflow đã được viết để đóng gói đúng commit đã khai, mới có test ở máy; CHƯA chạy trên GitHub.
- Chưa có VM, tên miền. `cloud.route` của mọi dịch vụ đang để trống.
- Cửa vào trên cloud (TLS, chia đường).
- Tầng dùng chung ở local dùng một tài khoản PostgreSQL cho mọi dịch vụ; production phải tách tài khoản.
- Container ở local chạy không có các rào cứng mà compose production của `payment-hub` có (chỉ đọc, bỏ capability).
- Sao lưu và khôi phục; ký bản đóng gói và quét lỗ hổng; đóng gói cho nhánh khác `main`.
- Giới hạn của gói Free của tổ chức GitHub (runner theo repo, mức bảo vệ nhánh) chưa kiểm; nhánh `main` của các repo hiện chưa có luật bảo vệ nào.

## Test

Từ `BSN_/`: `node --test infra/test/*.test.js infra/ci/test/*.test.js`. Từ gốc repo deploy: `node --test test/*.test.js ci/test/*.test.js`. Không cần Docker, không cần mạng.

| Tệp | Kiểm gì |
|---|---|
| `test/architecture.test.js` | Ranh giới giữa các lớp: lệnh nhập sai chiều, tệp dài quá 250 dòng, `ci/decide.js` và `ci/scan-image.js` đứng một mình |
| `test/domain.test.js` | Luật thuần: bảng quyết định của deploy và rollback, sổ deploy, đặt tên bản |
| `test/contract.test.js` | Cùng một bộ kiểm cho bộ nối trên đĩa và bộ nối trong bộ nhớ (Declarations, Locks, Ledger, Secrets, ConfigFiles) |
| `test/bsn.test.js`, `test/deploy.test.js` | Dòng lệnh từ đầu tới cuối với Docker giả ghi lại lời gọi; git và tar chạy thật trên repo tạm |
| `test/http.test.js` | Bảng điều khiển qua HTTP thật trên cổng ngẫu nhiên, các ca sử dụng thật trên bộ nối trong bộ nhớ |
| `test/fleet.test.js` | Bảng điều khiển theo môi trường: tổng quan, chi tiết dịch vụ, kiểm tra trước, lần chạy nhiều mục, log và biến môi trường |
| `test/safety.test.js` | Người dùng và vai trò, quyền theo môi trường, gõ tên xác nhận, duyệt, khung giờ khóa, cấu hình có phiên bản, ánh xạ nhánh, sổ thao tác |
| `test/console-db.test.js` | DB SQLite của bảng điều khiển: cùng bộ kiểm cho bộ nối SQLite và bộ nối trong bộ nhớ; chép từ tệp cũ; dữ liệu còn sau khi khởi động lại |
| `test/provision.test.js` | Thêm và gỡ môi trường: lệnh gcloud (giả), tạo máy qua bốn bước, xóa máy, quyền, xác nhận, nối lại sau khi khởi động lại |
| `test/ui.test.js` | Giao diện bằng trình duyệt thật chạy ngầm (Edge hoặc Chrome); máy không có trình duyệt thì tự bỏ qua và nói rõ |
| `test/web-text.test.js` | Giao diện không còn câu tiếng Việt và màn hình chỉ lấy chữ từ `text.js` |
| `test/remote.test.js` | Đích từ xa: tờ khai đích, đoạn lệnh gửi sang máy đích, chờ việc qua mạng chập chờn, bộ nối SSH, và một ca đầu-cuối |
| `test/job-executor.test.js` | Việc chạy trong tiến trình con: tham số, lỗi, và việc sống sót khi tiến trình cha chết |
| `ci/test/ci.test.js` | Ba tệp phụ của CI |
