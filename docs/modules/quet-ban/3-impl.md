---
module: quet-ban
---
# quet-ban - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## QUET-S-001: Quét bí mật trong bản trước khi đẩy lên kho công khai
- spec_hash: db80da74
- status: done
- code: ci/scan-image.js, .github/workflows/service-image.yml
- tests: ci/test/ci.test.js
- deviation:
- notes: ci/scan-image.js: TOKENS (dòng 13), SKIP_DIRS (22), scanDir (44), scanHistory (73). Bước bung hệ tệp của bản và đếm số tệp nằm trong service-image.yml.
