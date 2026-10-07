# infra (repo `Autonomous-SoftwareAgent/deploy`)

Quy tắc chung cho mọi phiên nằm ở `../CLAUDE.md` (tự nạp). **Mở phiên Claude Code ở `BSN_/`** rồi giao việc cho phần infra; hook, MCP `bsn-docs` và skill chỉ nạp ở gốc. Tệp này là phần riêng của nền deploy.

Thư mục này là MỘT REPO GIT RIÊNG (`Autonomous-SoftwareAgent/deploy`, công khai), không thuộc repo gốc: commit bằng `git -C infra ...`. Nó không phải một dịch vụ nghiệp vụ: nó là nền deploy và vận hành dùng chung cho mọi dịch vụ. Mã ở đây không được chứa tên dịch vụ nào.

## Phạm vi
- Làm trong `infra/` (đường dẫn tương đối trong tệp này tính từ thư mục đó). Ngoài thư mục này chỉ đọc; việc cần dịch vụ khác hay cần harness thì ghi yêu cầu vào `../docs/handoff/`.
- Đầu phiên: đọc [docs/agent/STATUS.md](docs/agent/STATUS.md), [docs/agent/DECISIONS.md](docs/agent/DECISIONS.md), [docs/agent/CONVENTIONS.md](docs/agent/CONVENTIONS.md), [ROADMAP.md](ROADMAP.md) (việc còn lại theo chặng) và mục "Đã kiểm và chưa kiểm" của [README.md](README.md). Liệt kê các tệp `../docs/handoff/*-to-infra-*.md` và `*-to-cicd-*.md` còn `open` và báo người dùng.
- Tài liệu ba tầng, `docs/service.yaml`, sơ đồ chỉ ghi qua công cụ MCP `bsn-docs` với `service="infra"`; không sửa tay. Trong `docs/` chỉ có Markdown và dữ liệu cho agent. Người đọc xem cổng `BSN_/docs/portal/infra/index.html`.
- Cách làm CI/CD từng bước: skill `cicd` (ở `BSN_/.claude/skills/`).

## Ai được sửa gì ở đây
- Phiên infra: mọi thứ trong repo này, TRỪ nội dung "muốn chạy commit nào" của từng dịch vụ.
- Phiên của một dịch vụ: chỉ tờ `services/<dịch-vụ>.json` của chính nó (bằng `node infra/bsn.js pin <dịch-vụ> --apply`). Hook `guard-scope.js` hỏi người dùng khi một phiên dịch vụ ghi tờ của dịch vụ khác.
- Không ai ghi tay vào `local/.run/` (tệp sinh khi chạy, không commit).

## Cấu trúc: bốn lớp, phụ thuộc một chiều (D-007)
Thiết kế đầy đủ, danh sách cổng và thứ tự thêm việc mới: [docs/agent/ARCHITECTURE.md](docs/agent/ARCHITECTURE.md). Đọc tệp đó trước khi thêm mã. Nguyên tắc ba lớp ở `../CLAUDE.md` viết cho dịch vụ nghiệp vụ; repo này theo cùng tinh thần (bên ngoài đổi thì lõi không đổi) với bốn lớp:

| Lớp | Thư mục | Chứa gì | Được nhập |
|---|---|---|---|
| Tờ khai báo | `services/`, `platform.json` | Dữ liệu duy nhất mô tả từng dịch vụ và cấu hình chung | (dữ liệu) |
| Domain | `src/domain/` | Luật thuần: tờ khai báo, đặt tên bản, sổ deploy, quyết định deploy và rollback, mô tả chạy | chỉ `domain`; không module `node:` nào |
| Application | `src/application/` | Mỗi ca sử dụng một tệp; `ports.js` khai các cổng. Trả kết quả, không in, không thoát | `domain`, `application` |
| Infrastructure | `src/infrastructure/` | Bộ nối cho từng cổng (docker, git, tệp, khóa, HTTP, tiến trình con); `memory/` là bộ nối trong bộ nhớ | `domain`, `application/ports.js`, module `node:` |
| Interfaces | `src/interfaces/cli`, `http`, `web` | Dòng lệnh (mỗi lệnh một tệp), máy chủ web (bảng định tuyến, chuỗi lớp chặn, bộ điều khiển), giao diện | `domain`, `application`; KHÔNG nhập `infrastructure` |
| Lắp ráp | `src/composition.js`, `bsn.js` | Nơi duy nhất tạo bộ nối và lắp vào ca sử dụng | tất cả |
| CI | `ci/`, `.github/workflows/` | Chạy trên máy của GitHub: `decide.js`, `scan-image.js` (đứng một mình), `prune-images.js`; workflow `ci`, `service-image`, `pins`, `prune` | `decide` và `scan-image` chỉ nhập trong `ci/` |
| Máy | `local/docker-compose.yml`, `server/` | Tầng dùng chung; tệp chuẩn bị một máy Ubuntu | |

- **Ranh giới do test giữ**: `test/architecture.test.js` quét mọi lệnh nhập và đỏ khi sai chiều, khi một tệp trong `src/` dài quá 250 dòng, hoặc khi tệp ngoài lớp infrastructure chạy tiến trình ngoài.
- **Thêm một việc mới**: luật vào `domain`; ca sử dụng mới là một tệp trong `application`; cần thứ gì bên ngoài thì thêm hàm vào cổng trong `ports.js`, cài ở CẢ bộ nối thật lẫn `memory/`, và thêm vào `test/contract.test.js`; lắp ở `composition.js`; cuối cùng mới thêm lệnh (`interfaces/cli/commands/`) hoặc đường gọi (`interfaces/http/server.js`).
- **Không tệp nào ngoài `composition.js` tự tạo bộ nối.** Mọi lệnh ra ngoài đi qua một cổng; `process-runner.js` là nơi duy nhất chạy lệnh ngoài một cách đồng bộ.
- **Ba cửa, một đường**: dòng lệnh, bảng điều khiển trên trình duyệt và agent gọi JSON đều đi qua cùng các ca sử dụng. Không viết luật trong lớp interfaces.
- Bảng điều khiển chạy mỗi việc trong một tiến trình con TÁCH RỜI (`detached`): đừng bỏ cờ đó (lý do và test ở `src/infrastructure/job-executors.js`).

## Việc của nền
- Sở hữu: cách một commit của dịch vụ thành bản đóng gói, cách chạy cả hệ trên một máy, deploy và rollback (dòng lệnh và bảng điều khiển web), và (chưa làm) mô hình hai máy trên GCP, vận hành.
- Không sở hữu: mã, test và Dockerfile của dịch vụ; job `test` trong workflow của dịch vụ; harness (`BSN_/.claude/`).
- Giao diện công bố cho dịch vụ: khuôn tờ khai báo (bảng trong `README.md`), tệp `bsn.ci.json` ở gốc repo dịch vụ, và workflow `Autonomous-SoftwareAgent/deploy/.github/workflows/service-image.yml@main`. Ba thứ này là điểm chạm duy nhất giữa nền và dịch vụ: giữ chúng ổn định (chỉ đổi theo kiểu thêm vào) thì hai bên phát hành không phải chờ nhau.
- Giao diện công bố cho người vận hành và agent: tên lệnh, tham số và đầu ra `--json` của `bsn.js`; các đường `/api` của bảng điều khiển (bảng trong `README.md`).
- Phụ thuộc ngoài: GitHub (tổ chức `Autonomous-SoftwareAgent`, GitHub Actions), Docker Hub (tài khoản `nguyen1410`), GCP (dự án `ai-sdlc-bsn`, chưa có máy nào).

## Quy tắc riêng (người dùng đã chốt)
- Nền không biết tên dịch vụ nào; thêm dịch vụ mới không được phải sửa mã hay workflow ở đây (S-023).
- Khai báo commit trước, build sau; không có build tự động; áp cho mọi dịch vụ (S-029).
- Chỉ nhánh `main` được đóng gói; nhãn bản là `main-<12 ký tự commit>`; không dùng `latest`; một commit chỉ có một bản.
- Kho Docker Hub công khai: không bí mật nào được vào bản đóng gói. Tài liệu và mã chỉ ghi TÊN secret (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`).
- Lên máy chạy thật phải có người duyệt; agent tự làm tới môi trường thử. Tạo thứ gì tính tiền trên GCP phải hỏi người dùng trước từng thứ.
- Deploy và rollback đi qua dòng lệnh và bảng điều khiển của repo này; KHÔNG đặt nút deploy trên GitHub Actions và không cài runner tự chạy (repo công khai; D-007).
- Mã phải theo bốn lớp, SOLID, thuần Node.js không thư viện ngoài, phần máy chủ và giao diện nằm chung một dịch vụ (người dùng chốt 2026-10-07). Không thêm "tệp tiện ích chung" gom nhiều việc.
- Bảng điều khiển đứng ngoài đường chạy của hệ: nó hỏng hay cập nhật thì dịch vụ vẫn chạy. Sổ deploy và tờ khai báo chỉ đổi theo kiểu thêm vào, để bản liền trước của lệnh vẫn đọc được.
- Đẩy repo này là đưa ra công khai: chỉ `git -C infra push` khi người dùng bảo; chỉ nhánh `main`.
- Kết quả ghi trong `README.md` phải là kết quả đã chạy thật, kèm số của lần chạy; điều chưa chạy ghi ở mục "Chưa làm, chưa kiểm".

## Lệnh thường dùng (chạy từ `BSN_/`)
- Kiểm tờ khai báo: `node infra/bsn.js check`. Trạng thái: `node infra/bsn.js status`. Bản đã có trên Docker Hub chưa: `node infra/bsn.js images [--strict]`. Ba lệnh này nhận `--json`.
- Chạy cả hệ ở local: `node infra/bsn.js up --apply` (build tại chỗ) hoặc `up --pull --apply` (kéo bản CI). Tắt: `node infra/bsn.js down --apply`.
- Đưa bản đã khai của MỘT dịch vụ lên (đích: máy đang chạy lệnh): `node infra/bsn.js deploy <dịch-vụ> --apply`; lùi: `node infra/bsn.js rollback <dịch-vụ> [commit] --apply`. Cả hai nhận `--json`. Thử với thời gian chờ ngắn: đặt biến `BSN_HEALTH_SECONDS` (đừng dưới 60 trên máy nhỏ).
- Bảng điều khiển web: `node infra/bsn.js console` (http://127.0.0.1:8900; mật khẩu và token ở `local/.run/console.first-login.txt` lần đầu). Phát triển giao diện mà không đụng hệ nào: `node infra/bsn.js console --memory`.
- Test: `node --test infra/test/*.test.js infra/ci/test/*.test.js` (bảng các tệp test ở cuối `README.md`).
- Thử như trên máy của GitHub (Linux, repo đứng một mình): chép `infra/` vào một container `node:24-alpine` dưới một tên thư mục khác rồi chạy `node bsn.js check` và `node --test test/*.test.js ci/test/*.test.js`.
- Xem workflow: `gh run list -R Autonomous-SoftwareAgent/deploy`.
