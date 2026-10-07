---
module: quet-ban
---
# quet-ban - Spec (tầng 2)

Design được tách thành yêu cầu, contract, tiêu chí nghiệm thu và task. Khung tự sinh từ design; điền qua tool `spec_fill`.

## QUET-S-001: Quét bí mật trong bản trước khi đẩy lên kho công khai
- from: QUET-D-001
- derived_from: 6bae6393
- status: ready
- requirement:
  - scanText tìm token theo khuôn trong một đoạn chữ, trả loại và số dòng, không trả giá trị.
  - scanDir duyệt cây thư mục: báo tệp có tên nhạy cảm (.env trừ .example, .sample, .template, .dist; .pem, .key, .p12, .pfx, .jks; id_rsa và họ hàng), báo thư mục .git, và quét nội dung tệp chữ dưới 5 MB. Bỏ qua liên kết tượng trưng, thư mục thư viện ở mọi cấp, và thư mục hệ thống ở gốc (usr, lib, lib64, bin, sbin, etc, var, run, boot, media, mnt).
  - scanHistory quét đầu ra docker history: token theo khuôn, và ENV hoặc ARG có tên chứa SECRET, TOKEN, PASSWORD, PASSWD, API_KEY, PRIVATE_KEY mà mang giá trị khác rỗng.
  - Dòng lệnh: --dir bắt buộc; không thấy gì thì mã thoát 0; thấy thì in từng chỗ và mã thoát 1; thiếu --dir thì mã thoát 2.
  - Workflow coi việc bung ra 0 tệp là hỏng.
- contract:
  node ci/scan-image.js --dir <thư mục hệ tệp của bản> [--history <tệp chứa đầu ra docker history --no-trunc>].
  Mỗi phát hiện in một dòng "BÍ MẬT? <loại>: <tệp>[:<dòng>]". Không bao giờ in giá trị tìm thấy.
- acceptance:
  - Test trong ci/test/ci.test.js (token được ghép lúc chạy): bắt token Docker Hub kèm đúng dòng, khóa PEM, tệp .env, tệp khóa, thư mục .git; không báo .env.example; kết quả không chứa giá trị token; bỏ qua node_modules, site-packages và /etc; ENV/ARG tên như bí mật mang giá trị thì báo, tên thường hoặc giá trị rỗng thì không.
  - Đã chạy trên bản thật của hai dịch vụ ở máy và trong mọi lần đóng gói trên GitHub ngày 2026-10-07: không thấy gì trong các dạng được kiểm.
  - Chưa kiểm: một bản thật có chứa bí mật (chỉ có test với tệp giả).
- tasks:
