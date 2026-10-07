---
module: don-ban
prefix: DON
---
# don-ban - Design (tầng 1)

Vì sao và cái gì: quyết định nghiệp vụ và kỹ thuật của module. Chỉ ghi qua tool `design_record` / `design_update`.

## DON-D-001: Dọn bản cũ trên Docker Hub mà không làm mất đường lùi
- date: 2026-10-07
- status: accepted
- decision: ci/prune-images.js liệt kê nhãn của kho <tài khoản>/<tiền tố><dịch-vụ> cho từng dịch vụ có tờ khai báo. Chỉ xét nhãn đúng khuôn main-<12 ký tự hex>; nhãn khác không đụng. Giữ registry.keep bản mới nhất theo thời điểm cập nhật, cùng bản của commit đang ghim và bản của commit ghim liền trước (đọc từ lịch sử git của tờ khai báo) dù cũ đến đâu. Xóa phần còn lại. Mặc định chỉ in kế hoạch; --apply mới xóa. Kho chưa có thì bỏ qua. Thiếu DOCKERHUB_USERNAME hoặc DOCKERHUB_TOKEN thì không làm gì. Không in token. Workflow prune chạy thứ Hai hằng tuần với --apply; chạy tay thì mặc định chỉ in kế hoạch.
- rationale: S-023 mục 7: giữ kho gọn nhưng luôn lùi được về bản trước. Bản đang ghim và bản ghim liền trước là hai bản duy nhất chắc chắn cần cho quay lui, nên không bao giờ bị dọn theo tuổi.
- impacts: Chỉ lùi được về bản còn trong kho; bản đã dọn thì chưa build lại được bằng workflow (P-002). Cần lịch sử git đầy đủ của repo deploy (fetch-depth 0) để biết bản ghim liền trước. Token cần quyền xóa. Workflow này CHƯA chạy lần nào trên GitHub; mới có test với Docker Hub giả.
