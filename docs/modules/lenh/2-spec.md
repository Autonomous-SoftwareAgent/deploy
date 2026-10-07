---
module: lenh
---
# lenh - Spec (tầng 2)

Design được tách thành yêu cầu, contract, tiêu chí nghiệm thu và task. Khung tự sinh từ design; điền qua tool `spec_fill`.

## LENH-S-001: Lệnh điều khiển chạy cả hệ ở local từ commit được ghim
- from: LENH-D-001
- derived_from: 06889543
- status: ready
- requirement:
  - extractCommit trích đúng một commit (40 ký tự) ra thư mục đích bằng git archive với core.autocrlf=false rồi tar; tệp sửa dở và tệp chưa theo dõi không có mặt; thư mục làm việc của repo không bị đụng.
  - build: với từng dịch vụ, trích commit được ghim ra thư mục tạm, chép tệp khai ở files vào local/.run/files/<dịch-vụ>/ kèm dấu commit, build ảnh chính và ảnh đồ giả lập với nhãn bsn-<tên>:<12 ký tự>, ghi commit vào nhãn của ảnh, rồi xóa thư mục tạm. Dịch vụ chưa ghim thì từ chối.
  - up: sinh mật khẩu local nếu thiếu; bật tầng dùng chung và chờ khỏe; tạo cơ sở dữ liệu và topic còn thiếu; lấy ảnh; ghi compose của các dịch vụ rồi bật; chờ đường kiểm sức khỏe tối đa 120 giây, không khỏe thì mã thoát 1.
  - up --pull: ảnh chính chưa có ở máy thì kéo bản CI, đọc commit ghi bên trong bản, khác commit được ghim thì từ chối và không gắn nhãn cục bộ; không kéo được thì dừng và nói rõ, không tự chuyển sang build. Đồ giả lập vẫn build tại chỗ. Tệp cấu hình được trích lại khi dấu commit khác bản ghim.
  - status: bản ghim, HEAD, số tệp chưa commit, ảnh đã có chưa, container đang chạy và có đúng commit được ghim không, cổng.
  - images: mỗi dịch vụ CÓ hoặc CHỜ BUILD; mã thoát 0, trừ khi --strict và còn bản thiếu.
  - down: tắt dịch vụ rồi tầng dùng chung; --volumes xóa cả dữ liệu local.
  - pin, build, up, down không có --apply thì chỉ in kế hoạch và không gọi docker.
- contract:
  node infra/bsn.js <check|status|images|pin|build|up|down> [dịch-vụ...] [--apply] [--json] [--pull] [--strict] [--volumes] [--verbose].
  JSON của status: {ok, dockerReachable, services: [{service, pinned, head, pinnedIsHead, uncommittedFiles, imageBuilt, running, runningCommit, runningMatchesPin, containerStatus, portLocal}]}.
  JSON của images: {ok, strict, waiting: [tên], images: [{service, commit, image, present, reason}]}.
  Tên bản trên Docker Hub: <registry.namespace>/<registry.repoPrefix><dịch-vụ>:<registry.branch>-<12 ký tự commit>. Nhãn bên trong bản dùng để kiểm: org.opencontainers.image.revision.
  Tệp sinh khi chạy (không commit): local/.run/secrets.env, local/.run/services.compose.json, local/.run/files/.
- acceptance:
  - Test trong test/bsn.test.js (docker giả ghi lại lời gọi; git và tar chạy thật trên repo tạm): trích commit không mang tệp sửa dở; build nhận thư mục tạm chứa đúng commit và nhãn là mã commit; build và up từ chối dịch vụ chưa ghim; up và down không --apply thì không gọi docker; compose có ảnh theo commit, cổng 127.0.0.1, địa chỉ cơ sở dữ liệu và broker do nền cấp; up --pull kéo, kiểm, gắn nhãn và chỉ build đồ giả lập; bản sai commit bị từ chối; status và images có --json.
  - Đã chạy thật ở máy: hai dịch vụ chạy cùng lúc và báo khỏe; up --pull kéo bản CI của cả hai dịch vụ và chúng chạy từ bản đó (README.md mục "Đã kiểm").
- tasks:
