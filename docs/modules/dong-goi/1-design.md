---
module: dong-goi
prefix: GOI
---
# dong-goi - Design (tầng 1)

Vì sao và cái gì: quyết định nghiệp vụ và kỹ thuật của module. Chỉ ghi qua tool `design_record` / `design_update`.

## GOI-D-001: Khai báo trước, build sau: chỉ đóng gói commit đã khai
- date: 2026-10-07
- status: accepted
- decision: Workflow dùng chung service-image chạy trong repo của dịch vụ sau job test. Nó lấy thư mục ci/ và services/ của repo deploy về, rồi ci/decide.js quyết định: chỉ đóng gói khi (1) sự kiện là push hoặc chạy tay, (2) nhánh là main và bsn.ci.json không loại main, (3) tên repo đúng là <tiền tố><tên dịch vụ trong bsn.ci.json>, (4) có tờ khai báo của dịch vụ, và (5) commit đang chạy TRÙNG commit ghi trong tờ đó. Không đạt (4) hoặc (5) thì dừng sau bước quyết định, job vẫn xanh, nhật ký nêu lý do và cách xử lý. Thiếu bsn.ci.json, tên dịch vụ sai dạng, hay repo đẩy dưới tên dịch vụ khác là LỖI. Khi đóng gói: build cho linux/amd64, ghi vào bản mã commit đầy đủ, nhánh, repo mã và lần chạy; nhãn là main-<12 ký tự commit>; bản đã có thì không ghi đè. Build ghi kèm thông tin đệm và lấy lớp từ bản main- gần nhất của chính dịch vụ đó.
- rationale: S-029 (người dùng chốt cho mọi dịch vụ): không có build tự động; dịch vụ khai commit rồi mới build đúng commit đó. Luật nằm trong workflow dùng chung nên dịch vụ nào cũng theo. Kiểm tên repo để một repo không đẩy được bản dưới tên dịch vụ khác. Dùng lại lớp vì máy của GitHub không giữ lớp giữa các lần chạy (D-005).
- impacts: Khai báo đi trước bản, nên "đã khai, chưa có bản" là bình thường: lệnh images báo CHỜ BUILD. Luật thay thế: chỉ deploy commit đã có bản. Dịch vụ cần workflow_dispatch trong workflow của mình để chạy tay khi lỡ đẩy trước. Workflow chỉ đóng gói commit ở đầu nhánh của lần chạy (P-002). Nền không kiểm được dịch vụ có khai needs: test (P-004). Thiếu secret DOCKERHUB_USERNAME hoặc DOCKERHUB_TOKEN thì cảnh báo và không đẩy.
