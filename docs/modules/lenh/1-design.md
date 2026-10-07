---
module: lenh
prefix: LENH
---
# lenh - Design (tầng 1)

Vì sao và cái gì: quyết định nghiệp vụ và kỹ thuật của module. Chỉ ghi qua tool `design_record` / `design_update`.

## LENH-D-001: Lệnh điều khiển chạy cả hệ ở local từ commit được ghim
- date: 2026-10-07
- status: accepted
- decision: Một lệnh duy nhất node infra/bsn.js với các lệnh con check, status, images, pin, build, up, down. Ảnh chỉ được build từ commit ghi trong tờ khai báo: lệnh trích đúng commit đó ra thư mục tạm bằng git archive (tắt đổi dấu xuống dòng) rồi build; không bao giờ đọc thư mục làm việc. Nhãn ảnh cục bộ là bsn-<dịch-vụ>:<12 ký tự commit>. Lệnh up bật tầng dùng chung, tạo cơ sở dữ liệu và topic từng dịch vụ khai, lấy ảnh (build tại chỗ, hoặc với --pull thì kéo bản CI rồi kiểm commit ghi bên trong bản), chạy dịch vụ trên mạng chung với cổng 127.0.0.1 theo tờ khai báo, rồi chờ đường kiểm sức khỏe. Lệnh làm thay đổi (pin, build, up, down) mặc định chỉ in kế hoạch; --apply mới chạy. Lệnh chỉ đọc (check, status, images) nhận --json và khi đó in đúng một đối tượng JSON.
- rationale: S-017: build và chạy chỉ lấy từ commit được ghim, để phiên đang sửa dở một dịch vụ không phải dừng và phần chưa commit không lọt vào ảnh. S-023 mục 9: người vận hành chính là agent, nên mọi thao tác gọi được bằng lệnh và kết quả đọc được bằng máy. Mặc định chỉ in kế hoạch để một lệnh gõ nhầm không đổi gì.
- impacts: Mật khẩu local sinh ngẫu nhiên vào local/.run/ (không commit). Tệp cấu hình khai ở files luôn lấy từ commit được ghim; đổi bản ghim thì phải trích lại (có dấu commit đi kèm). Đồ giả lập đi kèm không lên Docker Hub nên luôn build tại chỗ. Bản CI mà commit ghi bên trong khác commit được ghim thì bị từ chối. Chưa có lệnh deploy và rollback cho máy chủ.
