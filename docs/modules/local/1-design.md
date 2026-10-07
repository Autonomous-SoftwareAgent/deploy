---
module: local
prefix: LOCL
---
# local - Design (tầng 1)

Vì sao và cái gì: quyết định nghiệp vụ và kỹ thuật của module. Chỉ ghi qua tool `design_record` / `design_update`.

## LOCL-D-001: Tầng dùng chung ở local: một PostgreSQL, một broker, một mạng
- date: 2026-10-07
- status: accepted
- decision: local/docker-compose.yml dựng một PostgreSQL 17 (mỗi dịch vụ một cơ sở dữ liệu, do lệnh up tạo khi thiếu), một broker Redpanda 25.1.7 nói giao thức Kafka, và mạng bsn-local. Mọi ảnh ghim phiên bản, không dùng latest. Cổng chỉ mở trên 127.0.0.1: PostgreSQL 55440, broker 19192; dịch vụ lấy cổng từ 8000, đồ giả lập từ 8100, theo tờ khai báo. Dịch vụ gọi nhau qua mạng chung bằng tên, không qua cổng trên máy. Nền chạy dịch vụ từ ảnh đã ghim và cấp địa chỉ cơ sở dữ liệu, broker và mật khẩu local qua biến môi trường, nên không phải sửa compose của dịch vụ.
- rationale: S-017 mục 5 và S-018: mỗi dịch vụ một cổng trên máy để chạy cùng lúc, và một tầng chung để các dịch vụ nối được với nhau. Redpanda vì một dịch vụ đã chạy với đúng bản này và dịch vụ kia đã thử gửi thành công với nó.
- impacts: Một tài khoản PostgreSQL cho mọi dịch vụ ở local; production phải tách. Container ở local chạy không có các rào cứng (chỉ đọc, bỏ capability). Broker production chưa chọn. Đây là môi trường thử, không phải khuôn của máy chạy thật.
