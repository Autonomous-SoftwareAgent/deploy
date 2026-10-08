---
module: dong-goi
---
# dong-goi - Spec (tầng 2)

Design được tách thành yêu cầu, contract, tiêu chí nghiệm thu và task. Khung tự sinh từ design; điền qua tool `spec_fill`.

## GOI-S-001: Khai báo trước, build sau: chỉ đóng gói commit đã khai
- from: GOI-D-001
- derived_from: 1ad5be06
- status: ready
- requirement:
  - decide là hàm thuần nhận {event, ref, sha, repo, prefix, config, declaration, mode?, buildCommit?, onBranch?, imageExists?} và trả {build, reason, service, target, repoName, tag, commit, refs, error?, note?}.
  - Commit được xét: commit đã khai khi mode là pin; buildCommit khi được truyền; còn lại là commit đang chạy (sha). Nhãn là main-<12 ký tự của commit được xét>.
  - LỖI (mã thoát 1): thiếu bsn.ci.json; tên dịch vụ sai dạng; tên repo khác <prefix><service>; sha hoặc commit được xét không đủ 40 ký tự; không đọc được tờ khai báo.
  - KHÔNG đóng gói (mã thoát 0): sự kiện khác push và workflow_dispatch; nhánh khác main; buildBranches không có main; dịch vụ chưa có tờ khai báo; commit được xét khác commit trong tờ khai báo (kể cả khi tờ chưa ghim commit nào); commit được xét khác sha mà không nằm trên nhánh vừa đẩy; bản của commit đó đã có trên kho. Lý do nêu commit đang khai và cách xử lý.
  - ĐÓNG GÓI: các điều trên đều qua. refs là [sha] khi commit được xét trùng sha, là [sha, commit] khi nó nằm dưới đầu nhánh; không đóng gói thì refs là [sha].
  - main hỏi git (merge-base --is-ancestor) và kho (docker manifest inspect, tài khoản lấy từ platform.json) về đúng commit được xét rồi mới quyết định; ghi thêm commit và refs (mảng JSON) vào GITHUB_OUTPUT.
  - buildBranches có nhánh ngoài main: bỏ qua nhánh đó kèm ghi chú.
  - Workflow service-pin: lấy mã của dịch vụ kèm đủ lịch sử, chạy decide ở chế độ pin, trả commit, build, refs.
  - Workflow service-image: lấy đúng commit được truyền (bỏ trống thì commit đang chạy); build cho linux/amd64 kèm BUILDKIT_INLINE_CACHE=1 và --cache-from bản main- mới nhất của dịch vụ (không có thì build bình thường); ghi các nhãn commit, repo mã, thời điểm, dịch vụ, nhánh, lần chạy; quét bí mật; chạy thử bằng ci/smoke.js; đăng nhập và đẩy; bản đã có thì không đẩy lại; có commit chờ đóng gói mà thiếu secret thì dừng với mã lỗi.
  - ci/smoke.js: plan là hàm thuần sinh lệnh docker từ tờ khai báo (PostgreSQL khi có database, Redpanda và các topic khi có broker.bootstrapEnv, bản đóng gói với biến môi trường từ serviceEnv, tệp cấu hình gắn chỉ đọc từ mã của dịch vụ, cổng chỉ mở trên 127.0.0.1 do Docker chọn); không bật sidecars. Chờ đường kiểm sức khỏe trả 2xx trong thời hạn (mặc định 120 giây); bản tự thoát hoặc quá hạn thì in 40 dòng nhật ký cuối và thoát mã 1; luôn dọn container và mạng đã tạo.
- contract:
  Trong repo dịch vụ: bsn.ci.json {service, dockerTarget?, buildBranches?}; workflow có job pin (uses: Autonomous-SoftwareAgent/deploy/.github/workflows/service-pin.yml@main), job test với needs: pin, strategy.matrix.ref lấy từ fromJSON(needs.pin.outputs.refs) và bước lấy mã theo matrix.ref, job image với needs: [pin, test], uses: Autonomous-SoftwareAgent/deploy/.github/workflows/service-image.yml@main, with commit: needs.pin.outputs.commit, secrets: inherit; nên có workflow_dispatch. Cách gọi cũ (job image với needs: test, không truyền commit) vẫn hợp lệ.
  Đầu vào của hai workflow dùng chung: deploy-repo, deploy-ref, repo-prefix; service-image thêm commit và smoke-seconds. Đầu ra của service-pin: commit, build, refs. Secret: DOCKERHUB_USERNAME, DOCKERHUB_TOKEN.
  ci/decide.js đọc biến GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_SHA, GITHUB_REPOSITORY, BSN_REPO_PREFIX, BSN_DEPLOY_DIR, BSN_MODE, BSN_BUILD_COMMIT; ghi vào GITHUB_OUTPUT: build, service, target, repo_name, tag, commit, refs.
  ci/smoke.js: --service <tên> --image <bản> --source <thư mục mã của dịch vụ> [--seconds N]; đọc services/<tên>.json cạnh nó; thoát 0 khi khỏe, 1 khi không khỏe, 2 khi tham số sai.
  Bản đẩy lên: <DOCKERHUB_USERNAME>/<repo_name>:main-<12 ký tự commit>.
- acceptance:
  - Test trong ci/test/ci.test.js: trùng commit đã khai thì đóng gói (cả push lẫn chạy tay); khác commit, chưa ghim, chưa có tờ khai báo thì không đóng gói và không phải lỗi; nhánh khác main và pull request không đóng gói; thiếu bsn.ci.json, tên sai, repo đẩy dưới tên khác là lỗi; đọc tờ khai báo từ bản checkout; chế độ pin đóng gói commit đã khai nằm dưới đầu nhánh và đòi test cả hai commit; commit đã khai chưa có trên nhánh, đã có bản, hoặc khác commit được chỉ định thì không đóng gói; lệnh docker của bước chạy thử sinh đúng từ tờ khai báo và không bật đồ giả lập; phiên bản PostgreSQL và broker của bước chạy thử khớp local/docker-compose.yml; workflow service-image không còn đóng gói theo GITHUB_SHA, thiếu secret thì thoát mã 1, chạy thử nằm sau quét và trước đẩy.
  - Đã chạy thật ở máy làm việc ngày 2026-10-08: ci/smoke.js báo KHỎE với bản có sẵn của payment-hub và của ingest, báo KHÔNG KHỎE với một bản không khởi động được, và không để lại container hay mạng nào.
  - Bản trước của luật (chỉ đóng gói đầu nhánh) đã chạy thật trên GitHub ngày 2026-10-07 với hai dịch vụ ở tổ chức cũ; các lần chạy đó không còn xem được.
  - Chưa kiểm: hai workflow service-pin và service-image bản mới chưa chạy lần nào trên GitHub; bước dùng lại lớp với một commit sửa mã thật.
- tasks:
