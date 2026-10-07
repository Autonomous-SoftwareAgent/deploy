<!-- GENERATED từ docs/service.yaml bằng bsn-docs. Không sửa tay; ghi nguồn bằng service_doc_set / problem_record. -->
# Nền deploy và vận hành (repo deploy) (infra)

Nền dùng chung đưa một commit của bất kỳ dịch vụ nào thành bản đóng gói và chạy nó: dịch vụ khai commit muốn chạy, GitHub đóng gói sau khi test qua, rồi người hoặc agent đưa bản lên bằng dòng lệnh hoặc bảng điều khiển web của repo này. Bản không khỏe thì bản trước tự chạy lại. Đích là máy đang chạy lệnh; mô hình hai máy trên GCP chưa làm.

Cập nhật: 2026-10-07. Bản cho người đọc: BSN_/docs/portal/infra/index.html (sinh từ cùng nguồn).

## Nghiệp vụ

Mục tiêu: Mọi dịch vụ lên bản mới và quay lui theo cùng một cách, không phụ thuộc người nào nhớ các bước: thứ chạy luôn là một commit đã được khai rõ và đã qua test, bản hỏng thì tự quay về bản trước, và thêm dịch vụ mới không phải sửa nền.

Người dùng và nhu cầu:
- Phiên Claude của một dịch vụ (hoặc người viết dịch vụ): Khai commit mình muốn chạy vào tờ khai báo của mình và có bản đóng gói đúng commit đó, không cần nhờ ai
- Người vận hành (DevOps): Mở bảng điều khiển, thấy dịch vụ nào muốn chạy bản nào và đang chạy bản nào; bấm Deploy để đưa bản lên và Rollback để lùi lại
- Agent vận hành: Làm mọi thao tác bằng lệnh hoặc đường gọi JSON và đọc kết quả có mã rõ ràng; biết ranh giới việc nào tự làm, việc nào chờ người duyệt

Giá trị mang lại:
- Bản đang chạy truy được về đúng một commit: nhãn bản là mã commit, không dùng latest
- Phần sửa dở trong thư mục làm việc không bao giờ lọt vào bản: build chỉ lấy từ commit được ghim
- Chỉ commit được khai mới sinh bản, và chỉ sau khi test của dịch vụ qua
- Bí mật không lên kho công khai: bản được quét trước khi đẩy
- Bản không khỏe không ở lại: deploy tự bật lại bản đang chạy trước đó và báo lỗi
- Luôn thấy chỗ lệch giữa bản dịch vụ muốn và bản đang chạy: tờ khai báo và sổ deploy là hai thứ riêng
- Nút deploy không nằm trên GitHub của một repo công khai: chỉ người vào được máy quản trị và có mật khẩu mới đưa bản lên được
- Hai người không deploy chồng lên nhau cùng một dịch vụ; dịch vụ khác nhau thì lên song song
- Bảng điều khiển hỏng hay đang cập nhật không làm dừng dịch vụ nào và không cắt ngang lần đưa lên đang chạy
- Thêm dịch vụ mới là thêm một tờ khai báo và hai tệp nhỏ trong repo dịch vụ

Luồng len-ban-moi: Lên bản mới của một dịch vụ (khai báo trước, build sau)
1. Dịch vụ commit mã ở máy và chạy test của nó
2. Dịch vụ ghim commit đó vào tờ khai báo của mình (lệnh pin), commit và đẩy repo deploy
3. Dịch vụ đẩy mã lên nhánh main của repo mình
4. GitHub chạy job test của dịch vụ
5. Workflow dùng chung so commit đang chạy với commit trong tờ khai báo: trùng thì đóng gói, quét bí mật, đẩy Docker Hub; không trùng thì dừng sau test
6. Bảng điều khiển (hoặc lệnh images) báo bản đã có; nút Deploy của dịch vụ đó mở ra

Luồng day-truoc-khai-sau: Lỡ đẩy mã trước khi khai báo
1. Lần đẩy chỉ chạy test, không có bản
2. Dịch vụ ghim commit, commit và đẩy repo deploy
3. Dịch vụ chạy tay workflow của mình (workflow_dispatch) trên nhánh main
4. Lần này commit trùng tờ khai báo nên được đóng gói

