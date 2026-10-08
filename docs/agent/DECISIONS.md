# DECISIONS: infra

Chỉ thêm bản ghi mới; không sửa bản ghi cũ (đánh dấu `superseded by D-xxx`). Mẫu: ngày, trạng thái, bối cảnh, quyết định, hệ quả.

Quyết định do người dùng chốt cho cả hệ nằm ở `docs/system/decisions.md` của repo harness (thư mục gốc `BSN_/`), không chép lại ở đây. Các mục liên quan tới repo này: S-017 (triển khai theo commit được ghim), S-018 (tầng dùng chung ở local, Redpanda), S-019 (GitHub và GitHub Actions), S-020 (dự án GCP), S-023 (nền dùng chung, tờ khai báo theo dịch vụ, Docker Hub công khai, hai máy), S-026 (đưa repo lên công khai, địa chỉ ẩn danh), S-028 (tách repo deploy và repo harness), S-029 (khai báo trước, build sau), S-030 (infra là một đơn vị có tài liệu như dịch vụ).

Tệp này chỉ ghi quyết định kỹ thuật của riêng repo deploy mà phiên infra tự chọn khi làm.

## D-001: Không dùng thư viện ngoài, không có package.json
- Ngày: 2026-10-05. Trạng thái: accepted.
- Bối cảnh: lệnh điều khiển phải chạy ngay trên máy làm việc và trên máy của GitHub mà không có bước cài đặt.
- Quyết định: chỉ dùng thư viện có sẵn của Node; tờ khai báo là JSON.
- Hệ quả: không có trình đọc YAML, không có thư viện gọi Docker; mọi việc với Docker đi qua lệnh `docker`.

## D-002: Thư mục infra được nhận ra bằng vị trí của tệp mã, không bằng tên thư mục
- Ngày: 2026-10-07. Trạng thái: accepted.
- Bối cảnh: trên máy làm việc repo này nằm ở `BSN_/infra/`; trên máy của GitHub nó là thư mục gốc của repo với tên bất kỳ và không có repo dịch vụ nào bên cạnh (S-028).
- Quyết định: `lib.js` coi thư mục chứa nó là thư mục infra khi `root` đúng là thư mục cha của nó; với `root` khác (workspace giả của test) thì là `<root>/infra`. `check` và `images` bỏ phần kiểm repo dịch vụ khi máy không có repo dịch vụ nào, và nói rõ đã bỏ.
- Hệ quả: cách gọi `node infra/bsn.js ...` từ `BSN_/` không đổi; trong repo đứng một mình chỉ `check` và `images` chạy được.

## D-003: Bước test ở lại workflow của dịch vụ, workflow dùng chung chỉ lo từ quyết định đóng gói trở đi
- Ngày: 2026-10-06. Trạng thái: accepted.
- Bối cảnh: mỗi dịch vụ cần ngôn ngữ và phụ thuộc chạy kèm khác nhau, và GitHub Actions không cho một workflow dùng chung dựng dịch vụ chạy kèm theo một tệp cấu hình.
- Quyết định: dịch vụ tự viết job `test`; job `image` gọi `service-image.yml` của repo này với `needs: test`.
- Hệ quả: nền không biết dịch vụ test bằng gì. Việc "bản chỉ sinh ra sau khi test qua" dựa vào dòng `needs: test` trong workflow của dịch vụ; nền CHƯA kiểm được dịch vụ có khai dòng đó hay không.

## D-004: Quét bí mật bằng tệp tự viết, chỉ bắt các dạng có khuôn rõ
- Ngày: 2026-10-06. Trạng thái: accepted.
- Bối cảnh: kho Docker Hub công khai; cần chặn lỗi thường gặp trước khi đẩy mà không thêm action của bên thứ ba.
- Quyết định: `ci/scan-image.js` bung hệ tệp của bản, bỏ qua thư mục thư viện và thư mục hệ thống của ảnh nền, tìm token có khuôn rõ, tệp `.env`, tệp khóa, thư mục `.git`, và biến ENV/ARG tên như bí mật mà mang giá trị.
- Hệ quả: qua được bước này không chứng minh bản sạch; bí mật dạng lạ hoặc nằm trong thư mục thư viện không bị bắt. Quét lỗ hổng và ký bản chưa làm.

## D-006: Sổ deploy tách khỏi tờ khai báo; deploy hỏng không sửa tờ khai báo
- Ngày: 2026-10-07. Trạng thái: accepted.
- Bối cảnh: tờ khai báo nói dịch vụ MUỐN chạy commit nào và do dịch vụ ghi. Khi một lần deploy hỏng và hệ tự bật lại bản cũ, thứ đang chạy khác thứ được khai. Cần một nơi ghi sự thật của đích, và cần quyết định có tự sửa tờ khai báo về bản cũ không.
- Quyết định: mỗi đích giữ một sổ deploy riêng (`local/.run/deployments.json`, không commit): bản đang chạy, bản liền trước, 50 lần đưa lên gần nhất. Deploy hỏng KHÔNG sửa tờ khai báo; `status` báo chỗ lệch. Chỉ `rollback` (một việc người hay agent chủ động yêu cầu) mới ghi lại tờ khai báo sau khi bản lùi về đã khỏe. `rollback` chỉ nhận commit mà sổ ghi là đã từng chạy khỏe trên đích đó.
- Hệ quả: sau một lần deploy hỏng, dịch vụ phải tự quyết: sửa và khai commit mới, hoặc rollback để tờ khai báo khớp lại. Sổ mất thì mất lịch sử và không rollback được cho tới khi có lần chạy khỏe mới (lệnh `up` cũng ghi sổ). Với máy chủ, sổ phải nằm trên máy chủ: chưa làm.

## D-005: Dùng lại lớp bằng thông tin đệm ghi kèm trong bản
- Ngày: 2026-10-07. Trạng thái: accepted.
- Bối cảnh: máy của GitHub không giữ lớp giữa các lần chạy; lớp cài thư viện của một dịch vụ Python dựng lại lệch vài trăm byte nên bị đẩy lại nguyên 21 MB mỗi bản.
- Quyết định: build với `BUILDKIT_INLINE_CACHE=1` và `--cache-from` bản `main-` gần nhất của chính dịch vụ đó, lấy tên bản qua API công khai của Docker Hub. Không tìm được bản trước thì build bình thường.
- Hệ quả: không cần kho đệm riêng hay action thêm. Chỉ lớp của tầng cuối trong Dockerfile được dùng lại; bản đầu tiên sau khi bật chưa được lợi. Đã đo với một bản không đổi mã: không lớp nào phải tải lên. CHƯA đo với một commit sửa mã thật.

## D-007: Repo deploy là một dịch vụ bốn lớp, có cả máy chủ web lẫn giao diện; bỏ nút bấm trên GitHub
- Ngày: 2026-10-07. Trạng thái: accepted (người dùng duyệt thiết kế cùng ngày; mã đã chuyển xong, 86 test).
- Bối cảnh: người dùng chốt ngày 2026-10-07: DevOps và agent deploy từ một bảng điều khiển web của chính repo này, không để nút deploy lộ trên GitHub Actions của một repo công khai; repo vẫn là một repo; mã phải quy hoạch theo mẫu thiết kế và SOLID, thuần Node.js, phần máy chủ và phần giao diện nằm chung một dịch vụ. Bản thử bảng điều khiển viết cùng ngày chạy được nhưng gộp nhiều việc vào một tệp và chép lại quy tắc deploy trong "đích giả".
- Quyết định: chia mã thành `src/domain`, `src/application`, `src/infrastructure`, `src/interfaces` (cli, http, web) với một nơi lắp ráp duy nhất; phụ thuộc một chiều do test giữ; mọi thứ ra ngoài đi qua cổng có bộ nối thật và bộ nối trong bộ nhớ, cùng qua một bộ test hợp đồng. Chi tiết: `ARCHITECTURE.md`. Hai workflow `deploy.yml` và `rollback.yml` bị xóa; không cài runner tự chạy.
- Hệ quả: thay cho phần "nút Deploy, Rollback trên GitHub" của S-023 mục 8 (cần ghi mục mới ở `docs/system/decisions.md` của repo harness). `lib.js`, `deploy.js` và thư mục `console/` của bản thử sẽ bị thay thế. Tên lệnh, đầu ra JSON, khuôn tờ khai báo và workflow dùng chung không đổi, nên dịch vụ không phải sửa gì. D-001 (không thư viện ngoài) giữ nguyên. Khác với bản thiết kế lúc duyệt: `ci/prune-images.js` được nhập `src/` (nó chạy trong repo đầy đủ), chỉ `decide.js` và `scan-image.js` phải đứng một mình; thêm cổng `Hasher` và `ConfigFiles`; lời diễn giải tiếng Việt của một lần đưa lên nằm trong ca sử dụng (qua hàm `say` được đưa vào) chứ không tách sang lớp trình bày.

## D-008: Mỗi việc của bảng điều khiển chạy trong một tiến trình con tách rời
- Ngày: 2026-10-07. Trạng thái: accepted.
- Bối cảnh: lệnh docker chạy đồng bộ và có thể mất hàng phút; và bảng điều khiển có thể bị tắt giữa lúc một lần đưa lên đang chạy. Thử thật: giết bảng điều khiển giữa lúc rollback thì tiến trình con chết theo (trên Windows Node tự giết tiến trình con khi tiến trình cha chết), container đã đổi mà sổ và tờ khai báo chưa ghi.
- Quyết định: cổng `JobExecutor` có bộ nối chạy đúng lệnh điều khiển (`deploy|rollback --apply --json`) trong một tiến trình con với cờ `detached`; lệnh điều khiển bỏ qua lỗi "bên đọc đầu ra đã biến mất". Chế độ bộ nhớ dùng bộ nối gọi thẳng ca sử dụng.
- Hệ quả: máy chủ web không đứng trong lúc kéo bản; bảng điều khiển chết thì việc vẫn xong và khóa của dịch vụ được nhả, nhưng kết quả của việc đó không còn hiện trên trang (sổ deploy vẫn ghi). `test/job-executor.test.js` đỏ khi bỏ cờ. Trên Linux cờ này còn giữ cho phím Ctrl+C ở cửa sổ của bảng điều khiển không tới tiến trình con.

## D-009: Đích từ xa: máy đích tự chạy lệnh điều khiển, bảng điều khiển chỉ ra lệnh qua SSH
- Ngày: 2026-10-07. Trạng thái: accepted.
- Bối cảnh: người dùng muốn bảng điều khiển chỉ chạy ở máy làm việc nhưng deploy, rollback thật trên một máy GCP. Có hai hướng: (a) viết bộ nối `Runtime`, `Ledger`, `Locks` gọi docker và đọc tệp từ xa; (b) để máy đích chạy đúng lệnh điều khiển đã có và chỉ chuyển lệnh, kết quả qua SSH.
- Quyết định: chọn (b). Thêm cổng `RemoteShell` (`exec(script)`), bộ nối `gcloud-ssh-shell.js`, và hai tệp ở lớp application dựng trên cổng đó: `remote-target.js` (đọc trạng thái và bản trên kho từ đầu ra `--json`) và `remote-jobs.js` (cổng `JobExecutor`: bắt đầu việc tách rời khỏi phiên SSH rồi hỏi lại). Tờ khai đích ở `targets/<tên>.json`, không vào git. Bộ nối hỏi `gcloud` một lần để biết địa chỉ rồi gọi thẳng `ssh`, đoạn lệnh đi qua đầu vào chuẩn; khóa máy chủ ghi theo tên máy.
- Hệ quả: luật deploy, sổ, khóa và bí mật nằm ở đúng nơi hệ chạy; không có luật nào viết lại; hợp đồng giữa hai máy là đầu ra `--json`, nên nó chỉ được đổi theo kiểu thêm vào và hai máy nên chạy cùng phiên bản. Đánh đổi: mỗi lần đọc trạng thái là một lần SSH (khoảng 1,3 giây; gọi `gcloud` mỗi lần thì 21 tới 32 giây, đã đo); máy đích phải có Node và bản cài của repo này. Trên Windows cần `BSN_SSH` hoặc siết quyền tệp khóa. Hướng (a) vẫn mở cho đích không cài được lệnh điều khiển.

## D-010: Khai commit nào thì test và đóng gói đúng commit đó; bản phải chạy thử được trước khi đẩy
- Ngày: 2026-10-08. Trạng thái: accepted (người dùng duyệt).
- Bối cảnh: workflow dùng chung chỉ SO commit đang chạy với commit đã khai, nên chỉ commit ở đầu nhánh mới được đóng gói. Viết thêm một commit nhật ký sau khi ghim là bản đã khai không bao giờ có bản đóng gói; cả hai dịch vụ cùng rơi vào đúng tình huống đó ngày 2026-10-08. Người dùng nêu thẳng: tờ khai báo ghi commit nào thì phải build commit đó. Ngoài ra thiếu secret Docker Hub thì lần chạy vẫn xanh mà không có bản, và bản đóng xong không được bật thử lần nào.
- Quyết định: (1) thêm workflow dùng chung `service-pin` chạy trước job test của dịch vụ: đọc tờ khai báo và trả commit chờ đóng gói cùng danh sách commit phải test (đầu nhánh, cộng commit đã khai khi nó nằm dưới đầu nhánh); `service-image` nhận commit đó, lấy đúng nó ra và đóng gói. Điều kiện: commit đã khai, đã có trên nhánh `main` vừa đẩy, chưa có bản. (2) Có commit chờ đóng gói mà thiếu secret thì lần chạy đỏ. (3) Trước khi đẩy, `ci/smoke.js` bật bản theo đúng tờ khai báo (dùng lại `serviceEnv` của lớp domain) cạnh PostgreSQL và broker, gọi đường kiểm sức khỏe; không khỏe thì không đẩy.
- Hệ quả: thay cho câu "chỉ đóng gói commit ở đầu nhánh" của D-003 và S-029; dịch vụ thêm một job `pin` và một dòng `ref` vào workflow của mình (cách gọi cũ vẫn chạy theo luật cũ). Đầu nhánh hỏng test thì commit đã khai nằm dưới nó cũng không được đóng gói ở lần chạy đó. Chạy thử không bật đồ giả lập đi kèm, nên bản phải tự khởi động được khi thiếu chúng; đường kiểm sức khỏe nông thì chạy thử cũng nông. Nền vẫn CHƯA kiểm được dịch vụ có khai `needs` trước job `image`.

## D-011: Đăng nhập bảng điều khiển bằng hộp thoại của trình duyệt (HTTP Basic), không có phiên
- Ngày: 2026-10-08. Người dùng yêu cầu thay trang đăng nhập bằng hộp thoại của trình duyệt.
- Trình duyệt gửi tên và mật khẩu kèm MỌI yêu cầu; máy chủ băm chậm một lần rồi so với một dấu giữ trong bộ nhớ ở các lần sau. Bỏ cookie phiên, `/api/login`, `/api/logout` và màn đăng nhập. Chỉ `/healthz` mở.
- Hệ quả: không có đăng xuất thật (đóng trình duyệt); vì trình duyệt tự gửi mật khẩu cho cả yêu cầu do trang khác tạo, lệnh ghi phải có header `x-bsn-console` và đúng nguồn gốc (Origin). HTTP Basic gửi mật khẩu ở dạng đọc được trên đường truyền: chỉ chấp nhận được vì bảng điều khiển chỉ nghe ở `127.0.0.1`; rời địa chỉ đó thì phải có HTTPS trước (chưa làm).

## D-012: An toàn của bảng điều khiển: vai trò, cổng an toàn do máy chủ kiểm, duyệt, sổ thao tác
- Ngày: 2026-10-08. Theo bản design của người dùng ("làm toàn bộ, cần thì quyết định lại").
- Người gọi là `admin` (mọi quyền), người dùng do admin tạo (Developer, QA, Tech lead, DevOps), hoặc agent dùng token (vai trò `Agent`). Quyền đặt theo vai trò ở từng môi trường: 0 chỉ xem, 1 deploy, 2 deploy và rollback. Mặc định không khóa gì, để hệ đang chạy không đổi hành vi cho tới khi người dùng đặt.
- Mọi điều kiện (quyền, danh sách người được phép, khung giờ khóa, gõ tên xác nhận, người thứ hai duyệt) do máy chủ kiểm ở cả kiểm tra trước lẫn lúc chạy; các đường `/api` cũ đi qua cùng cổng. Người gửi không tự duyệt được; người duyệt phải có mức 2 ở môi trường đó.
- Yêu cầu chờ duyệt và sổ các lần chạy sống trong bộ nhớ của bảng điều khiển (mất khi nó khởi động lại; yêu cầu chờ duyệt hết hạn sau 24 giờ). Cấu hình và sổ thao tác nằm trên đĩa.
- Chưa có: đăng nhập một lần của công ty; thông báo cho người duyệt (họ phải tự mở màn Approvals).

## D-013: Môi trường là một máy; ánh xạ nhánh chỉ là khai báo; giao diện tiếng Anh
- Ngày: 2026-10-08.
- Bản design cho tạo và xóa môi trường trên trang. Ở nền này môi trường là một máy chạy hệ (`local` và mỗi `targets/<tên>.json`), nên trang chỉ đặt màu, mô tả, thứ tự và mức bảo vệ; thêm môi trường là thêm tờ khai đích.
- Bản design có chế độ tự deploy khi có push. S-029 (khai báo commit trước, build sau) không cho việc đó, nên ánh xạ nhánh và quy tắc nhánh được lưu và thử được nhưng không tự chạy gì; trang nói rõ điều này. Muốn bật thì phải có quyết định mới của người dùng.
- Biểu đồ lỗi và độ trễ, trạng thái `degraded`: chưa có nguồn số liệu nên không vẽ số giả; ô đếm `degraded` luôn là 0.
- Người dùng chốt giao diện dùng tiếng Anh toàn bộ; chữ gom ở `src/interfaces/web/text.js` và `text-config.js`. Đầu ra của dòng lệnh, tài liệu và chú thích trong mã giữ tiếng Việt; vì vậy các dòng log của một lần chạy (do lệnh in ra) vẫn là tiếng Việt.

## D-014: Bảng điều khiển có DB riêng bằng SQLite; nó không phải một service trong hệ
- Ngày: 2026-10-08. Người dùng hỏi có nên biến phần infra thành một service như các service khác và cho nó một DB; chốt dùng SQLite, và dùng cho cả phân quyền, thành viên chứ không chỉ sổ thao tác.
- Bảng điều khiển KHÔNG nằm trong danh sách dịch vụ mà nó deploy: nếu nằm trong đó thì bản mới của nó hỏng là mất chỗ bấm rollback, sổ thao tác mất đúng lúc hệ sập, và thứ giữ quyền SSH, quyền tạo máy lại chạy chung chỗ với service nghiệp vụ.
- DB là MỘT tệp SQLite cạnh bảng điều khiển (`local/.run/console.db`), mở bằng `node:sqlite` có sẵn trong Node 24: không thêm thư viện, không thêm máy chủ DB phải canh. Đây là ngoại lệ có chủ ý của quy tắc chung "PostgreSQL là cơ sở dữ liệu duy nhất" (quy tắc đó viết cho service nghiệp vụ).
- Trong DB: cấu hình có phiên bản, bảng phân quyền và mức bảo vệ (ghi lại theo phiên bản mới nhất, cùng giao dịch), thành viên (băm chậm có muối), sổ thao tác, yêu cầu chờ duyệt, lịch sử lần chạy, môi trường do trang thêm. NGOÀI DB: mật khẩu quản trị và token của agent (tệp riêng, để DB hỏng thì admin vẫn vào được và `--reset-auth` vẫn chạy); bí mật của dịch vụ (không bao giờ vào đây).
- Giới hạn đã biết: một tiến trình bảng điều khiển ghi tại một thời điểm (hai máy quản trị chạy song song thì phải đổi sang DB có máy chủ; đổi là thay bộ nối); sao lưu là chép tệp, chưa có lịch; `node:sqlite` còn được Node ghi là chưa ổn định hẳn nên được gói trong đúng hai tệp ở `infrastructure/sqlite/`.

## D-015: Thêm và gỡ môi trường trên trang, kể cả tạo và xóa máy trên GCP
- Ngày: 2026-10-08. Người dùng yêu cầu làm phần này của bản design và thử thật trên GCP (thay cho quyết định "không tạo, xóa môi trường trên trang" ở D-013).
- Tạo một môi trường là tạo MỘT MÁY sẵn sàng nhận lệnh: tạo máy, chờ SSH, cài Docker, Node và bộ lệnh điều khiển, kiểm lệnh chạy được. Không lấy repo của dịch vụ, không bật hệ, không deploy gì: đưa dịch vụ lên là việc của người vận hành (người dùng chốt).
- Tạo máy tốn tiền nên: chỉ Admin và DevOps làm được, trang hiện giá ước tính, phải gõ lại tên, và mọi lần đều vào sổ thao tác. Xóa máy chỉ áp cho máy do bảng điều khiển tạo; môi trường khai bằng tệp `targets/<tên>.json` không gỡ được từ trang.
- Bảng điều khiển gọi `gcloud` bằng tài khoản và dự án đang đăng nhập ở máy chạy nó; nó không giữ khóa cloud nào. Chưa có hạn mức số máy hay tiền.
- Tự deploy khi có push: người dùng TẠM DỪNG cho tới khi infra có VM riêng (bảng điều khiển chỉ nghe ở `127.0.0.1` nên chưa nhận được tin từ GitHub).

