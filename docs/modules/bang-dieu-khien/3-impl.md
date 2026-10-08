---
module: bang-dieu-khien
---
# bang-dieu-khien - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## BDK-S-001: Bảng điều khiển web: người và agent deploy, rollback qua cùng các ca sử dụng với dòng lệnh
- spec_hash: 7214ffaa
- status: done
- code: src/application/console.js, src/application/jobs.js, src/application/auth.js, src/interfaces/http/server.js, src/interfaces/http/router.js, src/interfaces/http/pipeline.js, src/interfaces/http/controllers/deployments.js, src/interfaces/http/controllers/session.js, src/interfaces/http/controllers/static.js, src/interfaces/web/main.js, src/interfaces/web/store.js, src/interfaces/web/views/shell.js, src/infrastructure/job-executors.js, src/infrastructure/fs-credentials.js, src/infrastructure/node-hasher.js, src/interfaces/cli/commands/console.js
- tests: test/http.test.js, test/job-executor.test.js, test/architecture.test.js
- deviation:
- notes: Các đường /api cũ (state, deploy, rollback, jobs) và đăng nhập giữ nguyên cho agent. Giao diện từ ngày 2026-10-08 viết lại theo bản design của người dùng và dùng các đường /api/v1 (BDK-D-003): thẻ dịch vụ, danh sách việc và lịch sử của bản cũ không còn; trang không còn gọi /api/state.

## BDK-S-002: Đích từ xa: bảng điều khiển ở máy này ra lệnh cho máy chạy hệ qua SSH
- spec_hash: 557aa19a
- status: done
- code: src/application/remote-target.js, src/application/remote-jobs.js, src/domain/target.js, src/infrastructure/gcloud-ssh-shell.js, src/infrastructure/fs-targets.js, src/composition.js, src/interfaces/cli/commands/console.js, targets/README.md
- tests: test/remote.test.js
- deviation:
- notes: domain/target.js: luật của tờ khai đích. application/remote-target.js: các đoạn lệnh gửi sang máy đích (scripts) và ba hàm check, getStatus, getImages đọc đầu ra --json; remote-jobs.js: cổng JobExecutor dựng trên cổng RemoteShell. infrastructure/gcloud-ssh-shell.js: cổng RemoteShell (gcloud một lần, rồi ssh thẳng); fs-targets.js: đọc targets/<tên>.json. composition.js: buildRemoteConsole. Ca sử dụng console.js thêm kết quả TARGET_UNREACHABLE. Trang hiện dòng đích (interfaces/web/main.js).

## BDK-S-003: Bảng điều khiển theo môi trường: tổng quan, chi tiết dịch vụ, kiểm tra trước, lần chạy nhiều dịch vụ (theo bản design của người dùng)
- spec_hash: c6e9d186
- status: in-progress
- code: src/domain/fleet.js, src/domain/run.js, src/application/fleet.js, src/application/catalog.js, src/application/environment.js, src/application/runs.js, src/application/deploy.js, src/application/switch-version.js, src/infrastructure/job-executors.js, src/infrastructure/docker-registry.js, src/infrastructure/git-source.js, src/interfaces/http/controllers/fleet.js, src/interfaces/cli/commands/deploy.js, src/interfaces/cli/commands/switch.js, src/interfaces/web/store.js, src/interfaces/web/views/overview.js, src/interfaces/web/views/service.js, src/interfaces/web/views/dialog.js, src/interfaces/web/views/run.js, src/composition.js
- tests: test/fleet.test.js, test/deploy.test.js, test/job-executor.test.js, test/remote.test.js, test/domain.test.js
- deviation:
- notes: Đợt A xong trừ A7 (đăng nhập bằng hộp thoại của trình duyệt). Chưa có: so sánh commit theo tệp, SSE (trang hỏi định kỳ), mục Cấu hình. Đợt B, C, D chưa bắt đầu: xem docs/agent/CONSOLE-PLAN.md.
