---
module: dong-goi
---
# dong-goi - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## GOI-S-001: Khai báo trước, build sau: chỉ đóng gói commit đã khai
- spec_hash: 3d5bfec5
- status: done
- code: ci/decide.js, .github/workflows/service-image.yml
- tests: ci/test/ci.test.js
- deviation:
- notes: ci/decide.js: decide (dòng 23), readDeclaration (48). Bước build, dùng lại lớp, quét và đẩy nằm trong service-image.yml và chỉ kiểm được bằng lần chạy thật trên GitHub (đã chạy ngày 2026-10-07 với hai dịch vụ); không có test tự động cho phần workflow.
