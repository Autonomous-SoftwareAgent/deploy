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

## BDK-S-003: Bảng điều khiển theo môi trường: tổng quan, chi tiết dịch vụ, kiểm tra trước, lần chạy nhiều dịch vụ (theo bản design của người dùng)
- from: BDK-D-003
- derived_from: 68ded374
- status: ready
- requirement:
  - Môi trường: local cùng mọi targets/<tên>.json hợp lệ; tờ sai thì bỏ qua đích đó và báo trên trang. Một môi trường không trả lời không làm hỏng các môi trường khác (ô của nó ghi "không hỏi được").
  - Sức khỏe của một ô: đang có lần đưa lên chạy dở thì deploying; không chạy mà sổ ghi đã deploy thì failed; trạng thái container có unhealthy thì failed, có starting thì deploying; còn lại healthy; không chạy và sổ trống thì chưa deploy. Chưa có trạng thái degraded vì chưa có nguồn số đo.
  - Lệch phiên bản: số commit trong lịch sử từ bản đang chạy (không tính) tới commit đã khai (có tính); không thấy trong lịch sử thì 0 và đánh dấu "khác bản đã khai".
  - Tổng quan: nhóm theo project (thiếu thì "Chưa xếp nhóm"); điểm ưu tiên = 1000 x số ô hỏng + 500 x số ô đang đưa lên + min(tổng lệch, 99); lọc theo nhóm, môi trường, trạng thái, tên hoặc lời nhắn commit; số tổng tính trên mọi dịch vụ, không theo bộ lọc.
  - Chi tiết dịch vụ: từng môi trường, lịch sử commit kèm "đã có bản" (theo nhãn trên kho) và "đang chạy ở đâu", dòng thời gian deploy gộp từ sổ của mọi môi trường.
  - Kiểm tra trước, mỗi mục: từ bản nào sang bản nào, các commit ở giữa và hướng, gợi ý; mã chặn ENV_UNREACHABLE, NOT_IN_ENVIRONMENT, COMMIT_UNKNOWN, ALREADY_RUNNING, BUILD_NOT_READY, NOTHING_TO_ROLLBACK, ROLLBACK_TARGET_NEWER, NEVER_RAN_HERE, RUN_IN_PROGRESS; cảnh báo DEPLOY_OLDER_COMMIT, NOT_IN_HISTORY, BUILD_UNKNOWN. Không ghi gì.
  - Lần chạy: máy chủ kiểm tra lại; có mục bị chặn thì không mục nào chạy; mỗi mục chạy bằng đúng lệnh điều khiển của môi trường đó; bước fetch, start, health, record; bản mới hỏng mà bật lại bản cũ được thì mục là rolled_back, không thì failed; log có số thứ tự để trang hỏi dần; giữ 30 lần chạy gần nhất trong bộ nhớ.
  - Lệnh deploy <dịch-vụ> [commit]: đưa đúng commit đó lên nếu đã có bản; không sửa tờ khai báo. --json --events in từng dòng {event:'step',step,status,phase} và {event:'log',text}; dòng cuối vẫn là kết quả.
- contract:
  GET /api/v1/overview?projectId=&environmentId=&status=&q= ; GET /api/v1/environments ; GET /api/v1/services/{id} ; POST /api/v1/deployments/preflight {kind, environmentId, items:[{serviceId, targetSha?}]} ; POST /api/v1/deployments (cùng thân; 201 {runId, run}) ; GET /api/v1/runs?status=active ; GET /api/v1/runs/{id} ; GET /api/v1/runs/{id}/logs?after=<seq> ; POST /api/v1/runs/{id}/cancel (luôn 409 NOT_CANCELLABLE).
  Lỗi: {error:{code, message, details}} với 400 BAD_INPUT, 404 UNKNOWN_SERVICE hoặc UNKNOWN_ENVIRONMENT hoặc NOT_FOUND, 409 RUN_IN_PROGRESS, 422 BLOCKED (details.preflight), 502 INVALID_DECLARATIONS. Mọi đường cần đăng nhập như các đường /api cũ.
  Dạng trả về theo design/deploy-console.api.md mục 5.1, 5.3, 5.4, với các trường chưa có nguồn bị bỏ (metrics, migration, dependents, protection, approval).
  Cổng: Source.log(repo, limit), Registry.tags(repository), JobExecutor.run(job, {onEvent}).
