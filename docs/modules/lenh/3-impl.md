---
module: lenh
---
# lenh - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## LENH-S-001: Lệnh điều khiển chạy cả hệ ở local từ commit được ghim
- spec_hash: bd160451
- status: done
- code: bsn.js, src/composition.js, src/interfaces/cli/index.js, src/application/stack.js, src/application/images.js, src/application/get-status.js, src/application/get-images.js, src/domain/naming.js, src/domain/stack-plan.js, src/infrastructure/docker-runtime.js, src/infrastructure/git-source.js
- tests: test/bsn.test.js, test/architecture.test.js
- deviation:
- notes: bsn.js là cửa vào mỏng: lắp bằng src/composition.js rồi gọi src/interfaces/cli/index.js (bảng lệnh, mỗi lệnh một tệp trong commands/). Bật và tắt cả hệ: application/stack.js. Build từ commit được ghim và kéo bản CI có kiểm commit bên trong: application/images.js. Tên bản: domain/naming.js. Mô tả chạy (compose): domain/stack-plan.js. Lệnh docker và git nằm trong hai bộ nối docker-runtime.js, git-source.js. Ranh giới giữa các lớp do test/architecture.test.js giữ.
