---
module: local
---
# local - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## LOCL-S-001: Tầng dùng chung ở local: một PostgreSQL, một broker, một mạng
- spec_hash: 6834a2a2
- status: done
- code: local/docker-compose.yml, src/application/prepare-tier.js, src/infrastructure/compose-shared-tier.js, src/infrastructure/fs-secrets.js, src/domain/stack-plan.js
- tests: test/bsn.test.js, test/contract.test.js
- deviation:
- notes: Các bước chuẩn bị (bí mật, bật tầng, tạo cơ sở dữ liệu và topic): application/prepare-tier.js. Lệnh compose, psql, rpk: infrastructure/compose-shared-tier.js (cổng SharedTier). Sinh và giữ mật khẩu: infrastructure/fs-secrets.js (cổng Secrets). Cấp địa chỉ cơ sở dữ liệu và broker cho dịch vụ: domain/stack-plan.js (serviceEnv).