- acceptance:
  - test/fleet.test.js: luật sức khỏe, lệch phiên bản, điểm ưu tiên; mọi mã chặn và cảnh báo của kiểm tra trước; máy trạng thái của một mục; các đường /api/v1 trên hai môi trường trong bộ nhớ (cột theo danh sách môi trường, bộ lọc, 401 khi chưa đăng nhập, chi tiết dịch vụ, kiểm tra trước không đổi gì, deploy hai dịch vụ một lượt với một bản hỏng tự lùi, chỉ môi trường được chọn bị đổi, 422 tất cả hoặc không, 409 khi đang chạy dở, cùng dịch vụ ở môi trường khác chạy song song, hủy bị từ chối).
  - test/deploy.test.js: deploy commit được chọn, tiền tố, commit chưa có bản, mã sai; thứ tự sự kiện bước khi thành công và khi bản mới không khỏe; Source.log trên repo thật.
  - test/job-executor.test.js và test/remote.test.js: ba bộ chạy việc báo dần sự kiện, không báo lặp.
  - Đã chạy thật ngày 2026-10-08: giao diện mở bằng Edge chạy ngầm ở chế độ bộ nhớ, đi hết các màn, không lỗi JavaScript; bảng điều khiển ở máy làm việc đọc đúng trạng thái của hai môi trường thật (máy làm việc và một máy GCP).
  - Chưa kiểm: deploy thật qua /api/v1 trên hệ thật; người dùng tự bấm trên trang; đích từ xa nhận deploy theo commit (máy GCP còn bản lệnh cũ); giao diện chưa có test tự động.
- tasks:

## BDK-S-004: An toàn và cấu hình của bảng điều khiển: vai trò, cổng an toàn do máy chủ kiểm, người thứ hai duyệt, cấu hình có phiên bản, sổ thao tác
- from: BDK-D-004
- derived_from: ad9fd4ee
- status: ready
- requirement:
  1. Chỉ /healthz mở; mọi đường khác đòi token của agent hoặc tên và mật khẩu kiểu HTTP Basic, chưa có thì trả 401 kèm WWW-Authenticate. Sai 5 lần thì khóa tạm một phút (429). Lệnh ghi của người phải có header x-bsn-console và đúng Origin.
  2. Admin và DevOps tạo, đổi vai trò, sinh lại mật khẩu, xóa người dùng; mật khẩu sinh ngẫu nhiên, chỉ trả một lần, nơi lưu và sổ thao tác không giữ bản rõ.
  3. Một yêu cầu deploy hay rollback bị chặn khi vai trò không đủ mức ở môi trường, khi môi trường giới hạn theo tên và người gọi không có trong danh sách, hoặc khi đang trong khung giờ khóa. Môi trường đòi gõ tên thì yêu cầu phải kèm đúng tên dịch vụ (nhiều dịch vụ: tên môi trường). Môi trường đòi duyệt thì yêu cầu nằm chờ; người duyệt phải khác người gửi và có mức 2; duyệt xong thì kiểm tra trước chạy lại rồi mới chạy.
  4. Cấu hình lưu theo phiên bản kèm ai, lúc nào, ghi chú; lưu phải kèm số phiên bản đang sửa; xem trước nêu thay đổi và lỗi; khôi phục và về mặc định cũng là một phiên bản mới.
  5. Sổ thao tác chỉ thêm: yêu cầu được chạy, chờ duyệt, bị từ chối, duyệt, từ chối duyệt, đổi cấu hình, đổi người dùng.
  6. Ánh xạ nhánh (mặc định theo nhóm, riêng theo dịch vụ, quy tắc theo mẫu) lưu và thử được, không tự chạy gì.
  7. Mọi chữ trên giao diện là tiếng Anh và nằm ở text.js, text-config.js.
- contract: Đường gọi: GET /api/v1/me; GET, PUT /api/v1/config; POST /api/v1/config/preview, restore, reset; GET /api/v1/branches/matrix; POST /api/v1/branches/test; GET, POST /api/v1/users; PATCH, DELETE /api/v1/users/{tên}; POST /api/v1/users/{tên}/password; GET /api/v1/approvals; POST /api/v1/approvals/{mã}/approve, reject; GET /api/v1/audit; GET /api/v1/services/{tên}/logs. POST /api/v1/deployments nhận thêm confirmation, trả 201 (chạy), 202 (chờ duyệt), 422 (BLOCKED, CONFIRMATION_REQUIRED). Kết quả kiểm tra trước có gate: {blockers: [{code, message}], confirmation, approval}; mã chặn: FORBIDDEN, NOT_ALLOWED_USER, FREEZE_WINDOW. Lỗi khác: 403 FORBIDDEN, 409 CONFLICT, 404 NOT_FOUND. Cổng mới: ConfigStore (load, save), AuditLog (append, list), Runtime.logs. Tệp: local/.run/console.config.json, local/.run/console.audit.jsonl.
- acceptance: test/safety.test.js và test/http.test.js qua: vai trò không đủ mức bị chặn ở kiểm tra trước, ở lúc chạy và ở đường /api cũ; thiếu hay sai tên xác nhận thì 422; trong giờ khóa thì chặn cả admin; yêu cầu ở môi trường đòi duyệt trả 202, người gửi và người mức 1 không duyệt được, duyệt xong mới đổi bản đang chạy, từ chối thì không đổi; lưu cấu hình lệch phiên bản trả 409; nơi lưu và sổ thao tác không chứa mật khẩu; mật khẩu đã qua kiểm không tốn thêm lần băm chậm; sai 5 lần trả 429. test/web-text.test.js qua: giao diện không còn câu tiếng Việt.
- tasks:

## BDK-S-005: DB riêng của bảng điều khiển bằng SQLite; bảng điều khiển không phải một service trong hệ
- from: BDK-D-005
- derived_from: 7caaae3c
- status: ready
- requirement:
  1. Mỗi cổng lưu của bảng điều khiển (ConfigStore, AuditLog, Members, approvalStore, runStore, TargetStore, Meta) có bộ nối SQLite và bộ nối trong bộ nhớ, cùng qua một bộ kiểm.
  2. DB tự tạo và tự nâng lược đồ khi mở; lược đồ mới hơn bản đang chạy thì từ chối mở và đóng tệp.
  3. Lưu cấu hình ghi phiên bản mới, bảng phân quyền và bảng mức bảo vệ trong một giao dịch.
  4. Sổ thao tác chỉ thêm; đọc mới trước, có giới hạn, lọc theo người, loại việc, kết quả và chữ.
  5. Thành viên chỉ giữ dạng băm; mật khẩu quản trị và token của agent không nằm trong DB.
  6. Yêu cầu chờ duyệt và lịch sử lần chạy còn nguyên sau khi bảng điều khiển khởi động lại; lần chạy đang dở lúc tắt hiện là interrupted; yêu cầu quá 24 giờ thì hết hạn.
  7. Lần khởi động đầu chép cấu hình, sổ thao tác và người dùng từ các tệp cũ sang DB đúng một lần; tệp cũ không bị xóa.
- contract: Tệp local/.run/console.db (SQLite, WAL). Bảng: config_versions, permissions, environment_protection, audit, members, approvals, runs, targets, meta. Cổng trong application/ports.js: members (list, get, put, remove), approvalStore và runStore (put, recent), targetStore (list, put, remove), meta (get, set), auditLog.list(limit, filter). GET /api/v1/audit nhận actor, action, outcome, q. Lần chạy có thêm trạng thái interrupted.
- acceptance: test/console-db.test.js qua cho cả bộ nối SQLite và bộ nối trong bộ nhớ: phiên bản cấu hình, lọc sổ thao tác (kể cả dấu % là chữ thường), thành viên, kho đối tượng, môi trường do trang thêm; mở lại tệp vẫn còn dữ liệu; giao dịch hỏng không để lại gì; chép từ tệp cũ đúng một lần và giữ thứ tự; duyệt được một yêu cầu sau khi "khởi động lại"; lần chạy dở hiện interrupted. test/safety.test.js vẫn qua: nơi lưu và sổ thao tác không chứa mật khẩu.
- tasks:

## BDK-S-006: Thêm và gỡ môi trường trên trang, kể cả tạo và xóa máy trên GCP
- from: BDK-D-006
- derived_from: 99582402
- status: ready
- requirement:
  1. Thêm môi trường có hai cách: register (khai máy đã có; máy phải trả lời lệnh điều khiển) và create (tạo máy mới trên cloud).
  2. Tạo máy đi qua bốn bước có tiến trình và log: tạo máy, chờ SSH, cài đặt (không lấy repo dịch vụ, không bật hệ), kiểm lệnh điều khiển chạy được. Xong thì môi trường mới có trên Tổng quan mà không phải khởi động lại bảng điều khiển.
  3. Tạo máy phải gõ lại đúng tên; chỉ nhận cỡ máy trong danh sách; mọi trường đi vào dòng lệnh chỉ nhận ký tự an toàn; tên trùng môi trường đang có thì từ chối.
  4. Bước nào hỏng thì môi trường ghi là failed kèm lý do và không có cột mới.
  5. Gỡ phải gõ lại tên; gỡ khỏi bảng điều khiển thì máy còn; xóa máy chỉ với máy do bảng điều khiển tạo; môi trường có sẵn của bảng điều khiển và môi trường khai bằng tệp không gỡ được từ trang.
  6. Chỉ Admin và DevOps thêm, gỡ được; mọi lần (kể cả bị từ chối) vào sổ thao tác.
  7. Bảng điều khiển khởi động lại thì nối lại các môi trường đã sẵn sàng; việc đang dở lúc tắt ghi là failed.
  8. Lệnh status chạy được trên máy chỉ có repo deploy.
- contract: GET /api/v1/environments/managed trả items, operations, options (machineTypes kèm usdPerDay ước tính, zone và configuration mặc định). POST /api/v1/environments nhận mode, name, machineType, zone, instance, configuration, confirmation; trả 202 kèm operation (create) hoặc environment (register); 400, 403, 422 CONFIRMATION_REQUIRED, 502 UNREACHABLE. DELETE /api/v1/environments/{tên} nhận deleteMachine, confirmation. GET /api/v1/environments/operations/{mã}. Cổng Cloud (createInstance, deleteInstance, instanceExists) và SetupScript (read). Lệnh thật: gcloud compute instances create với ubuntu-2404-lts-amd64, đĩa 20GB, nhãn created-by=bsn-console; delete với --delete-disks all. server/setup.sh nhận BSN_SKIP_SERVICE_REPOS=1.
- acceptance: test/provision.test.js qua: luật yêu cầu; đúng dòng lệnh gcloud; chưa gõ tên thì không tạo gì; tạo xong đủ bốn bước, có cột mới, deploy vào đó được; cloud từ chối thì failed và không có cột; gỡ giữ máy và xóa máy; người không đủ quyền nhận 403; nối lại sau khi khởi động lại. test/bsn.test.js qua: status trên máy không có repo dịch vụ. Đã chạy thật 2026-10-08: tạo máy e2-small trên GCP qua bảng điều khiển trong 221 giây, xóa trong 60 giây, gcloud xác nhận máy và đĩa đã mất.
- tasks:

## BDK-S-007: Cập nhật trực tiếp bằng dòng sự kiện chỉ mang tên chủ đề; so sánh commit theo tệp; test giao diện bằng trình duyệt thật
- from: BDK-D-007
- derived_from: 4aac30c8
- status: ready
- requirement:
  1. GET /api/v1/events đòi đăng nhập, trả dòng sự kiện; mỗi sự kiện chỉ là tên một chủ đề (runs, approvals, environments, config), không mang dữ liệu.
  2. Lần chạy đổi bước hay có log, yêu cầu chờ duyệt đổi, việc tạo hay xóa máy có tiến triển, cấu hình được lưu: đều báo chủ đề tương ứng.
  3. Máy chủ tắt được dù còn trang đang nghe.
  4. Trang gom các tin dồn dập thành một lần hỏi lại; mất kết nối thì hỏi định kỳ như trước.
  5. GET /api/v1/services/{tên}/diff trả tệp đổi giữa hai commit kèm số dòng thêm, bớt và tổng; thiếu commit trong lịch sử ở máy chạy bảng điều khiển thì báo NO_HISTORY.
  6. Bộ test có test giao diện bằng trình duyệt thật; không có trình duyệt thì bỏ qua và nói rõ.
- contract: GET /api/v1/events: text/event-stream; dòng "retry: 3000", mỗi tin "data: <chủ đề>", nhịp ": keep-alive" mỗi 25 giây. GET /api/v1/services/{tên}/diff?from=&to= (hai mã commit đủ 40 ký tự) trả {from, to, files: [{path, added, removed}], totals: {files, added, removed}}; tệp nhị phân có added và removed là null; 400 BAD_INPUT, 404 NO_HISTORY hoặc UNKNOWN_SERVICE. Cổng Source có diffStat(repo, from, to). Biến BSN_BROWSER chỉ định trình duyệt cho test, BSN_SKIP_UI=1 tắt test giao diện.
- acceptance: test/fleet.test.js qua: dòng sự kiện đòi đăng nhập, nhận "data: runs" khi có lần chạy, không lộ tên dịch vụ hay mã commit, máy chủ tắt được khi kết nối còn mở; diff trả đúng tệp và tổng, commit lạ là NO_HISTORY. test/ui.test.js qua với Edge chạy ngầm: trang báo đang nhận trực tiếp, ngăn tệp đổi hiện trong hộp thoại, đi hết các màn không lỗi JavaScript.
- tasks:
