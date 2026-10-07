---
module: deploy
---
# deploy - Spec (tầng 2)

Design được tách thành yêu cầu, contract, tiêu chí nghiệm thu và task. Khung tự sinh từ design; điền qua tool `spec_fill`.

## DEP-S-001: Deploy và rollback một dịch vụ: bản đã khai, kiểm sức khỏe, tự bật lại bản trước
- from: DEP-D-001
- derived_from: 5752e85e
- status: ready
- requirement:
  - deploy: dịch vụ chưa ghim thì lỗi. Đọc commit đang chạy từ nhãn bsn.commit của container. Không --apply: in kế hoạch, không gọi lệnh làm thay đổi, không ghi sổ. Có --apply: bản của commit được ghim chưa có trên Docker Hub thì từ chối với lý do CHỜ BUILD, không đổi gì và không ghi sổ; commit đang chạy trùng commit được ghim thì không đổi gì; còn lại thì chuẩn bị tầng dùng chung rồi chuyển bản.
  - Chuyển bản (bringUp): ảnh chính chưa có ở máy thì kéo bản và kiểm commit bên trong; ảnh có ở máy mà commit bên trong khác thì ném lỗi; build đồ giả lập còn thiếu và trích lại tệp cấu hình khi dấu commit khác; ghi compose chỉ gồm dịch vụ đó và bật KHÔNG kèm --remove-orphans; chờ khỏe.
  - Hỏng ở bất kỳ bước nào của chuyển bản: ghi sổ lần hỏng kèm lý do; có bản đang chạy trước đó thì bật lại nó và ghi sổ auto-revert (ok hoặc failed); không có thì nói rõ không có gì để bật lại. Mã thoát 1. Tờ khai báo không bị sửa.
  - rollback: không nêu commit thì lấy bản liền trước trong sổ, sổ chưa có thì lỗi; nêu commit (đủ 40 ký tự hoặc tiền tố từ 7 ký tự, tìm trong sổ) thì dùng commit đó. Commit chưa có lần chạy khỏe nào trong sổ thì từ chối. Ảnh không còn ở máy và bản không còn trên Docker Hub thì từ chối với lý do đã bị dọn. Chuyển bản như deploy; thành công thì ghi commit vào tờ khai báo của dịch vụ và nhắc commit, đẩy repo deploy.
  - Sổ: record thêm một dòng, giữ 50 dòng mới nhất; lần thành công với commit khác bản đang chạy thì bản đang chạy thành bản liền trước. Lệnh up cũng ghi một dòng khi dịch vụ khỏe.
  - status: in thêm bản đang chạy theo sổ, bản liền trước, và lần deploy hay rollback gần nhất nếu nó hỏng.
  - --json: in đúng một đối tượng; các dòng diễn giải nằm trong trường log.
- contract:
  node infra/bsn.js deploy <dịch-vụ> [--apply] [--json]; node infra/bsn.js rollback <dịch-vụ> [commit] [--apply] [--json]. Mã thoát 0 khi thành công, kế hoạch, hoặc không cần đổi; 1 khi từ chối hoặc hỏng.
  JSON kết quả: {ok, service, action: deploy|rollback, from, to, healthy, reverted: null|ok|failed|none, reason, outcome?: NOT_DECLARED|WAITING_BUILD|NO_PREVIOUS|UNKNOWN_REF|NEVER_RAN_HERE|IMAGE_GONE|BUSY|SWITCH_FAILED, locked?, planned?, noop?, declarationUpdated?, log: [dòng]}.
  Sổ deploy local/.run/deployments.json (không commit): {schema, services: {<tên>: {current: {commit, at, action}, previous, history: [{action: up|deploy|rollback|auto-revert, commit, from, result: ok|failed, reason?, at, by}]}}}. Sổ chỉ đổi theo kiểu thêm vào; sổ có schema lớn hơn bản lệnh hiểu thì lệnh từ chối chạy thay vì ghi đè. Mỗi lần ghi là đọc lại, thêm một dòng, lưu, trong khóa "ledger".
  Khóa theo dịch vụ: tệp local/.run/lock.deploy.<tên>.json ghi pid của bên giữ; có --apply mà dịch vụ đang có lần đưa lên chạy dở thì trả {ok:false, locked:true, outcome: BUSY}; tiến trình giữ khóa đã chết thì khóa coi như bỏ. Phần chuẩn bị tầng dùng chung chạy trong khóa "tier".
  Biến môi trường: BSN_HEALTH_SECONDS (số giây chờ khỏe, mặc định 120), BSN_ACTOR (ai yêu cầu, ghi vào sổ).
  JSON của status thêm cho mỗi dịch vụ: deployed, previous, lastAttempt, history (15 dòng gần nhất, mới trước), busy (bên đang giữ khóa hoặc null).
  Không còn workflow deploy.yml và rollback.yml trên GitHub (D-007): deploy và rollback chỉ đi qua dòng lệnh và bảng điều khiển.
- acceptance:
  - Luật thuần trong test/domain.test.js: bảng quyết định của deploy và rollback (từ chối, không đổi, chuyển bản), bản để lùi về còn không, luật của sổ.
  - test/deploy.test.js (Docker giả có trạng thái, chờ khỏe được tiêm vào, chạy qua đúng dòng lệnh): kế hoạch không đổi gì; từ chối commit chưa có bản; deploy thành công ghi bản đang chạy và bản liền trước, không dùng --remove-orphans; bản không khỏe thì bật lại bản trước, mã thoát 1, sổ ghi deploy:failed rồi auto-revert:ok, tờ khai báo không đổi; lần đầu mà hỏng thì nói rõ không có bản để bật lại; đang chạy đúng bản thì không đổi; ảnh ở máy sai commit bên trong bị từ chối; rollback mặc định ghi lại tờ khai báo; rollback theo tiền tố; từ chối commit chưa từng chạy khỏe; từ chối khi bản đã bị dọn; status in thông tin từ sổ; khóa theo dịch vụ (đang bận thì từ chối, khóa của tiến trình chết thì bỏ qua); sổ không mất dòng của bên khác và từ chối sổ có schema mới hơn.
  - test/contract.test.js: cổng Ledger và Locks cho cùng kết quả với bộ nối trên đĩa và bộ nối trong bộ nhớ.
  - Đã thử thật ngày 2026-10-07 trên hệ local và trên một máy thử GCP (e2-small, lệnh chạy ngay trên máy đó) với một dịch vụ: deploy hai chiều khỏe; bản cố ý không mở cổng bị phát hiện, bản cũ tự chạy lại và khỏe, dịch vụ kia không bị khởi động lại; rollback mặc định chạy; rollback về commit chưa từng chạy bị từ chối. Sau khi chuyển sang cấu trúc bốn lớp đã thử lại trên hệ local qua bảng điều khiển.
  - Chưa kiểm: mô hình hai máy tách nhau; trường hợp bật lại bản cũ cũng hỏng mới có test với Docker giả.
- tasks:
