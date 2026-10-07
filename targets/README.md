# Đích từ xa

Mỗi tệp `<tên>.json` ở đây khai MỘT máy chạy hệ mà bảng điều khiển ở máy này điều khiển qua SSH:

```
node infra/bsn.js console --target=<tên>
```

Các tệp `.json` trong thư mục này KHÔNG vào git (tên máy và vùng là chuyện của từng nơi cài). Mẫu:

```json
{
  "transport": "gcloud-ssh",
  "configuration": "<tên cấu hình gcloud, bỏ dòng này nếu dùng cấu hình mặc định>",
  "instance": "<tên máy trên GCP>",
  "zone": "<vùng, ví dụ asia-southeast1-a>",
  "root": "/opt/bsn"
}
```

| Trường | Ý nghĩa |
|---|---|
| `transport` | Cách tới máy đích. Hiện chỉ có `gcloud-ssh` (lệnh `gcloud compute ssh`; máy đích không phải mở thêm cổng nào) |
| `configuration` | Cấu hình gcloud dùng để gọi (tài khoản, dự án) |
| `instance`, `zone` | Máy đích |
| `root` | Thư mục cài trên máy đích, do `server/setup.sh` tạo |

Điều kiện: máy này đã đăng nhập gcloud và SSH được vào máy đích; máy đích đã chuẩn bị bằng `server/setup.sh` và đã bật hệ một lần (`node infra/bsn.js up --pull --apply`).

Không ghi mật khẩu, token hay khóa vào các tệp này.
