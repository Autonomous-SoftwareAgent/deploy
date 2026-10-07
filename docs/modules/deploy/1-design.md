---
module: deploy
prefix: DEP
---
# deploy - Design (tầng 1)

Vì sao và cái gì: quyết định nghiệp vụ và kỹ thuật của module. Chỉ ghi qua tool `design_record` / `design_update`.

## DEP-D-001: Deploy và rollback một dịch vụ: bản đã khai, kiểm sức khỏe, tự bật lại bản trước
- date: 2026-10-07
- status: accepted
- decision: Lệnh deploy <dịch-vụ> đưa commit đang được ghim của MỘT dịch vụ lên: từ chối khi commit đó chưa có bản trên Docker Hub; kéo bản và kiểm commit ghi bên trong (ảnh có sẵn ở máy cũng phải đúng commit); bật đúng dịch vụ đó mà không đụng dịch vụ khác; gọi đường kiểm sức khỏe do dịch vụ khai, tối đa 120 giây (biến BSN_HEALTH_SECONDS). Không bật được hoặc không khỏe: tự bật lại bản đang chạy trước đó, thoát mã 1, và KHÔNG sửa tờ khai báo. Lệnh rollback <dịch-vụ> [commit] lùi về bản liền trước, hoặc về một commit đã từng chạy khỏe trên đích này; commit chưa từng chạy khỏe ở đây thì từ chối; lùi xong thì ghi commit đó vào tờ khai báo. Mỗi đích giữ một sổ deploy (bản đang chạy, bản liền trước, 50 lần gần nhất kèm ai, lúc nào, kết quả, lý do), tách khỏi tờ khai báo: tờ khai báo là điều dịch vụ muốn, sổ là điều đang chạy. Cả hai lệnh mặc định chỉ in kế hoạch và nhận --json. Hai workflow chạy tay deploy và rollback gọi đúng hai lệnh này. Đích hiện tại là hệ local.
- rationale: S-023 mục 8 (người dùng chốt): có nút deploy và rollback, bản hỏng thì tự quay về bản trước, rollback về bản đã từng chạy có lối đi riêng (bài học đã ghi ở S-023: cổng chất lượng cản đường rollback thì sẽ bị tắt hẳn). S-029: chỉ deploy commit đã có bản. Làm với đích local trước để phần logic được thử thật trước khi tốn tiền cho máy chủ. Không sửa tờ khai báo khi deploy hỏng để chỗ lệch giữa điều muốn và điều đang chạy hiện rõ trong status, thay vì bị che đi.
- impacts: Chỉ đổi bản chương trình; dữ liệu trong cơ sở dữ liệu không lùi theo, nên đổi cấu trúc bảng phải theo kiểu thêm vào (S-017). Sau rollback phải commit và đẩy repo deploy để tờ khai báo trên GitHub khớp. Với đích là máy chủ còn thiếu: kiểm sức khỏe qua mạng, cấu hình và bí mật production (hiện lấy tệp cấu hình và build đồ giả lập từ repo dịch vụ ở máy), sổ deploy đặt trên máy chủ, status không cần repo dịch vụ. Hai workflow cần runner trên máy quản trị nên chưa chạy được.
