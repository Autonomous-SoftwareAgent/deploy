---
module: bang-dieu-khien
---
# bang-dieu-khien - Spec (tầng 2)

Design được tách thành yêu cầu, contract, tiêu chí nghiệm thu và task. Khung tự sinh từ design; điền qua tool `spec_fill`.

## BDK-S-001: Bảng điều khiển web: người và agent deploy, rollback qua cùng các ca sử dụng với dòng lệnh
- from: BDK-D-001
- derived_from: e1e27893
- status: ready
- requirement:
  - Khởi động: node infra/bsn.js console [--port=8900] [--memory] [--reset-auth]. Chỉ nghe trên 127.0.0.1. Lần đầu sinh mật khẩu quản trị và token cho agent, lưu dạng băm (scrypt cho mật khẩu, SHA-256 cho token), ghi bản rõ MỘT lần vào local/.run/console.first-login.txt để người dùng đọc rồi xóa. --reset-auth sinh lại cả hai và hủy mọi phiên.
  - Mọi yêu cầu phải mang đúng tên máy của bảng điều khiển trong header Host (127.0.0.1:<cổng> hoặc localhost:<cổng>), nếu không trả 421.
  - Giao diện (/, /web/*) và /healthz mở được khi chưa đăng nhập; chúng không chứa dữ liệu. Mọi đường /api khác đòi đăng nhập (401).
  - Đăng nhập: POST /api/login {password}. Sai 5 lần thì khóa tạm 60 giây (429). Đúng thì cấp cookie phiên HttpOnly, SameSite=Strict, hạn 8 giờ. Agent gửi header Authorization: Bearer <token>.
  - Yêu cầu GHI từ trình duyệt (đăng nhập, hoặc dùng cookie phiên) phải có header x-bsn-console: 1, nếu không trả 400. Yêu cầu dùng token không cần.
  - GET /api/state: với mỗi dịch vụ trả commit đã khai, bản đang chạy, có khớp không, bản trên kho đã có chưa (kết quả hỏi kho được giữ tối đa 30 giây), bản liền trước, lần yêu cầu gần nhất, 15 dòng lịch sử, bên đang giữ khóa, mã việc đang chạy; kèm 10 việc gần nhất. Tờ khai báo không hợp lệ thì trả 502 kèm lỗi, không hiện trạng thái. Đọc trạng thái không làm đổi gì.
  - POST /api/services/<tên>/deploy và /rollback {commit?}: tên dịch vụ sai dạng hoặc commit sai dạng (không phải 7 đến 40 chữ số hệ 16, hoặc gửi kèm deploy) trả 400; dịch vụ không có tờ khai báo trả 404; dịch vụ đang có việc chạy dở trả 409 kèm việc đang chạy; còn lại trả 202 kèm việc mới. Việc ghi lại ai yêu cầu (admin hoặc agent) và người đó được ghi vào sổ deploy.
  - Việc chạy trong một tiến trình con tách rời khỏi bảng điều khiển, gọi đúng lệnh điều khiển với --apply --json; kết quả của việc là đối tượng JSON lệnh in ra. Bảng điều khiển chết giữa chừng thì việc vẫn chạy tới cuối.
  - GET /api/jobs/<mã>: trạng thái và kết quả của một việc; không có thì 404.
  - Mọi câu trả lời mang các header bảo vệ (không lưu đệm, không cho nhúng khung, chính sách nội dung không có unsafe-inline). Trang không có mã JavaScript hay CSS viết trong HTML.
  - Giao diện: mỗi dịch vụ một thẻ có nhãn trạng thái, nút Deploy (chỉ bấm được khi có bản đã khai khác bản đang chạy và bản đó đã có trên kho), ô chọn bản để lùi về (chỉ các bản đã từng chạy khỏe) và nút Rollback; mỗi nút hỏi lại trước khi chạy; trong lúc có việc chạy dở thì nút của dịch vụ đó bị khóa; danh sách việc kèm nhật ký của lệnh.
  - --memory: cùng các ca sử dụng trên bộ nối trong bộ nhớ với dữ liệu mẫu; trang ghi rõ đang ở chế độ thử.
- contract:
  HTTP (JSON): GET /healthz -> {ok}. POST /api/login {password} -> 200 {ok} + Set-Cookie bsn_sid | 400 | 401 | 429. POST /api/logout -> 200. GET /api/state -> 200 {ok, memory, actor, dockerReachable, services: [{service, declared, running, runningCommit, matches, containerStatus, port, image: {name, present}, deployed, previous, lastAttempt, history, busy, job}], jobs: [việc]} | 502 {ok:false, error}. POST /api/services/:service/deploy -> 202 {ok, job} | 400 | 404 | 409 {ok:false, error, job} | 502. POST /api/services/:service/rollback {commit?} -> như trên. GET /api/jobs/:id -> 200 {ok, job} | 404.
  Việc: {id, service, action, commit, by, startedAt, finishedAt, state: running|done, ok, result} với result là kết quả của ca sử dụng deploy hay rollback kèm log (xem DEP-S-001).
  Lỗi: {ok: false, error: <lời tiếng Việt>}.
  Tệp trạng thái (không commit, trong local/.run/): console.auth.json {schema, password: {salt, hash}, tokenSha256}; console.first-login.txt (bản rõ, đọc rồi xóa).
  Cổng mà phần này thêm vào application/ports.js: Credentials, Hasher, Random, JobExecutor.
- acceptance:
  - test/http.test.js (máy chủ web thật trên cổng ngẫu nhiên, phía sau là các ca sử dụng thật lắp trên bộ nối trong bộ nhớ): chưa đăng nhập thì /api trả 401 còn giao diện mở được và không có mã viết trong HTML; không phục vụ tệp ngoài thư mục giao diện; Host lạ trả 421; nơi lưu chỉ giữ dạng băm, sinh lại thì token cũ hết dùng; đăng nhập, thiếu header riêng, đăng xuất, khóa tạm sau 5 lần sai rồi mở lại; phiên hết hạn sau 8 giờ; trạng thái đủ trường và việc đọc không đổi gì; Deploy bản tốt; Deploy bản hỏng thì bản cũ chạy lại và tờ khai báo không đổi; commit chờ build bị từ chối; Rollback và các đầu vào sai; cùng dịch vụ trả 409, khác dịch vụ chạy chồng thời gian và sổ không mất dòng; tờ khai báo hỏng trả 502.
  - test/job-executor.test.js: tiến trình con nhận đúng tham số và BSN_ACTOR; lệnh hỏng không in JSON thì việc báo hỏng chứ không treo; giết tiến trình cha giữa chừng thì việc vẫn chạy tới cuối (test này đỏ khi bỏ cờ detached).
  - Đã mở trang bằng Edge chạy ngầm ngày 2026-10-07 (chế độ --memory): đăng nhập sai rồi đúng, ba thẻ vẽ đúng trạng thái, bấm Deploy rồi "Thôi" thì không có việc nào, bấm lại và đồng ý thì nút bị khóa trong lúc chạy, bản hỏng tự lùi, Rollback chạy, đăng xuất; không có lỗi JavaScript; trang không tràn ngang.
  - Đã thử thật ngày 2026-10-07 với hệ local qua đường gọi JSON của bảng điều khiển, với một dịch vụ: rollback (8 giây) và deploy (11 giây) khỏe; bấm trùng trả 409 và lệnh gõ tay chen vào bị từ chối; bản cố ý hỏng bị phát hiện, bản cũ tự chạy lại; dịch vụ kia không bị khởi động lại; giết bảng điều khiển giữa lúc rollback thì rollback vẫn xong, sổ và tờ khai báo được ghi, khóa được nhả.
  - Chưa kiểm: người dùng thật bấm trên trình duyệt với hệ thật (mới thử trình duyệt ở chế độ bộ nhớ, và hệ thật qua đường gọi JSON); bảng điều khiển chạy trên máy chủ; nhiều người dùng cùng lúc.
- tasks:

## BDK-S-002: Đích từ xa: bảng điều khiển ở máy này ra lệnh cho máy chạy hệ qua SSH
- from: BDK-D-002
- derived_from: 5a5c7c6b
- status: ready
- requirement:
  - node infra/bsn.js console --target=<tên> [--port=8900]: đọc targets/<tên>.json; tệp thiếu hoặc sai thì báo lỗi có lời và thoát mã 1. Không dùng chung với --memory. Tên đích chỉ gồm chữ thường, số, gạch nối.
  - Tờ khai đích: transport (hiện chỉ gcloud-ssh), configuration (tùy chọn), instance, zone, root (đường dẫn tuyệt đối, không có ..). Mọi trường chỉ nhận ký tự an toàn cho dòng lệnh.
  - Đọc trạng thái: chạy `cd <root> && node infra/bsn.js status --json` trên máy đích; check và getStatus của cùng một lần vẽ trang dùng chung một lần gọi. Hỏi bản trên kho là một lần gọi riêng (`images --json`), kết quả do ca sử dụng của bảng điều khiển giữ 30 giây. Dòng chữ SSH chen vào đầu ra được bỏ qua.
  - Máy đích không trả lời (không nối được, không có đầu ra JSON) là kết quả TARGET_UNREACHABLE (HTTP 504), khác với tờ khai báo trên máy đích sai (INVALID_DECLARATIONS, HTTP 502).
  - Bắt đầu một việc: máy đích chạy lệnh điều khiển trong một tiến trình tách rời khỏi phiên SSH, ghi đầu ra vào <root>/infra/local/.run/jobs/<mã>.out, lỗi vào .err, mã thoát vào .code; BSN_ACTOR là người yêu cầu. Mọi giá trị chen vào đoạn lệnh (mã việc, việc, tên dịch vụ, commit, người yêu cầu) phải đúng dạng, sai thì không gửi gì.
  - Chờ việc: hỏi lại mỗi 3 giây. Một lần hỏi không được (mạng rớt) thì hỏi tiếp; 10 lần liên tiếp không được thì báo mất liên lạc và nói rõ việc có thể vẫn đang chạy. Việc xong mà không có đối tượng JSON thì báo hỏng kèm mã thoát và mấy dòng lỗi cuối. Việc xong thì lần đọc trạng thái kế tiếp không dùng kết quả cũ.
  - Bộ nối SSH: hỏi gcloud một lần để biết địa chỉ và tên đăng nhập; các lần sau gọi lệnh ssh (không qua lớp vỏ) với khóa do gcloud tạo, BatchMode, khóa máy chủ ghi theo tên máy trong local/.run/ssh_known_hosts (StrictHostKeyChecking=accept-new); đoạn lệnh đi qua đầu vào chuẩn của `bash -s`. ssh trả mã 255 thì hỏi lại gcloud một lần rồi thử lại. Biến BSN_SSH chọn bản ssh khác.
  - Trang và /api/state ghi rõ đích đang điều khiển. Lúc khởi động, bảng điều khiển đọc trạng thái một lần ở nền để lần mở trang đầu không phải chờ gcloud.
- contract:
  Tờ khai đích targets/<tên>.json (không vào git): {transport: "gcloud-ssh", configuration?, instance, zone, root}.
  Cổng RemoteShell: exec(script) -> {code, stdout, stderr}; không ném lỗi.
  Hợp đồng giữa hai máy là đầu ra --json của lệnh điều khiển trên máy đích: status ({services: [...]}), images ({images: [...]}), deploy và rollback (xem DEP-S-001); lỗi tờ khai báo: {ok: false, errors: [...]}.
  Tệp của một việc trên máy đích: <root>/infra/local/.run/jobs/<mã>.{out,err,code}; mã việc là 16 chữ số hệ 16.
  GET /api/state thêm trường target (dòng mô tả đích, hoặc null khi đích là chính máy chạy bảng điều khiển). Kết quả mới: TARGET_UNREACHABLE -> HTTP 504.
  Biến môi trường ở máy chạy bảng điều khiển: BSN_SSH (đường dẫn lệnh ssh).
- acceptance:
  - test/remote.test.js: luật của tờ khai đích và việc đọc nó từ đĩa; đoạn lệnh từ chối mọi giá trị sai dạng và bắt đầu việc tách rời; đọc trạng thái một lần gọi, phân biệt tờ khai báo sai với mất kết nối; chờ việc qua mạng chập chờn, lệnh không trả JSON, không bắt đầu được, mất liên lạc; bộ nối SSH hỏi gcloud một lần, gọi ssh không qua lớp vỏ, đoạn lệnh đi nguyên vẹn qua đầu vào chuẩn, hỏi lại gcloud khi mã 255, chọn được bản ssh khác; và một test đầu-cuối qua HTTP với "máy đích" là các ca sử dụng thật trên bộ nối trong bộ nhớ (Deploy, bản hỏng tự lùi, Rollback đổi trạng thái của máy đích).
  - Đã thử thật ngày 2026-10-07: bảng điều khiển chạy ở máy làm việc (Windows), đích là máy GCP e2-small ở asia-southeast1 đã cập nhật lên mã bốn lớp (86 test qua trên máy đó). Với một dịch vụ, qua đường gọi JSON của bảng điều khiển: deploy sang bản khác xong sau 15 giây và khỏe; bấm lần hai trong lúc chạy trả 409; bản cố ý hỏng bị phát hiện sau 120 giây, bản cũ tự chạy lại (138 giây cả thảy); rollback xong sau 12 giây và tờ khai báo trên máy đích được ghi lại; giết bảng điều khiển giữa lúc rollback thì máy đích vẫn rollback xong, sổ ghi, không còn khóa; dịch vụ kia không bị khởi động lại. Đọc trạng thái mất khoảng 1,3 tới 1,9 giây; hỏi kho bản khoảng 6 giây; lần đọc đầu sau khi khởi động khoảng 27 giây nếu không làm sẵn ở nền.
  - Trang mở bằng Edge chạy ngầm với đích thật (chỉ đọc): hiện đúng dòng đích, hai thẻ dịch vụ với bản đang chạy trên máy GCP, không lỗi JavaScript.
  - Gặp thật trong lúc thử: mạng của máy làm việc rớt DNS một lúc thì trang báo "không đọc được trạng thái từ máy đích" kèm lý do; ssh của Windows từ chối tệp khóa vì quyền quá rộng, dùng BSN_SSH trỏ tới ssh của Git thì chạy.
  - Chưa kiểm: người dùng tự bấm trên trình duyệt với đích thật (đang chờ nghiệm thu); bảng điều khiển chạy trên Linux; hai người cùng dùng; máy đích tắt bật lại trong lúc bảng điều khiển đang chạy (mới có test với ssh giả).
- tasks:
