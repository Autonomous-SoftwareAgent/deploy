---
module: khai-bao
---
# khai-bao - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## KHAI-S-001: Mỗi dịch vụ một tờ khai báo do chính nó ghi; nền chỉ đọc và kiểm
- spec_hash: e0f4ff95
- status: done
- code: src/domain/declaration.js, src/application/check.js, src/application/pin.js, src/infrastructure/fs-declarations.js, platform.json
- tests: test/bsn.test.js, test/contract.test.js
- deviation:
- notes: Luật hợp lệ: src/domain/declaration.js (validate, secretNames, pick). Đọc và ghi tệp: src/infrastructure/fs-declarations.js (cổng Declarations). Ca sử dụng: check.js (thêm bước hỏi repo có trên máy không qua cổng Source), pin.js. Lệnh: src/interfaces/cli/commands/check.js, pin.js. Chưa có: CODEOWNERS trên GitHub để khóa "dịch vụ chỉ ghi tờ của mình"; hiện chỉ có hook của harness ở máy.