Luồng deploy-qua-bang-dieu-khien: Deploy một dịch vụ từ bảng điều khiển
1. Người vận hành đăng nhập (agent dùng token) và xem thẻ của dịch vụ: commit đã khai, bản đang chạy, đã có bản đóng gói chưa
2. Bấm Deploy và xác nhận; dịch vụ đang có lần đưa lên chạy dở thì bị từ chối
3. Bảng điều khiển giao việc cho một tiến trình riêng chạy đúng lệnh deploy
4. Lệnh kiểm bản đã có trên kho, kéo về, kiểm commit ghi bên trong, bật đúng dịch vụ đó và gọi đường kiểm sức khỏe
5. Khỏe thì sổ deploy ghi bản đang chạy và bản liền trước; trang hiện việc thành công kèm nhật ký
6. Không khỏe thì bản đang chạy trước đó tự được bật lại, sổ ghi lần hỏng, trang hiện việc hỏng; tờ khai báo không bị sửa

Luồng quay-lui: Quay lui về bản trước
1. Người vận hành chọn một bản đã từng chạy khỏe ở đây (mặc định là bản liền trước) và bấm Rollback, hoặc gõ lệnh rollback
2. Commit chưa từng chạy khỏe trên đích này thì từ chối
3. Bản không còn ở máy và không còn trên Docker Hub thì từ chối
4. Bật bản đó và gọi đường kiểm sức khỏe
5. Khỏe thì ghi commit đó vào tờ khai báo ở máy; người vận hành commit và đẩy repo deploy để tờ trên GitHub khớp

Luồng chay-ca-he: Chạy cả hệ trên một máy
1. Lệnh up sinh mật khẩu của máy đó nếu chưa có
2. Bật tầng dùng chung: PostgreSQL và broker, chờ khỏe
3. Tạo cơ sở dữ liệu và topic mà từng dịch vụ khai
4. Lấy bản của commit được ghim: kéo bản CI (--pull) hoặc build tại chỗ từ đúng commit đó
5. Chạy các dịch vụ trên mạng chung, mỗi dịch vụ một cổng từ 8000, rồi chờ đường kiểm sức khỏe trả lời; khỏe thì ghi vào sổ deploy

Luồng don-ban-cu: Dọn bản cũ trên Docker Hub
1. Mỗi tuần workflow prune liệt kê nhãn main-<commit> của từng dịch vụ
2. Giữ số bản mới nhất ghi trong platform.json, cùng bản đang ghim và bản ghim liền trước
3. Xóa các bản còn lại; nhãn không theo khuôn của nền thì không đụng

Ngoài phạm vi:
- Mã, test và Dockerfile của dịch vụ
- Job test trong workflow của dịch vụ
- Bộ công cụ Claude (harness)
- Quyết định dịch vụ nào chạy commit nào: đó là của từng dịch vụ; bảng điều khiển không cho chọn commit để deploy
- Lùi dữ liệu: deploy và rollback chỉ đổi bản chương trình, dữ liệu trong cơ sở dữ liệu không lùi theo

CHƯA kiểm với hệ thống thật:
- Mô hình hai máy (máy quản trị điều khiển máy chạy thật): chưa có mã. Mới thử một máy tự chạy lệnh cho chính nó (máy làm việc, và một máy thử GCP)
- Bảng điều khiển chưa chạy trên máy chủ nào và chưa được đóng gói; cách vào từ xa (đường hầm SSH) chưa làm
- Người dùng thật chưa bấm trên trình duyệt với hệ thật: trình duyệt mới được thử ở chế độ bộ nhớ, hệ thật mới được thử qua đường gọi JSON
- Rollback qua bảng điều khiển ghi lại tờ khai báo ở máy nhưng chưa tự đẩy lên GitHub
- Máy chủ vẫn phải có repo của dịch vụ để lấy tệp cấu hình và build đồ giả lập; cấu hình và mật khẩu là loại dùng cho local
- Chưa có bước người duyệt trước khi lên máy chạy thật
- Trường hợp bật lại bản cũ cũng hỏng mới có test với Docker giả, chưa gặp thật
- Bộ nối thật gọi lệnh docker đồng bộ: lúc bảng điều khiển đọc trạng thái, máy chủ web đứng trong vài trăm mili giây tới vài giây (khi hỏi kho bản); chưa đo trên máy chủ
- Cửa vào trên cloud có TLS và chia đường theo cloud.route: chưa làm; cloud.route của mọi dịch vụ đang để trống
- Sao lưu và khôi phục PostgreSQL và sổ deploy trên máy chủ: chưa làm
- Workflow prune chưa chạy lần nào trên GitHub; chế độ strict của lệnh images và của workflow pins mới có test ở máy
- Bước dùng lại lớp khi build mới đo với một bản không đổi mã; chưa đo với một commit sửa mã thật
- Quay lui về một commit cũ mà bản đã bị dọn, và đóng gói một commit không nằm ở đầu nhánh main: workflow chưa làm được
- Nền chưa kiểm được workflow của dịch vụ có khai needs: test trước job image hay không
- Tầng dùng chung dùng một tài khoản PostgreSQL cho mọi dịch vụ; production phải tách tài khoản

