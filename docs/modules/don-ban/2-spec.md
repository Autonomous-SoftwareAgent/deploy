---
module: don-ban
---
# don-ban - Spec (tầng 2)

Design được tách thành yêu cầu, contract, tiêu chí nghiệm thu và task. Khung tự sinh từ design; điền qua tool `spec_fill`.

## DON-S-001: Dọn bản cũ trên Docker Hub mà không làm mất đường lùi
- from: DON-D-001
- derived_from: c9088b17
- status: ready
- requirement:
  - plan là hàm thuần: nhận danh sách nhãn kèm thời điểm, số bản giữ và tập nhãn không bao giờ xóa; trả ba danh sách giữ, xóa, không đụng. Chỉ nhãn khớp main-<12 ký tự hex> mới được xét.
  - pinnedTags đọc commit đang ghim và commit ghim liền trước từ lịch sử git của tờ khai báo, chạy git ngay trong thư mục infra với đường dẫn tương đối (đúng cả khi thư mục đó là gốc repo lẫn khi là thư mục con).
  - main: đăng nhập Docker Hub, với từng dịch vụ liệt kê nhãn (theo trang), lập kế hoạch, in kế hoạch; có --apply thì xóa từng nhãn và đếm lần hỏng. Kho không có (404) thì bỏ qua. Thiếu tên tài khoản hoặc token thì in lý do và thoát 0. Có nhãn không xóa được thì thoát 1.
- contract:
  node ci/prune-images.js [--apply]. Biến môi trường: DOCKERHUB_USERNAME, DOCKERHUB_TOKEN (token có quyền xóa).
  Đọc registry.namespace, registry.repoPrefix, registry.keep từ platform.json.
  API Docker Hub dùng: POST /v2/users/login; GET /v2/repositories/<kho>/tags/?page_size=100; DELETE /v2/repositories/<kho>/tags/<nhãn>/.
  Workflow prune: lịch thứ Hai hằng tuần (xóa thật); chạy tay với ô apply.
- acceptance:
  - Test trong ci/test/ci.test.js với Docker Hub giả: giữ N bản mới nhất cùng bản đang ghim và bản ghim liền trước; nhãn không theo khuôn không bị đụng; mặc định không gọi xóa; --apply gọi xóa đúng các nhãn; kho chưa có thì bỏ qua; thiếu token thì không làm gì; không in token.
  - Đã kiểm với Docker Hub thật ngày 2026-10-06: token loại đọc, ghi, xóa xóa được một nhãn qua API (mã 204).
  - Chưa kiểm: workflow prune chưa chạy lần nào trên GitHub.
- tasks:
