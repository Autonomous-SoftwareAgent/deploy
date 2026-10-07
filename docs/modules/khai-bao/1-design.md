---
module: khai-bao
prefix: KHAI
---
# khai-bao - Design (tầng 1)

Vì sao và cái gì: quyết định nghiệp vụ và kỹ thuật của module. Chỉ ghi qua tool `design_record` / `design_update`.

## KHAI-D-001: Mỗi dịch vụ một tờ khai báo do chính nó ghi; nền chỉ đọc và kiểm
- date: 2026-10-07
- status: accepted
- decision: Mọi điều nền cần biết về một dịch vụ nằm trong MỘT tệp services/<dịch-vụ>.json, tên tệp là tên dịch vụ: commit muốn chạy (40 ký tự hoặc null), tầng Dockerfile, cổng local và cổng trong container, đường kiểm sức khỏe, biến môi trường thường, TÊN các biến bí mật, cơ sở dữ liệu, broker, topic, tệp cấu hình lấy từ commit, tên phụ trong mạng, đồ giả lập đi kèm, đường vào trên cloud. Cấu hình chung của nền (tổ chức GitHub, tài khoản Docker Hub, tiền tố tên kho, nhánh được đóng gói, số bản giữ lại) nằm ở platform.json. Lệnh pin chỉ ghi tờ của đúng một dịch vụ. Lệnh check từ chối: cổng local trùng nhau hoặc dưới 8000, commit không đủ 40 ký tự, nhãn latest ở bất kỳ đâu, đường dẫn repo thoát ra ngoài thư mục làm việc, tên biến sai dạng, platform.json thiếu tài khoản Docker Hub hoặc khai nhánh khác main.
- rationale: Người dùng chốt (S-023): quyền nói "tôi muốn chạy commit nào" thuộc về từng dịch vụ, và nền không được biết tên dịch vụ nào. Mỗi dịch vụ một tệp thì nhiều phiên cùng khai không đè nhau, và lịch sử git của tệp là lịch sử các lần khai của dịch vụ đó. JSON vì nền không dùng thư viện ngoài (D-001). Bí mật không bao giờ nằm trong tờ khai báo: chỉ tên biến.
- impacts: Thêm dịch vụ mới là thêm một tệp, không sửa mã. Dịch vụ không ghi tờ của dịch vụ khác (hook guard-scope của harness hỏi người dùng khi vi phạm; trên GitHub chưa có CODEOWNERS). Harness đọc thư mục services/ để dựng bản đồ cả hệ. Trên máy không có repo dịch vụ (máy của GitHub), check và images bỏ phần kiểm repo và nói rõ đã bỏ (D-002).
