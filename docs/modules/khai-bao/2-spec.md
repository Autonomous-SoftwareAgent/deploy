---
module: khai-bao
---
# khai-bao - Spec (tầng 2)

Design được tách thành yêu cầu, contract, tiêu chí nghiệm thu và task. Khung tự sinh từ design; điền qua tool `spec_fill`.

## KHAI-S-001: Mỗi dịch vụ một tờ khai báo do chính nó ghi; nền chỉ đọc và kiểm
- from: KHAI-D-001
- derived_from: 04f801fc
- status: ready
- requirement:
  - loadManifest đọc mọi tệp services/*.json (tên tệp là tên dịch vụ) và platform.json; tệp JSON hỏng thì ném lỗi nêu tên tệp.
  - validate trả danh sách lỗi (rỗng là hợp lệ) cho: tên dịch vụ sai dạng; repo không phải đường dẫn tương đối trong thư mục làm việc; không thấy repo git (bỏ được khi opts.repos là false); commit không đủ 40 ký tự và không phải null; cổng local không phải số nguyên từ 8000 hoặc trùng nhau, kể cả với đồ giả lập; đường kiểm sức khỏe không bắt đầu bằng /; tên biến sai dạng; giá trị env không phải chuỗi; khai database thiếu tên, biến nhận địa chỉ hoặc {db}; tên topic, tên phụ sai dạng; tệp cấu hình có đường dẫn thoát ra ngoài; chuỗi ":latest" ở bất kỳ đâu.
  - validate kiểm platform.json: có github.org, github.platformRepo, registry.namespace; repoPrefix chỉ chữ thường, số, gạch nối; registry.branch phải là main; registry.keep là số nguyên từ 2.
  - saveService chỉ ghi tờ của đúng một dịch vụ, ghi qua tệp tạm rồi đổi tên.
  - reposPresent cho biết máy có repo dịch vụ nào không; check và images dùng nó để bỏ phần kiểm repo trên máy chỉ có repo deploy.
- contract:
  Tờ khai báo services/<dịch-vụ>.json (JSON): repo, commit, build.target, port.local, port.container, health, env, secretEnv (TÊN biến), database {name, urlEnv, urlFormat}, broker.bootstrapEnv, topics, files [{from, to}], aliases, sidecars {<tên>: {target, port, env}}, cloud.route. Bảng nghĩa từng trường: README.md mục "Thêm một dịch vụ".
  platform.json: {schema, github: {org, platformRepo, serviceRepoPrefix}, registry: {namespace, repoPrefix, branch, keep}}.
  Lệnh: node infra/bsn.js check [--json] (mã thoát 1 khi có lỗi; JSON: {ok, errors, reposChecked, services}); node infra/bsn.js pin <dịch-vụ> [commit] [--apply].
- acceptance:
  - node infra/bsn.js check trả OK với tờ khai báo thật của hệ.
  - Test trong test/bsn.test.js: tờ khai báo thật hợp lệ; trùng cổng, cổng dưới 8000, commit sai, nhãn latest, repo thoát ra ngoài đều bị báo; pin chỉ ghi tờ của đúng dịch vụ đó và tờ khác không đổi một byte; pin mặc định chỉ in kế hoạch; check chạy được và nói rõ khi máy không có repo dịch vụ; platform.json sai bị báo.
  - Trong container Linux với repo đứng một mình: check qua.
- tasks:
