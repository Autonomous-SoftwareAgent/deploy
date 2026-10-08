---
module: bang-dieu-khien
---
# bang-dieu-khien - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## BDK-S-001: Bảng điều khiển web: người và agent deploy, rollback qua cùng các ca sử dụng với dòng lệnh
- spec_hash: 7214ffaa
- status: done
- code: src/application/console.js, src/application/jobs.js, src/application/auth.js, src/interfaces/http/server.js, src/interfaces/http/router.js, src/interfaces/http/pipeline.js, src/interfaces/http/middleware/authenticate.js, src/interfaces/http/middleware/csrf.js, src/interfaces/http/controllers/deployments.js, src/interfaces/http/controllers/static.js, src/interfaces/web/main.js, src/interfaces/web/store.js, src/interfaces/web/views/shell.js, src/infrastructure/job-executors.js, src/infrastructure/fs-credentials.js, src/infrastructure/node-hasher.js, src/interfaces/cli/commands/console.js
- tests: test/http.test.js, test/job-executor.test.js, test/architecture.test.js
- deviation:
- notes: Từ 2026-10-08 đăng nhập của người là HTTP Basic do trình duyệt hỏi (D-011): không còn cookie phiên, /api/login, /api/logout và bộ điều khiển session; chỉ /healthz mở. Các đường /api cũ (state, deploy, rollback, jobs) giữ cho agent và đi qua cùng cổng an toàn với /api/v1 (BDK-D-004). Giao diện viết lại theo bản design của người dùng và dùng các đường /api/v1 (BDK-D-003).

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

## BDK-S-004: An toàn và cấu hình của bảng điều khiển: vai trò, cổng an toàn do máy chủ kiểm, người thứ hai duyệt, cấu hình có phiên bản, sổ thao tác
- spec_hash: 90a1b5af
- status: done
- code: src/domain/access.js, src/domain/branches.js, src/application/settings.js, src/application/approvals.js, src/application/audit.js, src/application/get-logs.js, src/infrastructure/fs-console-records.js, src/interfaces/http/controllers/admin.js, src/interfaces/web/config-store.js, src/interfaces/web/text.js, src/interfaces/web/text-config.js, src/interfaces/web/views/config.js, src/interfaces/web/views/approvals.js
- tests: test/safety.test.js, test/http.test.js, test/fleet.test.js, test/web-text.test.js
- deviation:
- notes: Đã kiểm 2026-10-08: 130 test qua; trình duyệt chạy ngầm với dữ liệu mẫu đi hết sáu mục cấu hình, tạo người dùng, gõ tên xác nhận, xin duyệt, không lỗi JavaScript. CHƯA kiểm với hệ thật: phân quyền, duyệt, giờ khóa (hệ thật mới thử deploy và rollback bằng token của agent khi chưa đặt mức bảo vệ nào). Có chủ ý không làm theo bản design: tạo và xóa môi trường trên trang, tự deploy khi có push, môi trường tạm theo nhánh, biểu đồ số đo (chưa có nguồn). Yêu cầu chờ duyệt và sổ lần chạy sống trong bộ nhớ.
