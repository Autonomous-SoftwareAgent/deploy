# CONVENTIONS: infra

Mục nào chưa chốt thì để `TBD`, không tự đoán.

- Ngôn ngữ: JavaScript (CommonJS) chạy bằng Node 24, CHỈ dùng thư viện có sẵn của Node. Không có `package.json`, không cài gói ngoài: workflow dùng chung lấy thẳng tệp về máy của GitHub và chạy.
- Cách chạy test: từ `BSN_/` chạy `node --test infra/test/*.test.js infra/ci/test/*.test.js`; từ gốc repo deploy chạy `node --test test/*.test.js ci/test/*.test.js`. Test không cần Docker, không cần mạng.
- **Bốn lớp** (`ARCHITECTURE.md`): `src/domain` (luật thuần, không nhập module `node:` nào), `src/application` (ca sử dụng và `ports.js`), `src/infrastructure` (bộ nối), `src/interfaces` (cli, http, web), lắp ở `src/composition.js`. `test/architecture.test.js` giữ chiều phụ thuộc và giới hạn 250 dòng mỗi tệp.
- **Hình dạng chung**: ca sử dụng và bộ nối là hàm tạo `makeXxx({ các cổng cần })` trả hàm hoặc đối tượng; không dùng lớp kế thừa, không có biến toàn cục giữ trạng thái. Ca sử dụng nhận đúng các cổng nó dùng, không nhận cả "túi" phụ thuộc.
- **Cổng**: mọi hàm trả Promise. Thêm hàm vào một cổng thì phải cài ở cả bộ nối thật lẫn `memory/` và thêm vào `test/contract.test.js`.
- **Kết quả, không ngoại lệ**: ca sử dụng trả `{ok, outcome?, reason?, ...}` cho mọi trường hợp đã lường trước (mã `outcome` ở `src/domain/outcome.js`); chỉ ném khi gặp điều không lường được. Lớp interfaces đổi `outcome` thành mã thoát hoặc mã HTTP.
- **Lời diễn giải**: ca sử dụng kể việc nó làm qua hàm `say` được đưa vào; nó không tự in. Dòng lệnh in ra màn hình, `--json` và bảng điều khiển gom vào trường `log`.
- Lệnh ra ngoài (git, docker, tar) đi qua hàm `run` của `process-runner.js` được đưa vào bộ nối. Test thay `run` bằng bản giả ghi lại lời gọi; git và tar thì chạy thật trên repo tạm. Việc chờ khỏe là cổng `Health`, test thay được.
- **Giao diện** (`src/interfaces/web`): module trình duyệt tải thẳng, không bước build, không thư viện. Chỉ `api.js` gọi mạng; `store.js` giữ trạng thái; mỗi tệp trong `views/` là hàm từ dữ liệu ra phần tử DOM và chỉ gán chữ qua `textContent`. Không viết JavaScript hay CSS trong HTML.
- Lệnh làm thay đổi mặc định chỉ in kế hoạch; `--apply` mới chạy. Lệnh chỉ đọc nhận `--json` và khi đó in đúng MỘT đối tượng JSON.
- Phần quyết định của mỗi tệp trong `ci/` là hàm thuần (không đọc đĩa, không gọi lệnh), có test riêng; phần đọc môi trường nằm trong `main()`.
- Thông báo cho người dùng viết tiếng Việt, nói điều gì đã xảy ra và phải làm gì tiếp.
- Tên dịch vụ không được xuất hiện trong mã, test của lệnh điều khiển hay workflow; test dùng dịch vụ giả (`shop`, `feed`).
- Token trong test được ghép lúc chạy, để tệp không chứa chuỗi nào giống token thật (repo công khai, GitHub quét bí mật).
- Mọi action trong workflow ghim bằng mã commit kèm ghi chú phiên bản; ảnh chạy kèm ghim phiên bản, không `latest`.
- Dấu xuống dòng LF cho mọi tệp chữ (`.gitattributes`); tệp chạy trong ảnh Linux hỏng nếu là CRLF.
- Danh tính commit là địa chỉ ẩn danh của GitHub (`git config --local`); GitHub chặn lần đẩy lộ địa chỉ thư thật.
- Thư mục: xem bảng "Cấu trúc" trong `../../CLAUDE.md` của repo này (cấu trúc HIỆN CÓ trong git).
- Thiết kế, danh sách cổng và mẫu thiết kế đang dùng: `ARCHITECTURE.md` (D-007, đã làm).
