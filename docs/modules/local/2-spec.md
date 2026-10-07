---
module: local
---
# local - Spec (tầng 2)

Design được tách thành yêu cầu, contract, tiêu chí nghiệm thu và task. Khung tự sinh từ design; điền qua tool `spec_fill`.

## LOCL-S-001: Tầng dùng chung ở local: một PostgreSQL, một broker, một mạng
- from: LOCL-D-001
- derived_from: d77a6d7b
- status: ready
- requirement:
  - local/docker-compose.yml khai dự án bsn-local gồm PostgreSQL và broker Redpanda, có kiểm sức khỏe, trên mạng bsn-local; mọi ảnh có nhãn phiên bản, không latest.
  - Cổng chỉ nối ra 127.0.0.1: PostgreSQL 55440, broker 19192.
  - Lệnh up tạo cơ sở dữ liệu của từng dịch vụ khi thiếu (hỏi pg_database trước) và tạo topic còn thiếu với 3 phân vùng.
  - Dịch vụ nhận địa chỉ cơ sở dữ liệu theo khuôn nó khai (urlFormat) với máy postgres cổng 5432, và địa chỉ broker redpanda:9092 khi nó khai bootstrapEnv.
  - Mật khẩu PostgreSQL local và mọi biến bí mật local sinh ngẫu nhiên một lần vào local/.run/secrets.env, giữ nguyên các lần sau, không nằm trong tờ khai báo.
- contract:
  Trong mạng chung: postgres:5432 (người dùng bsn), redpanda:9092, mỗi dịch vụ theo tên của nó và các tên phụ nó khai.
  Trên máy: 127.0.0.1:55440 (PostgreSQL), 127.0.0.1:19192 (broker), dịch vụ từ 8000, đồ giả lập từ 8100.
  Biến bí mật của tầng chung: BSN_PG_PASSWORD (chỉ tên; giá trị sinh ở máy).
- acceptance:
  - Test trong test/bsn.test.js: tầng dùng chung không dùng latest và ảnh nào cũng ghim phiên bản; bí mật local sinh một lần, giữ nguyên lần sau, không nằm trong tờ khai báo; compose của dịch vụ nhận đúng địa chỉ cơ sở dữ liệu và broker; kế hoạch của up nêu việc tạo cơ sở dữ liệu.
  - Đã chạy thật ở máy: hai dịch vụ cùng dùng PostgreSQL và broker chung, đều báo khỏe; sự kiện của một dịch vụ có trong topic của broker chung (README.md mục "Đã kiểm").
  - Chưa kiểm: bộ test Kafka của một dịch vụ (tạm dừng broker) chưa chạy với Redpanda.
- tasks:
