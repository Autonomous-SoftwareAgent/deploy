---
module: bang-dieu-khien
---
# bang-dieu-khien - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## BDK-S-001: Bảng điều khiển web: người và agent deploy, rollback qua cùng các ca sử dụng với dòng lệnh
- spec_hash: 7214ffaa
- status: done
- code: src/application/console.js, src/application/jobs.js, src/application/auth.js, src/interfaces/http/server.js, src/interfaces/http/router.js, src/interfaces/http/pipeline.js, src/interfaces/http/controllers/deployments.js, src/interfaces/http/controllers/session.js, src/interfaces/http/controllers/static.js, src/interfaces/web/main.js, src/interfaces/web/store.js, src/interfaces/web/views/service-card.js, src/infrastructure/job-executors.js, src/infrastructure/fs-credentials.js, src/infrastructure/node-hasher.js, src/interfaces/cli/commands/console.js
- tests: test/http.test.js, test/job-executor.test.js, test/architecture.test.js
- deviation:
- notes: Ca sử dụng: application/console.js (trang trạng thái gộp, nhận yêu cầu), jobs.js (sổ việc), auth.js (mật khẩu, phiên, token, khóa tạm). Máy chủ web: interfaces/http/server.js với bảng định tuyến (router.js), chuỗi lớp chặn (pipeline.js và middleware/: host-guard, security-headers, authenticate, csrf, json-body), ba bộ điều khiển. Giao diện: interfaces/web/ (index.html, styles.css, api.js, store.js, format.js, main.js, views/). Bộ nối: job-executors.js (tiến trình con tách rời, và gọi thẳng cho chế độ bộ nhớ), fs-credentials.js, node-hasher.js, memory/. Lắp ráp: src/composition.js (buildLocalConsole, buildMemoryConsole). Phiên đăng nhập và sổ việc nằm trong bộ nhớ của tiến trình: khởi động lại bảng điều khiển thì phải đăng nhập lại và danh sách việc trống.

## BDK-S-002: Đích từ xa: bảng điều khiển ở máy này ra lệnh cho máy chạy hệ qua SSH
- spec_hash: 557aa19a
- status: done
- code: src/application/remote-target.js, src/application/remote-jobs.js, src/domain/target.js, src/infrastructure/gcloud-ssh-shell.js, src/infrastructure/fs-targets.js, src/composition.js, src/interfaces/cli/commands/console.js, targets/README.md
- tests: test/remote.test.js
- deviation:
- notes: domain/target.js: luật của tờ khai đích. application/remote-target.js: các đoạn lệnh gửi sang máy đích (scripts) và ba hàm check, getStatus, getImages đọc đầu ra --json; remote-jobs.js: cổng JobExecutor dựng trên cổng RemoteShell. infrastructure/gcloud-ssh-shell.js: cổng RemoteShell (gcloud một lần, rồi ssh thẳng); fs-targets.js: đọc targets/<tên>.json. composition.js: buildRemoteConsole. Ca sử dụng console.js thêm kết quả TARGET_UNREACHABLE. Trang hiện dòng đích (interfaces/web/main.js).
