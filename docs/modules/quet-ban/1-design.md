---
module: quet-ban
prefix: QUET
---
# quet-ban - Design (tầng 1)

Vì sao và cái gì: quyết định nghiệp vụ và kỹ thuật của module. Chỉ ghi qua tool `design_record` / `design_update`.

## QUET-D-001: Quét bí mật trong bản trước khi đẩy lên kho công khai
- date: 2026-10-07
- status: accepted
- decision: Sau khi build và trước khi đẩy, workflow bung hệ tệp của bản ra một thư mục và lấy đầu ra docker history, rồi ci/scan-image.js quét. Nó báo: token có khuôn rõ (khóa riêng PEM, Docker Hub, GitHub, AWS, Google, Slack); tệp .env (trừ tệp mẫu), tệp khóa (.pem, .key, .p12, .pfx, .jks), khóa SSH; thư mục .git; biến ENV hoặc ARG tên như bí mật mà mang giá trị. Bỏ qua thư mục thư viện (node_modules, site-packages...) và thư mục hệ thống ở gốc ảnh nền. Tệp nhị phân và tệp trên 5 MB không quét nội dung. Thấy gì thì thoát mã 1 và workflow không đẩy. Kết quả chỉ nêu loại, tệp và dòng, không in giá trị. Bung ra được 0 tệp thì coi là hỏng, không coi là sạch.
- rationale: S-023: kho Docker Hub công khai, bí mật lọt vào một bản là lộ hẳn. Tự viết để không thêm action của bên thứ ba và để chạy được bằng Node có sẵn (D-004). Bỏ qua thư mục thư viện và hệ thống vì chúng chứa khóa mẫu và chứng chỉ công khai, sẽ báo giả liên tục.
- impacts: Qua được bước này KHÔNG chứng minh bản sạch (P-003): bí mật dạng khác, hay nằm trong thư mục bị bỏ qua, không bị bắt. Lớp chặn chính vẫn là .dockerignore và Dockerfile của dịch vụ. Chưa có quét lỗ hổng, chưa ký bản.