## Kiến trúc kỹ thuật

Một dịch vụ thuần Node (chỉ thư viện có sẵn) gồm dòng lệnh, máy chủ web và giao diện, cùng bốn workflow GitHub Actions. Mã chia bốn lớp phụ thuộc một chiều: domain (luật thuần), application (ca sử dụng nói chuyện với bên ngoài qua cổng), infrastructure (bộ nối thật và bộ nối trong bộ nhớ cho từng cổng), interfaces (cli, http, web); một tệp duy nhất lắp ráp. Ranh giới do test quét lệnh nhập giữ. Dữ liệu duy nhất về từng dịch vụ là tờ khai báo JSON của nó; mã không chứa tên dịch vụ nào. Đích của deploy và rollback là máy đang chạy lệnh; mô hình hai máy chưa có. Thiết kế đầy đủ: docs/agent/ARCHITECTURE.md.

Lớp:
- khai-bao (Tờ khai báo (dữ liệu)): Mỗi dịch vụ một tệp do chính nó ghi (commit, cổng, cơ sở dữ liệu, topic, tên biến bí mật) và cấu hình chung của nền [services/, platform.json]
- domain (Domain: luật thuần): Luật của tờ khai báo, cách đặt tên bản, sổ deploy như một giá trị, quyết định deploy và rollback, mô tả chạy. Không nhập module nào ngoài chính lớp này [src/domain/]
- application (Application: ca sử dụng và cổng): Mỗi ca sử dụng một tệp, nhận đúng các cổng nó cần, trả kết quả chứ không in và không thoát. ports.js khai mọi cổng [src/application/]
- infrastructure (Infrastructure: bộ nối): Bộ nối thật (docker, git, tệp, HTTP, tiến trình con) và bộ nối trong bộ nhớ cho từng cổng; hai loại qua cùng một bộ test hợp đồng [src/infrastructure/]
- interfaces (Interfaces: dòng lệnh, máy chủ web, giao diện): Ba cửa vào cùng gọi các ca sử dụng: lệnh bsn.js, máy chủ web chỉ nghe trên 127.0.0.1, và trang cho trình duyệt [src/interfaces/, bsn.js]
- lap-rap (Nơi lắp ráp): Tệp duy nhất tạo bộ nối và lắp vào ca sử dụng, cho đích là máy này hoặc cho chế độ trong bộ nhớ [src/composition.js]
- ci (Tệp phụ và workflow của CI): Chạy trên máy của GitHub: quyết định có đóng gói không, quét bí mật, dọn bản cũ. Không còn workflow deploy hay rollback [ci/, .github/workflows/]
- may (Tầng dùng chung và chuẩn bị máy): PostgreSQL, broker và mạng chung của một đích; tệp chuẩn bị một máy Ubuntu [local/docker-compose.yml, server/]

