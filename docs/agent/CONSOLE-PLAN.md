# Bảng điều khiển theo bản design: kế hoạch và tiến độ

Người dùng giao ngày 2026-10-08: "làm toàn bộ cho bản design này, cần thì quyết định lại". Tệp này là nơi DUY NHẤT ghi phạm vi, các quyết định đã lấy và việc nào xong, để phiên sau nối tiếp. Đọc nó trước khi sửa lớp `src/interfaces/web` hay thêm đường `/api/v1`.

## Nguồn
- Trang mẫu của người dùng: [../../design/deploy-console.prototype.html](../../design/deploy-console.prototype.html). Nó chạy trên một bộ khung riêng (`support.js`, thẻ `sc-if`, `sc-for`) và dùng DỮ LIỆU GIẢ; chỉ lấy bố cục, màu, chữ, tên màn và hành vi.
- Yêu cầu API của người dùng: [../../design/deploy-console.api.md](../../design/deploy-console.api.md).
- Thư mục `screen/` (chưa vào git, của người dùng): hai tệp nén là bản xuất của trang mẫu kèm bộ khung của nó; không dùng.

## Quyết định đã lấy (người dùng ủy quyền quyết lại khi cần)
1. **Môi trường là một ĐÍCH** (một máy chạy hệ): máy này (`local`) và mỗi tệp `targets/<tên>.json`. Danh sách môi trường là dữ liệu, không viết cứng tên nào. Màu và thứ tự là dữ liệu cấu hình của bảng điều khiển.
2. **Giữ luật "chỉ deploy commit đã có bản đóng gói" (S-029, D-010).** Chọn commit bất kỳ trong hộp thoại được, nhưng commit chưa có bản trên kho thì bị chặn với mã `BUILD_NOT_READY` (bản do CI đóng khi commit đó được khai trong tờ khai báo). Bảng điều khiển KHÔNG tự build.
3. **Tiến trình hiện các bước THẬT của hệ**: lấy bản, bật bản mới, kiểm sức khỏe, ghi sổ. Build và test là trạng thái của commit (đã có bản hay chưa), không giả làm bước chạy trong bảng điều khiển.
4. **Không có số giả trên trang thật.** Mục chưa có nguồn (biểu đồ lỗi và độ trễ, log runtime, biến môi trường) hiện "chưa có nguồn dữ liệu" cho tới đợt D.
5. **Viết lại bằng module thuần** như mã hiện có: không thư viện, không bước build, không mã chèn thẳng trong HTML. Phông chữ không tải từ ngoài (dùng phông hệ thống; nếu đặt IBM Plex vào repo thì ghi rõ giấy phép).
6. **"Bản đã khai" đóng vai HEAD** của nhánh ánh xạ cho tới đợt C: "còn N commit chưa deploy" là số commit giữa bản đang chạy ở môi trường và commit đang khai trong tờ khai báo.
7. **Chế độ tự deploy khi có push** (`auto`, `pattern`) đụng S-029: để tới đợt C và hỏi lại người dùng trước khi bật.
8. Mọi thứ đi qua bốn lớp như cũ: luật ở `domain`, ca sử dụng ở `application`, bộ nối ở `infrastructure` (kèm bộ nối trong bộ nhớ và test hợp đồng), đường gọi và giao diện ở `interfaces`.

## Các đợt
Mỗi đợt xong thì cập nhật ô dưới đây, README và STATUS.

### Đợt A: khung giao diện mới trên dữ liệu thật
- [ ] A1. Luật và ca sử dụng: danh sách môi trường; một bảng điều khiển nhìn nhiều môi trường. ĐÃ XONG phần cổng (2026-10-08): `Source.log`, `Registry.tags`, trường `project` trong tờ khai báo, dữ liệu mẫu trong bộ nhớ có lịch sử commit.
- [x] A2. `deploy <dịch-vụ> [commit]`: deploy đúng commit được chọn (phải có bản), không sửa tờ khai báo. CÒN: đích từ xa nhận cùng tham số (`remote-target.js` hiện chỉ cho commit với rollback).
- [ ] A3. Kiểm tra trước (preflight): từ bản nào sang bản nào, các commit ở giữa và hướng, mã chặn `ALREADY_RUNNING`, `BUILD_NOT_READY`, `NOTHING_TO_ROLLBACK`, `ROLLBACK_TARGET_NEWER`, `RUN_IN_PROGRESS`; cảnh báo `DEPLOY_OLDER_COMMIT`.
- [ ] A4. Lần chạy (run) gồm nhiều mục, mỗi mục một dịch vụ, chạy độc lập; bước và log đến dần. ĐÃ XONG phần lệnh (2026-10-08): `--json --events` in từng dòng `{event:"step",step,status,phase}` và `{event:"log",text}`; các bước là `fetch`, `start`, `health`, `record` (hằng `STEPS` trong `switch-version.js`), pha `forward` hoặc `revert`. CÒN: bộ chạy việc (tiến trình con, đích từ xa, gọi thẳng) đọc dần các dòng đó; ca sử dụng run.
- [ ] A5. Đường `/api/v1`: `overview`, `services/{id}`, `services/{id}/environments`, `services/{id}/commits`, `services/{id}/deployments`, `services/{id}/diff`, `deployments/preflight`, `deployments`, `runs`, `runs/{id}`, `runs/{id}/cancel`. Đường `/api` cũ giữ nguyên.
- [ ] A6. Giao diện: thanh bên, Tổng quan, Chi tiết dịch vụ (tab Deployments, Commits; các tab chưa có nguồn ghi rõ), hộp thoại Deploy và Rollback, Tiến trình.
- [ ] A7. Đăng nhập bằng hộp thoại của trình duyệt (HTTP Basic) thay trang đăng nhập; agent vẫn dùng token.

### Đợt B: an toàn
Người dùng và vai trò, phân quyền theo môi trường, gõ tên xác nhận, phê duyệt, khóa theo khung giờ, nhật ký kiểm toán (`/audit`).

### Đợt C: cấu hình
Môi trường (tạo, sửa, xóa, sắp thứ tự, màu, mức bảo vệ), ma trận nhánh, quy tắc nhánh và trình thử, phiên bản cấu hình, xem trước tác động, import và export, tự deploy (sau khi người dùng quyết về S-029).

### Đợt D: quan sát và tiện ích
Biểu đồ trước và sau deploy, log runtime, biến môi trường, môi trường tạm, gõ lệnh nhanh, cập nhật trực tiếp (SSE).

## Điều chưa có nguồn, phải nói thật trên trang và trong tài liệu
- Số đo lỗi và độ trễ: chưa có hệ giám sát nào.
- Trạng thái `degraded`: chưa có nguồn; hiện chỉ có khỏe, đang đưa lên, hỏng, chưa deploy.
- Người viết commit và nhánh: lấy từ repo của dịch vụ ở máy chạy bảng điều khiển; máy đó không có repo thì không có danh sách commit.
- Đăng nhập một lần của công ty, webhook từ Git: không có; bảng điều khiển chỉ nghe ở `127.0.0.1`.
