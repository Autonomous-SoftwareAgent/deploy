# Lộ trình của phần deploy

Tệp này ghi việc CÒN LẠI của nền deploy và vận hành, theo chặng, để phiên sau nối tiếp được. Việc đã làm và kết quả kiểm nằm ở [README.md](README.md) mục "Đã kiểm và chưa kiểm". Quyết định được nhắc (S-0xx) nằm ở `docs/system/decisions.md` của repo harness.

Đích: một nền deploy và vận hành dùng chung cho mọi dịch vụ, do agent vận hành là chính. Hai dịch vụ hiện có chỉ là vật thử. Thước đo cuối: thêm một dịch vụ thứ ba mà không sửa mã của repo này.

## Đã xong

| Chặng | Nội dung | Quyết định |
|---|---|---|
| 0 | Chạy cả hệ ở local từ commit được ghim | S-017, S-018 |
| 1 | Dự án GCP `ai-sdlc-bsn`, gắn thanh toán, cảnh báo ngân sách | S-020 |
| 2 | Tờ khai báo theo dịch vụ, lệnh điều khiển, workflow dùng chung, quét bí mật, dọn bản cũ | S-023 |
| 3 | Các repo công khai trong tổ chức `Autonomous-SoftwareAgent`; tách repo deploy và repo harness | S-026, S-028 |
| 4 | Dịch vụ có bản trên Docker Hub; khai báo trước, build sau; dùng lại lớp khi build; `up --pull` | S-029 |
| 5 | Lệnh `deploy` và `rollback`: từ chối commit chưa có bản, kiểm sức khỏe, tự bật lại bản trước, sổ deploy, `--json`, khóa theo dịch vụ; đã thử thật trên hệ local và trên một máy thử GCP, kể cả với bản cố ý làm hỏng | S-023 mục 8 |
| 5b | Mã chuyển sang bốn lớp có test giữ ranh giới; bảng điều khiển web (đăng nhập, trạng thái, Deploy, Rollback) thay cho nút bấm trên GitHub; đã thử trình duyệt thật ở chế độ bộ nhớ và hệ local thật qua đường gọi JSON | D-007 |

## Bước kế tiếp: đóng gói bảng điều khiển (chưa làm)

Người dùng đã chốt hướng ngày 2026-10-07: DevOps và agent deploy từ bảng điều khiển của repo này; GitHub chỉ còn lo test và đóng gói. Hai workflow `deploy.yml`, `rollback.yml` đã bị xóa và không cài runner tự chạy.

- `Dockerfile` cho bảng điều khiển; workflow test rồi đẩy bản lên Docker Hub theo đúng luật "khai báo trước, build sau" (commit của bảng điều khiển cũng phải được khai mới đóng gói).
- Lệnh cập nhật bảng điều khiển trên máy chủ, có đường lùi; không cho cập nhật khi đang có lần đưa lên chạy dở.
- Dịch vụ gọi workflow dùng chung theo NHÃN PHIÊN BẢN (ví dụ `@v1`) thay vì `@main`: hiện một lần đẩy lỗi vào repo này làm hỏng việc đóng gói của mọi dịch vụ. Dịch vụ sửa một dòng; gửi yêu cầu qua `docs/handoff/` của repo harness.
- Workflow của repo này chỉ chạy phần liên quan: dịch vụ khai commit mới thì không đóng gói lại bảng điều khiển.
- Thước đo xong: bản đóng gói của bảng điều khiển chạy được ở máy làm việc và trên máy thử; sửa một dòng mã của nó không làm workflow của dịch vụ nào chạy lại.

Việc còn phải làm để deploy dùng được cho MÁY CHẠY THẬT (xếp vào chặng 6 và phần "sẵn sàng chạy thật"):

- **Hai máy tách nhau: đã có bước đầu (D-009, 2026-10-07).** `console --target=<tên>` cho bảng điều khiển ở một máy ra lệnh cho máy chạy hệ qua SSH; máy đích tự chạy lệnh tại chỗ. Đã thử thật với máy làm việc đóng vai máy quản trị và một máy GCP. Còn lại: dựng máy quản trị riêng trên cloud (khi đó bảng điều khiển chạy ở đó và người vận hành vào qua đường hầm SSH), và đường SSH giữa hai máy trong mạng nội bộ thay vì qua `gcloud`.
- **Tệp cấu hình (`files`) và đồ giả lập (`sidecars`):** đang lấy từ repo dịch vụ ở máy bằng `git archive`. Máy chạy thật không nên có repo dịch vụ; đồ giả lập không thuộc production; cấu hình và bí mật thật phải nằm sẵn trên máy chạy thật.
- **Sổ deploy:** ở `local/.run/` của bản cài trên máy chạy lệnh. Chưa có sao lưu: mất thư mục này là mất lịch sử và mật khẩu.
- **Thời gian chờ khỏe:** trên máy 2 GB một dịch vụ Python cần hơn 25 giây mới trả lời; mặc định 120 giây là đủ, chưa có cách khai riêng cho từng dịch vụ.
- **Người duyệt trước khi lên máy chạy thật:** chưa có; sẽ là một trạng thái của việc trong bảng điều khiển.
- **Rollback qua bảng điều khiển chưa tự đẩy tờ khai báo lên GitHub:** cần một khóa ghi nằm trên máy quản trị, do người dùng tự nhập.
- **Bảng điều khiển đọc trạng thái bằng lệnh docker đồng bộ:** cần chuyển bộ nối sang không chặn trước khi nhiều người dùng cùng lúc.

## Chặng 6: hai máy trên GCP (chưa làm, CÓ tốn tiền: mỗi thứ phải hỏi người dùng trước)

Thiết kế đã chốt ở S-017 và S-023:

- **Máy quản trị:** giữ khóa vào máy chạy thật, chạy BẢNG ĐIỀU KHIỂN và lệnh deploy, không mở cổng nào ra internet; người vận hành vào giao diện qua đường hầm SSH. Không cài runner của GitHub (D-007).
- **Máy chạy thật:** docker compose; chỉ mở 80 và 443; chỉ máy quản trị vào được qua mạng nội bộ. Một cửa vào lo TLS và chia đường tới từng dịch vụ theo `cloud.route` trong tờ khai báo. Bí mật chỉ nằm trên máy này. Kéo bản bằng một token Docker Hub chỉ đọc.
- Lên máy chạy thật phải có người duyệt (environment `production` của GitHub); môi trường thử thì tự lên theo tờ khai báo.
- Thước đo xong: deploy cả hai dịch vụ bằng nút, rồi rollback một dịch vụ, trên máy thật.

Câu còn chờ người dùng trước khi làm chặng này:

1. Cỡ hai VM và chi phí mỗi tháng (phiên infra đưa đề xuất kèm giá thật trước khi tạo).
2. Tên miền (cần cho TLS và cho cổng thanh toán gọi về); trước khi có thì thử bằng địa chỉ IP.
3. Đường vào chia theo đường dẫn hay theo tên miền con.
4. Broker ở production (local dùng Redpanda 25.1.7).
5. PostgreSQL chạy trên VM hay dùng dịch vụ quản lý; tách tài khoản theo dịch vụ.

Chưa kiểm: gói Free của tổ chức GitHub có cho giới hạn runner theo repo và có luật bảo vệ nhánh nào.

## Chặng 7: vận hành (chưa làm)

- Sao lưu PostgreSQL ra ngoài VM, và KHÔI PHỤC THỬ; ghi thời gian khôi phục và lượng dữ liệu chấp nhận mất (lùi mã không khôi phục được dữ liệu).
- Lệnh xem nhật ký và trạng thái của dịch vụ trên máy thật; cảnh báo có người nhận khi dịch vụ không khỏe hay đĩa sắp đầy.
- Tách tài khoản PostgreSQL theo dịch vụ; container chạy chỉ đọc và bỏ capability ở nơi chương trình cho phép.
- Thước đo xong: cố ý làm hỏng một bản và thấy cảnh báo; khôi phục được cơ sở dữ liệu từ bản sao lưu trên một máy sạch.

## Chặng 8: dịch vụ thứ ba (thước đo của cả nền)

Thêm một dịch vụ nhỏ chỉ bằng: tạo repo `svc-<tên>` với `bsn.ci.json` và workflow gọi workflow dùng chung, thêm tờ `services/<tên>.json`, nhập bí mật của nó. Nếu phải sửa mã hay workflow của repo này mới thêm được thì nền chưa đạt.

## Việc lẻ đã biết, chưa xếp chặng

- Build lại một commit cũ mà bản đã bị dọn, và build một commit không nằm ở đầu nhánh: workflow `service-pin` và `service-image` đã đóng gói theo commit đã khai (2026-10-08); còn phải chạy thật trên GitHub với một commit nằm dưới đầu nhánh.
- Việc nhỏ của CI còn lại: dịch vụ gọi workflow dùng chung theo nhánh `main` (xem mục nhãn phiên bản ở trên); nền chưa kiểm được dịch vụ có khai `needs` trước job `image`; workflow `pins` còn theo dõi tệp `lib.js` đã xóa và chưa theo dõi `src/`; sau khi gộp lịch sử, bộ dọn bản không còn biết bản ghim liền trước; hai lần chạy cùng lúc cho một commit có thể cùng đẩy một nhãn; ảnh nền của dịch vụ nên ghim mã băm và phiên bản PostgreSQL trong test của dịch vụ nên khớp tầng dùng chung (việc của từng dịch vụ).
- Đóng gói cho nhánh khác `main` (`bsn.ci.json` đã có trường `buildBranches`, hiện chỉ nhận `main`).
- Ký bản đóng gói và quét lỗ hổng.
- Luật bảo vệ nhánh `main`; khi có thêm người: `CODEOWNERS` gán `services/<dịch-vụ>.json` cho nhóm của dịch vụ đó.
- Đo bước dùng lại lớp với một commit sửa mã thật.
- Workflow `prune` chưa chạy lần nào trên GitHub.
- Công cụ tạo dịch vụ mới (repo harness) chưa đặt danh tính commit ẩn danh và chưa tạo sẵn `bsn.ci.json`, workflow, tờ khai báo.
- Trang tổng quan "dịch vụ nào đang chạy bản nào" kiểu Vercel: để sau khi nút bấm đã chạy ổn; nó gọi cùng các lệnh.

## Việc tạm dừng, chờ infra có VM riêng (người dùng chốt 2026-10-08)
- **Tự deploy khi có push** (chế độ `auto` của ánh xạ nhánh): bảng điều khiển chỉ nghe ở `127.0.0.1` nên chưa nhận được tin từ GitHub; và cần người dùng nới S-029 cho trường hợp này. Hiện ánh xạ nhánh chỉ là khai báo.
- **Sao lưu DB của bảng điều khiển** (`local/.run/console.db`) ra ngoài máy theo lịch; hiện sao lưu là chép tệp bằng tay.
- **Hạn mức cho việc tạo máy từ trang** (số máy, tiền): hiện ai là Admin hay DevOps đều tạo được.
- Kiểm trên máy thật sau lần đẩy kế tiếp: máy vừa tạo từ trang hiện "Not deployed" (lệnh `status` mới), và deploy một dịch vụ vào máy đó.