Thành phần:
- to-khai-bao (Tờ khai báo của dịch vụ) @khai-bao: Nơi duy nhất ghi dịch vụ muốn chạy commit nào và cần gì để chạy; tên tệp là tên dịch vụ [services/]
- cau-hinh-nen (Cấu hình chung của nền) @khai-bao: Tổ chức GitHub, tài khoản Docker Hub, tiền tố tên kho, nhánh được đóng gói, số bản giữ lại [platform.json]
- luat-khai-bao (Luật của tờ khai báo và cách đặt tên) @domain: validate (trùng cổng, commit sai dạng, nhãn latest, repo thoát ra ngoài), tên bản ở máy và trên kho, commit đọc từ nhãn của bản [src/domain/declaration.js, src/domain/naming.js]
- luat-deploy (Luật deploy và rollback) @domain: Từ chối, không đổi, hay chuyển bản; lùi về đâu; hỏng thì bật lại bản nào; các kết quả có tên [src/domain/deploy-policy.js, src/domain/outcome.js]
- so-deploy (Sổ deploy như một giá trị) @domain: Bản đang chạy, bản liền trước, 50 lần đưa lên gần nhất, kiểm số phiên bản của sổ [src/domain/ledger.js]
- mo-ta-chay (Mô tả chạy của dịch vụ) @domain: composeFor, serviceEnv: cổng, nhãn, địa chỉ cơ sở dữ liệu và broker do nền cấp [src/domain/stack-plan.js]
- cong (Các cổng) @application: Declarations, Source, ConfigFiles, Runtime, Registry, SharedTier, Secrets, Ledger, Locks, Health, Clock, Credentials, Hasher, Random, JobExecutor [src/application/ports.js]
- ca-deploy (Ca sử dụng deploy, rollback và khung chuyển bản) @application: Bật đúng một commit, chờ khỏe, hỏng thì bật lại bản trước, ghi sổ; khóa theo dịch vụ [src/application/deploy.js, src/application/rollback.js, src/application/switch-version.js, src/application/service-lock.js]
- ca-he (Ca sử dụng chạy cả hệ và xem trạng thái) @application: check, pin, build và kéo bản, bật và tắt cả hệ, trạng thái, bản trên kho [src/application/check.js, src/application/pin.js, src/application/images.js, src/application/stack.js, src/application/prepare-tier.js, src/application/get-status.js, src/application/get-images.js]
- ca-bang-dieu-khien (Ca sử dụng của bảng điều khiển) @application: Trang trạng thái gộp, nhận yêu cầu Deploy và Rollback, sổ việc, đăng nhập [src/application/console.js, src/application/jobs.js, src/application/auth.js]
- bo-noi-that (Bộ nối thật) @infrastructure: Tệp (tờ khai báo, sổ, khóa, bí mật), git, docker, kho bản, tầng dùng chung, kiểm sức khỏe, tiến trình con tách rời cho từng việc [src/infrastructure/]
- bo-noi-bo-nho (Bộ nối trong bộ nhớ) @infrastructure: Cùng các cổng trên một đối tượng dữ liệu mẫu; cho test và cho bảng điều khiển chạy với --memory [src/infrastructure/memory/]
- dong-lenh (Dòng lệnh bsn.js) @interfaces: check, status, images, pin, build, up, down, deploy, rollback, console; mỗi lệnh một tệp; lệnh làm thay đổi mặc định chỉ in kế hoạch [bsn.js, src/interfaces/cli/]
- may-chu-web (Máy chủ web của bảng điều khiển) @interfaces: Bảng định tuyến, chuỗi lớp chặn (tên máy, header bảo vệ, đăng nhập, chống giả mạo, đọc JSON), ba bộ điều khiển [src/interfaces/http/]
- giao-dien (Giao diện trên trình duyệt) @interfaces: Thẻ dịch vụ, nút Deploy và Rollback có hỏi lại, lịch sử, danh sách việc; không có bước build [src/interfaces/web/]
- lap-rap (Nơi lắp ráp) @lap-rap: localPorts, memoryPorts, assemble, buildLocalConsole, buildMemoryConsole [src/composition.js]
- quyet-dinh-dong-goi (Quyết định đóng gói) @ci: Chỉ đóng gói khi commit đang chạy trùng commit trong tờ khai báo, trên nhánh main, và repo đúng tên dịch vụ [ci/decide.js]
- quet-bi-mat (Quét bí mật trong bản) @ci: Tìm token có khuôn rõ, tệp .env, tệp khóa, thư mục .git, biến ENV/ARG mang giá trị bí mật; không in giá trị [ci/scan-image.js]
- don-ban (Dọn bản cũ) @ci: Giữ N bản mới nhất, bản đang ghim và bản ghim liền trước; mặc định chỉ in kế hoạch [ci/prune-images.js]
- workflow (Workflow) @ci: service-image (dùng chung cho mọi dịch vụ), ci (test), pins (bản đã có chưa), prune (dọn theo lịch) [.github/workflows/service-image.yml, .github/workflows/ci.yml, .github/workflows/pins.yml, .github/workflows/prune.yml]
- tang-dung-chung (Tầng dùng chung) @may: PostgreSQL 17 (mỗi dịch vụ một cơ sở dữ liệu), Redpanda 25.1.7 nói giao thức Kafka, mạng bsn-local [local/docker-compose.yml]
- chuan-bi-may (Chuẩn bị máy chủ) @may: setup.sh cài Docker, Node, git và lấy các repo về /opt/bsn; sync.sh lấy bản mới của repo dịch vụ [server/setup.sh, server/sync.sh]

