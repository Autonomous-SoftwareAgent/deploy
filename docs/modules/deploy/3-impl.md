---
module: deploy
---
# deploy - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## DEP-S-001: Deploy và rollback một dịch vụ: bản đã khai, kiểm sức khỏe, tự bật lại bản trước
- spec_hash: 20d03cae
- status: done
- code: src/application/deploy.js, src/application/rollback.js, src/application/switch-version.js, src/application/service-lock.js, src/domain/deploy-policy.js, src/domain/ledger.js, src/domain/outcome.js, src/infrastructure/fs-ledger.js, src/infrastructure/file-locks.js
- tests: test/deploy.test.js, test/domain.test.js, test/contract.test.js
- deviation:
- notes: Luật (từ chối, không đổi, chuyển bản, lùi về đâu, hỏng thì bật lại bản nào): domain/deploy-policy.js. Sổ như một giá trị: domain/ledger.js. Khung chung bật một commit, chờ khỏe, tự lùi, ghi sổ: application/switch-version.js. Hai ca sử dụng: application/deploy.js, rollback.js. Khóa theo dịch vụ: application/service-lock.js trên cổng Locks (infrastructure/file-locks.js). Lưu sổ: infrastructure/fs-ledger.js. Lệnh: src/interfaces/cli/commands/deploy.js, rollback.js, switch.js. Đích là máy đang chạy lệnh (máy làm việc, hoặc máy chủ đã chuẩn bị bằng server/setup.sh); mô hình hai máy chưa có.
