---
module: dong-goi
---
# dong-goi - Spec (tầng 2)

Design được tách thành yêu cầu, contract, tiêu chí nghiệm thu và task. Khung tự sinh từ design; điền qua tool `spec_fill`.

## GOI-S-001: Khai báo trước, build sau: chỉ đóng gói commit đã khai
- from: GOI-D-001
- derived_from: 9a770ce4
- status: ready
- requirement:
  - decide là hàm thuần nhận {event, ref, sha, repo, prefix, config, declaration} và trả {build, reason, service, target, repoName, tag, error?, note?}.
  - LỖI (mã thoát 1): thiếu bsn.ci.json; tên dịch vụ sai dạng; tên repo khác <prefix><service>; sha không đủ 40 ký tự; không đọc được tờ khai báo.
  - KHÔNG đóng gói (mã thoát 0): sự kiện khác push và workflow_dispatch; nhánh khác main; buildBranches không có main; dịch vụ chưa có tờ khai báo; commit đang chạy khác commit trong tờ khai báo (kể cả khi tờ chưa ghim commit nào). Lý do nêu commit đang khai và cách xử lý.
  - ĐÓNG GÓI: commit đang chạy trùng commit trong tờ khai báo. Nhãn là main-<12 ký tự>.
  - buildBranches có nhánh ngoài main: bỏ qua nhánh đó kèm ghi chú.
  - Workflow: build cho linux/amd64 kèm BUILDKIT_INLINE_CACHE=1 và --cache-from bản main- mới nhất của dịch vụ (lấy tên qua API công khai của Docker Hub; không có thì build bình thường); ghi các nhãn commit, repo mã, thời điểm, dịch vụ, nhánh, lần chạy; quét bí mật; đăng nhập và đẩy; bản đã có thì không đẩy lại; thiếu secret thì cảnh báo và không đẩy.
- contract:
  Trong repo dịch vụ: bsn.ci.json {service, dockerTarget?, buildBranches?}; workflow có job image với needs: test, uses: Autonomous-SoftwareAgent/deploy/.github/workflows/service-image.yml@main, secrets: inherit; nên có workflow_dispatch.
  Đầu vào của workflow dùng chung: deploy-repo, deploy-ref, repo-prefix. Secret: DOCKERHUB_USERNAME, DOCKERHUB_TOKEN.
  ci/decide.js đọc biến GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_SHA, GITHUB_REPOSITORY, BSN_REPO_PREFIX, BSN_DEPLOY_DIR; ghi vào GITHUB_OUTPUT: build, service, target, repo_name, tag.
  Bản đẩy lên: <DOCKERHUB_USERNAME>/<repo_name>:main-<12 ký tự commit>.
- acceptance:
  - Test trong ci/test/ci.test.js: trùng commit đã khai thì đóng gói (cả push lẫn chạy tay); khác commit, chưa ghim, chưa có tờ khai báo thì không đóng gói và không phải lỗi; nhánh khác main và pull request không đóng gói; thiếu bsn.ci.json, tên sai, repo đẩy dưới tên khác là lỗi; đọc tờ khai báo từ bản checkout.
  - Đã chạy thật trên GitHub ngày 2026-10-07 với hai dịch vụ: khai trước rồi đẩy thì đóng gói; đẩy khi chưa khai thì test xanh và không có bản; khai sau rồi chạy tay thì đóng gói; bản kế tiếp không đổi mã dùng lại toàn bộ lớp. Số của từng lần chạy: README.md mục "Đã kiểm".
  - Chưa kiểm: bước dùng lại lớp với một commit sửa mã thật.
- tasks:
