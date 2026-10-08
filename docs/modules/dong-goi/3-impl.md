---
module: dong-goi
---
# dong-goi - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## GOI-S-001: Khai báo trước, build sau: chỉ đóng gói commit đã khai
- spec_hash: 67837213
- status: done
- code: ci/decide.js, ci/smoke.js, .github/workflows/service-pin.yml, .github/workflows/service-image.yml
- tests: ci/test/ci.test.js
- deviation:
- notes: ci/decide.js: decide (hàm thuần), readDeclaration, readRegistry, isAncestor, imageOnRegistry, main. ci/smoke.js: plan (hàm thuần), run, parseArgs. Phần workflow chỉ kiểm được bằng lần chạy thật trên GitHub: bản mới (service-pin, đóng gói theo commit đã khai, chạy thử trước khi đẩy) CHƯA chạy lần nào; ci/smoke.js đã chạy thật ở máy làm việc với bản của hai dịch vụ ngày 2026-10-08.
