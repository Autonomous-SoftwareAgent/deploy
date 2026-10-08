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
- [x] A1. Nhiều môi trường trong một bảng điều khiển: `local` cùng mọi `targets/<tên>.json` (`application/environment.js`, `composition.assembleFleet`); danh mục dịch vụ dùng chung (`application/catalog.js`: tờ khai báo, `Source.log`, `Registry.tags`); trường `project` trong tờ khai báo. Đã chạy thật 2026-10-08 với hai môi trường thật (máy làm việc và máy GCP `gcp-thu`): tổng quan trả đúng bản đang chạy ở cả hai; lần hỏi đầu tới máy GCP mất 24 giây (gcloud tìm địa chỉ), các lần sau nhanh.
- [x] A2. `deploy <dịch-vụ> [commit]`: deploy đúng commit được chọn (phải có bản), không sửa tờ khai báo. CÒN: đích từ xa nhận cùng tham số (`remote-target.js` hiện chỉ cho commit với rollback).
- [x] A3. Kiểm tra trước: `domain/fleet.js` (`preflightItem`, các mã `BLOCK` và `WARN`), `application/fleet.js` (`preflight`). Mã chặn có thật: `ENV_UNREACHABLE`, `NOT_IN_ENVIRONMENT`, `COMMIT_UNKNOWN`, `ALREADY_RUNNING`, `BUILD_NOT_READY`, `NOTHING_TO_ROLLBACK`, `ROLLBACK_TARGET_NEWER`, `NEVER_RAN_HERE`, `RUN_IN_PROGRESS`. Chưa có (đợt B, D): quyền, khung giờ khóa, migration, dịch vụ phụ thuộc.
- [x] A4. Lần chạy nhiều mục: `domain/run.js`, `application/runs.js`; tất cả hoặc không ở bước nhận, từng mục độc lập khi chạy; bước `fetch`, `start`, `health`, `record` và log đến dần từ cả ba bộ chạy việc. KHÔNG hủy được lần chạy đã bắt đầu (`NOT_CANCELLABLE`): cắt ngang một lần chuyển bản là không an toàn; tự bật lại bản cũ luôn bật, không tắt được. CÒN: máy đích từ xa phải có bản lệnh mới (nhận `deploy <dịch-vụ> <commit>` và `--events`).
- [x] A5. Đường `/api/v1` đã có: `overview`, `environments`, `services/{id}` (gồm môi trường, commit, dòng thời gian deploy), `deployments/preflight`, `deployments`, `runs`, `runs/{id}`, `runs/{id}/logs?after=`, `runs/{id}/cancel` (luôn từ chối). Test: `test/fleet.test.js`. CHƯA có: `services/{id}/diff` theo tệp (chỉ có danh sách commit giữa hai bản trong kết quả kiểm tra trước), SSE (trang hỏi định kỳ). Đường `/api` cũ giữ nguyên.
- [x] A6. Giao diện viết lại theo bản design (2026-10-08): `src/interfaces/web/` gồm `dom.js` (dựng phần tử, chữ chỉ qua textContent, kiểu dáng động qua CSSOM), `api.js`, `store.js` (trạng thái và thao tác), `main.js`, `views/{shell,overview,service,dialog,run}.js`; `styles.css` chép nguyên khối kiểu dáng của trang mẫu cộng vài lớp riêng. Đã mở bằng Edge chạy ngầm ở chế độ `--memory`: đăng nhập, Tổng quan, chọn hai dịch vụ rồi Deploy một lượt, Tiến trình (một bản lên, một bản hỏng tự lùi), Chi tiết dịch vụ (Deployments, Commits), hộp thoại Rollback; không lỗi JavaScript. Tab Logs, Biến môi trường và phần ánh xạ nhánh ghi rõ "chưa có nguồn dữ liệu". CHƯA có: ngăn so sánh commit theo tệp; mục Cấu hình ở thanh bên (đợt C); trang hỏi định kỳ mỗi 5 giây thay cho SSE; giao diện chưa có test tự động (kịch bản trình duyệt nằm ngoài repo).
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
