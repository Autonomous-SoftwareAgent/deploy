---
module: don-ban
---
# don-ban - Implementation (tầng 3)

Đã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool `impl_link`.

## DON-S-001: Dọn bản cũ trên Docker Hub mà không làm mất đường lùi
- spec_hash: 3e702968
- status: done
- code: ci/prune-images.js, .github/workflows/prune.yml
- tests: ci/test/ci.test.js
- deviation:
- notes: ci/prune-images.js: TAG_RE (dòng 14), plan (17), pinnedTags (24). Mã và test đã xong; workflow prune chưa chạy lần nào trên GitHub.