Phụ thuộc vào:
- GitHub (external, qua GitHub Actions; tổ chức Autonomous-SoftwareAgent; lệnh gh): Chạy workflow test và đóng gói; giữ repo deploy và repo các dịch vụ; giữ secret DOCKERHUB_USERNAME và DOCKERHUB_TOKEN ở cấp tổ chức. Không còn là nơi ra lệnh deploy
- Docker Hub (external, qua docker push, docker pull, docker manifest inspect; API liệt kê và xóa nhãn): Kho bản đóng gói công khai, mỗi dịch vụ một kho svc-<dịch-vụ>
- GCP (external, qua Dự án ai-sdlc-bsn; một máy thử e2-small đang tắt): Nơi sẽ đặt máy quản trị và máy chạy thật
- Docker trên máy chạy lệnh (infra, qua lệnh docker và docker compose): Build bản, chạy cả hệ, và là đích của deploy và rollback
- Repo git của từng dịch vụ (service, qua git archive trên repo ở system_service/<dịch-vụ>): Lấy đúng commit được ghim để build và lấy tệp cấu hình

Cung cấp cho:
- Mọi dịch vụ (qua Workflow Autonomous-SoftwareAgent/deploy/.github/workflows/service-image.yml@main và tệp bsn.ci.json ở gốc repo dịch vụ): Đóng gói, quét bí mật và đẩy bản của commit đã khai
- Mọi dịch vụ (qua Khuôn tờ khai báo services/<dịch-vụ>.json và lệnh pin): Khai commit muốn chạy và thứ cần để chạy
- Người vận hành và agent (qua Lệnh node infra/bsn.js (check, status, images, deploy, rollback có --json)): Xem trạng thái, chạy cả hệ, đưa bản lên và lùi lại
- Người vận hành (qua Bảng điều khiển web: node infra/bsn.js console, http://127.0.0.1:8900): Xem trạng thái từng dịch vụ, bấm Deploy và Rollback, xem lịch sử
- Agent vận hành (qua Đường gọi JSON của bảng điều khiển (/api/state, /api/services/<tên>/deploy|rollback, /api/jobs/<mã>) với token): Cùng việc như người vận hành, qua HTTP
- Harness (qua Cây đã commit của repo deploy (services/)): Kho ngữ nghĩa và bản đồ cả hệ đọc danh sách dịch vụ, cổng, topic

Loại sơ đồ không áp dụng:
- erd: Nền deploy không có cơ sở dữ liệu của riêng nó: dữ liệu của nó là các tờ khai báo JSON trong git và một sổ deploy dạng tệp JSON trên đích. PostgreSQL ở tầng dùng chung là của các dịch vụ, nền chỉ tạo cơ sở dữ liệu rỗng cho chúng.

Quyết định liên quan:
- S-017: Triển khai theo commit được ghim
- S-018: Tầng dùng chung ở local, broker Redpanda
- S-019: Dùng GitHub và GitHub Actions
- S-020: Dự án GCP ai-sdlc-bsn
- S-023: Nền dùng chung, tờ khai báo theo dịch vụ, Docker Hub công khai, hai máy
- S-026: Repo công khai, địa chỉ ẩn danh trong commit
- S-028: Tách repo deploy và repo harness
- S-029: Khai báo commit trước, build sau; không tự build
- D-001: Không dùng thư viện ngoài
- D-002: Nhận ra thư mục infra bằng vị trí của tệp mã
- D-003: Bước test ở lại workflow của dịch vụ
- D-004: Quét bí mật bằng tệp tự viết
- D-005: Dùng lại lớp bằng thông tin đệm ghi kèm trong bản
- D-006: Sổ deploy tách khỏi tờ khai báo; deploy hỏng không sửa tờ khai báo
- D-007: Một dịch vụ bốn lớp có máy chủ web và giao diện; bỏ nút bấm trên GitHub

## Vấn đề và tinh chỉnh

Đã xong:
- Chạy cả hệ từ commit được ghim: lệnh check, status, pin, build, up, down (S-017, S-018)
- Tờ khai báo tách theo dịch vụ, platform.json, lệnh images và --json (S-023)
- Workflow dùng chung đóng gói, quét bí mật và đẩy Docker Hub; workflow ci, pins, prune (S-023)
- Dự án GCP ai-sdlc-bsn có gắn thanh toán và cảnh báo ngân sách (S-020)
- Repo deploy công khai, tách khỏi repo harness; chạy được khi đứng một mình trên máy của GitHub (S-026, S-028)
- Khai báo trước, build sau: đã chạy thật với hai dịch vụ theo cả hai chiều; dùng lại lớp khi build (S-029)
- Tài liệu theo chuẩn harness và trang trên cổng (S-030)
- Lệnh deploy và rollback: từ chối commit chưa có bản, kiểm sức khỏe, tự bật lại bản trước, sổ deploy; đã thử thật trên hệ local và trên một máy thử GCP, kể cả với bản cố ý làm hỏng
- Tệp chuẩn bị máy chủ (server/setup.sh): một máy Ubuntu mới tinh chạy được cả hệ bằng lệnh bsn.js
- Chuyển toàn bộ mã sang bốn lớp (domain, application, infrastructure, interfaces) với một nơi lắp ráp; ranh giới do test giữ; bộ nối thật và bộ nối trong bộ nhớ qua chung bộ test hợp đồng (D-007)
- Bảng điều khiển web thay cho nút bấm trên GitHub: đăng nhập, trạng thái, Deploy, Rollback, khóa theo dịch vụ, việc chạy tách rời khỏi bảng điều khiển; đã thử trình duyệt thật ở chế độ bộ nhớ và hệ local thật qua đường gọi JSON (D-007)

Tiếp theo:
- Đóng gói bảng điều khiển: Dockerfile, workflow test rồi đẩy bản theo luật khai báo trước build sau, lệnh cập nhật bảng điều khiển
- Workflow dùng chung được dịch vụ gọi theo nhãn phiên bản thay vì nhánh main, để sửa repo deploy không làm hỏng việc đóng gói của mọi dịch vụ
- Hai máy trên GCP: máy quản trị chạy bảng điều khiển, máy chạy thật chạy hệ; vào giao diện qua đường hầm SSH (cần người dùng duyệt từng thứ tính tiền)
- Sẵn sàng chạy thật: cấu hình và bí mật thật trên máy chạy thật, máy chủ không cần repo dịch vụ, bước người duyệt trước khi lên, sao lưu sổ deploy
- Vận hành: sao lưu và khôi phục thử, nhật ký, cảnh báo
- Thêm dịch vụ thứ ba mà không sửa repo này

Vấn đề chưa xong (5):
- P-001 [refining, high] Chưa có hệ chạy thường trực trên máy chủ: mới thử trên một máy thử, mô hình hai máy chưa có (phát hiện 2026-10-07)
  Vấn đề: Lệnh deploy và rollback đã chạy đúng trên hệ local và trên một máy thử GCP (lệnh chạy ngay trên máy đó), và bảng điều khiển web đã có. Nhưng chưa có máy nào chạy thường trực: máy thử đang tắt; máy chủ vẫn phải có repo của dịch vụ để lấy tệp cấu hình và build đồ giả lập; cấu hình và mật khẩu là loại dùng cho local; bảng điều khiển chỉ nghe trên 127.0.0.1 của máy nó chạy và chưa được đóng gói. Hệ quả: chưa dịch vụ nào nhận được yêu cầu thật của khách hay của cổng thanh toán.
  Tinh chỉnh: 2026-10-07: (1) lệnh deploy và rollback, thử thật ở local. (2) Máy thử GCP e2-small: server/setup.sh dựng máy mới tinh, cả hệ khỏe sau 2 phút 9 giây, deploy, bản hỏng tự lùi và rollback đều chạy; lộ ra rằng chờ khỏe 25 giây là quá ngắn cho máy nhỏ. (3) Người dùng đổi hướng: bỏ nút bấm trên GitHub, deploy từ bảng điều khiển web của repo này; mã chuyển sang bốn lớp (D-007). Còn lại: đóng gói bảng điều khiển, hai máy trên GCP, cấu hình và bí mật thật, bước người duyệt.
  Tham chiếu: S-017, S-023, D-007, DEP-S-001, BDK-S-001, src/application/switch-version.js:22, ROADMAP.md
- P-002 [open, medium] Không build lại được commit cũ đã bị dọn bản, hay commit không nằm ở đầu nhánh (phát hiện 2026-10-07)
  Vấn đề: Workflow dùng chung chỉ đóng gói commit ở đầu nhánh main của lần chạy. Nếu một dịch vụ muốn lùi về một commit cũ mà bản của nó đã bị workflow prune xóa, hoặc khai một commit nằm giữa lịch sử, thì không lần chạy nào đóng gói nó. Hệ quả: lúc sự cố có thể không lùi được về bản mong muốn. Giảm nhẹ hiện có: bản đang ghim và bản ghim liền trước không bao giờ bị dọn.
  Tinh chỉnh: Chưa xử lý. Hướng: cho workflow của dịch vụ nhận một mã commit khi chạy tay và checkout đúng commit đó cho cả job test lẫn job image.
  Tham chiếu: S-029, ci/decide.js:40, ci/prune-images.js:17
- P-003 [open, medium] Bộ quét bí mật chỉ bắt các dạng thường gặp (phát hiện 2026-10-07)
  Vấn đề: Kho Docker Hub công khai, nên bí mật lọt vào một bản là lộ hẳn, kể cả sau khi xóa bản. ci/scan-image.js chỉ tìm token có khuôn rõ (Docker Hub, GitHub, AWS, Google, Slack, khóa PEM), tệp .env, tệp khóa, thư mục .git và biến ENV/ARG tên như bí mật; nó bỏ qua thư mục thư viện và thư mục hệ thống của ảnh nền. Bí mật dạng khác (mật khẩu thường trong tệp cấu hình, token của nhà cung cấp lạ) không bị bắt. Chưa có quét lỗ hổng và chưa ký bản.
  Tinh chỉnh: Đã chạy bộ quét trên các bản thật của hai dịch vụ, không thấy gì trong các dạng được kiểm. Lớp chặn chính vẫn là .dockerignore và Dockerfile của từng dịch vụ.
  Tham chiếu: D-004, ci/scan-image.js:13, ci/scan-image.js:22
- P-004 [open, medium] Nền không kiểm được dịch vụ có chạy test trước khi đóng gói (phát hiện 2026-10-07)
  Vấn đề: Ý "bản chỉ sinh ra sau khi test qua" dựa vào dòng needs: test trong workflow của dịch vụ. Workflow dùng chung không nhìn thấy job test của bên gọi, nên một dịch vụ bỏ dòng đó vẫn được đóng gói. Hệ quả: một bản chưa qua test có thể được khai và chạy.
  Tinh chỉnh: Chưa xử lý. Hiện giữ bằng mẫu workflow trong skill cicd và bằng việc xem lại khi nối dịch vụ mới. Hướng: bước quyết định đọc workflow của dịch vụ và từ chối khi job image không có needs.
  Tham chiếu: D-003, .github/workflows/service-image.yml:7
- P-005 [open, low] Lên bản mới phụ thuộc thứ tự thao tác (phát hiện 2026-10-07)
  Vấn đề: Theo luật khai báo trước, build sau, quên ghim hoặc quên đẩy repo deploy trước khi đẩy mã thì lần chạy chỉ có test, không có bản; phải ghim rồi chạy tay workflow. Người hay agent không đọc nhật ký sẽ tưởng đã có bản. Lệnh images báo CHỜ BUILD nhưng không tự làm gì.
  Tinh chỉnh: Nhật ký của bước quyết định nêu rõ lý do và cách xử lý; phần tóm tắt của lần chạy trên GitHub cũng ghi. Đã thử thật cả hai chiều với hai dịch vụ ngày 2026-10-07.
  Tham chiếu: S-029, ci/decide.js:40
