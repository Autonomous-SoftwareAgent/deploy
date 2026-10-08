# Deploy Console — Yêu cầu Backend / API

Tài liệu này mô tả toàn bộ API cần có để phục vụ giao diện Deploy Console (các màn: Tổng quan, Chi tiết service, Hộp thoại Deploy/Rollback, Tiến trình deploy, Cấu hình môi trường và nhánh, Lịch sử toàn hệ thống, Command palette). Dữ liệu và hành vi trong prototype là dữ liệu mẫu; backend cần hiện thực hóa đúng các quy tắc dưới đây.

---

## 1. Nguyên tắc cốt lõi (ràng buộc thiết kế)

1. **Độc lập theo service.** Mỗi service có repo, lịch sử commit và phiên bản đang chạy riêng. Mọi thao tác deploy/rollback gắn với đúng một `(service, environment)`. Không có endpoint "deploy cả hệ thống". Thao tác nhiều service là một **batch** gồm nhiều mục độc lập, mỗi mục có commit đích riêng và kết quả riêng.
2. **Không hardcode môi trường.** Môi trường là dữ liệu do người dùng tạo (tên bất kỳ: `prod`, `beta`, `stg`, `uat`, `eu-prod`...). Không được có enum `prod|beta|stg` ở bất kỳ đâu trong schema, validation hay response. Mọi API trả về theo danh sách môi trường hiện có; UI sinh cột, bộ lọc, tab, hộp thoại từ danh sách đó. Số môi trường có thể là 1 đến ít nhất 10.
3. **Nhánh linh hoạt.** Nhánh nào deploy lên môi trường nào do người dùng quyết định: theo từng service, theo mặc định của nhóm dự án, hoặc theo quy tắc chung (mẫu nhánh).
4. **An toàn trước.** Mọi thao tác ghi cấu hình đều có xem trước tác động, lưu có phiên bản, hoàn tác được. Mọi thao tác deploy/rollback đều có kiểm tra trước (preflight), kiểm tra quyền, mức bảo vệ của môi trường và ghi audit.

Quy mô: 20–50 service, nhóm theo dự án; vài môi trường đến vài chục môi trường tạm theo nhánh.

---

## 2. Mô hình dữ liệu

Mọi `id` là chuỗi bất biến (UUID hoặc slug ổn định). Tên hiển thị có thể đổi, id thì không (ví dụ đổi tên môi trường `stg` thành `staging` không làm đổi `id`).

### 2.1 Project
| Trường | Kiểu | Ghi chú |
|---|---|---|
| id, name | string | Nhóm dự án, ví dụ "Thanh toán" |

### 2.2 Service
| Trường | Kiểu | Ghi chú |
|---|---|---|
| id, name | string | `payments-api`, `billing-svc`... duy nhất toàn hệ thống |
| projectId | ref | |
| type | enum mở rộng được | `api`, `web`, `worker`, `migration`, ... |
| repo | object | `{ provider, url, defaultBranch }` |
| dependsOn | ref[] | service mà service này dùng. "Được dùng bởi" được suy ngược ra |
| healthCheck | object | `{ path, timeoutSec, retries }` |
| autoRollbackDefault | bool | mặc định cho các lần deploy |

### 2.3 Environment
| Trường | Kiểu | Ghi chú |
|---|---|---|
| id | string | bất biến |
| name | string | duy nhất, sửa được |
| color | string | hex |
| description | string | |
| order | int | thứ tự hiển thị, sắp xếp được |
| ephemeral | object \| null | môi trường tạm: `{ sourceBranch, ruleId, expiresAt }` |
| protection | ProtectionPolicy | xem dưới |

**ProtectionPolicy** (mức bảo vệ, theo môi trường):
- `requireApproval: bool` — cần người phê duyệt trước khi chạy.
- `requireTypeName: bool` — người dùng phải gõ tên service (hoặc tên môi trường khi thao tác nhiều service) để xác nhận.
- `restrictDeployers: bool` — chỉ vai trò được cấp quyền mới deploy/rollback (xem Permission).
- `freezeWindow: { enabled, from, to, timezone }` — khóa deploy theo khung giờ lặp hàng tuần, ví dụ `from = "Fri 16:00"`, `to = "Mon 08:00"` (khung có thể vắt qua cuối tuần). Cần timezone tường minh (mặc định `Asia/Bangkok`) thay vì giờ trình duyệt.

### 2.4 BranchMapping (một "ô" trong ma trận service × môi trường)
| Trường | Kiểu | Ghi chú |
|---|---|---|
| scope | `service` \| `project` | `project` = mặc định của nhóm, `service` = ghi đè riêng |
| serviceId / projectId | ref | tùy scope |
| environmentId | ref | |
| mode | `manual` \| `auto` \| `pattern` \| `none` | `manual`: chỉ deploy khi người dùng bấm; `auto`: tự deploy khi có push vào nhánh `value`; `pattern`: `value` là mẫu glob (`release/*`, `hotfix/*`), tự deploy khi nhánh khớp; `none`: chưa cấu hình |
| value | string | tên nhánh hoặc mẫu glob (hỗ trợ `*`) |

**Quy tắc phân giải (resolve)** cho `(service, environment)`:
1. Có BranchMapping scope `service` → dùng nó (`inherited = false`).
2. Không có thì dùng scope `project` của service đó (`inherited = true`).
3. Không có cả hai → `mode = none` (thiếu cấu hình).

`mode = manual` vẫn có `value`: dùng để **gợi ý** nhánh/commit khi mở hộp thoại deploy cho môi trường đó.

### 2.5 BranchRule (quy tắc nhánh chung)
`{ id, order, pattern, target: { type: "environment", environmentId } | { type: "ephemeral", ttlDays } }`. Danh sách có thứ tự, **quy tắc đầu tiên khớp thắng**. Quy tắc `ephemeral` tạo môi trường tạm đặt tên theo nhánh (slug), tự xóa sau `ttlDays` ngày.

### 2.6 Commit
Lấy từ Git provider, cache phía backend. Mỗi service có lịch sử riêng.
`{ serviceId, sha, shortSha (7 ký tự), message, author: {name, email}, branch, committedAt, build: { status: queued|running|passed|failed, url }, hasDbMigration: bool, filesChanged }`.
`hasDbMigration` được xác định bằng quy tắc cấu hình theo service (đường dẫn migration, ví dụ `migrations/**`) hoặc nhãn commit. Cần quy ước rõ trong tài liệu triển khai.

### 2.7 Deployment (một lần triển khai, bất biến sau khi kết thúc)
`{ id, serviceId, environmentId, commitSha, previousCommitSha, kind: deploy|rollback, status, requestedBy, approvedBy?, startedAt, finishedAt, runId, autoRollbackEnabled, outcome }`.

`status` của deployment: `pending_approval | queued | running | succeeded | failed | rolled_back | cancelled`.

### 2.8 Trạng thái hiện hành của một cặp (service, môi trường) — `Runtime`
`{ serviceId, environmentId, commitSha, health: healthy|deploying|failed|degraded, deployedAt, deployedBy, lastDeploymentId }`. Chỉ có tối đa một bản ghi cho mỗi cặp; thiếu bản ghi nghĩa là "chưa deploy".

Ngữ nghĩa `health`:
- `healthy`: health check đạt.
- `deploying`: đang có run chạy.
- `failed`: lần deploy gần nhất thất bại và không được tự rollback (bản mới không phục vụ được).
- `degraded`: đang chạy nhưng chỉ số vượt ngưỡng (lỗi hoặc độ trễ). Ngưỡng cấu hình được; backend tự cập nhật theo số liệu giám sát.

### 2.9 DeployRun (tiến trình trực tiếp)
Một run gom một hoặc nhiều mục (batch). Mỗi mục có 4 bước tuần tự: `build → test → deploy → health_check`.
```
Run { id, environmentId, kind, autoRollback, status, startedAt, finishedAt, items: RunItem[] }
RunItem { serviceId, fromSha, toSha, status: running|succeeded|failed|rolling_back|rolled_back|cancelled,
          steps: [ { name, status: pending|running|succeeded|failed|skipped, progress: 0..100, startedAt, finishedAt } ] }
```

### 2.10 Approval
`{ id, deploymentIds[], requestedBy, approverId, status: pending|approved|rejected|expired, decidedAt, comment }`.

### 2.11 Role / Permission
Vai trò mẫu: Developer, QA, Tech lead, DevOps (vai trò tạo/sửa được; không hardcode). Quyền theo cặp `(role, environment)`:
`level = none | deploy | deploy_and_rollback`.
Chỉ có hiệu lực ở môi trường bật `restrictDeployers`. Môi trường không bật thì mọi người có quyền chung của hệ thống được thao tác.

### 2.12 ConfigVersion
Toàn bộ cấu hình (môi trường, mặc định nhóm, ghi đè theo service, quy tắc nhánh, phân quyền) là **một tài liệu có phiên bản**. Mỗi lần lưu tạo một `ConfigVersion` bất biến:
`{ version (số tăng dần), createdAt, createdBy, summary, snapshot, parentVersion }`.

### 2.13 AuditEvent
`{ id, at, actor, type, serviceId?, environmentId?, payload, requestId }` với `type` thuộc: `deploy.requested`, `deploy.approved`, `deploy.started`, `deploy.succeeded`, `deploy.failed`, `deploy.cancelled`, `rollback.requested`, `rollback.succeeded`, `deploy.auto_rolled_back`, `config.saved`, `config.restored`, `config.imported`, `environment.created|updated|deleted`, `permission.changed`, ... Bất biến, chỉ ghi thêm.

### 2.14 EnvVar
`{ serviceId, environmentId, key, value, secret: bool, updatedBy, updatedAt }`. Giá trị `secret` không bao giờ trả về dạng rõ trừ khi có quyền và có cờ `reveal` (xem 5.4).

---

## 3. Quy tắc nghiệp vụ phải hiện thực ở backend

### 3.1 Head và "lệch phiên bản"
- `head(service, env)` = commit mới nhất (theo thời gian commit) có nhánh khớp `value` của mapping đã phân giải (khớp chính xác với `manual`/`auto`, khớp glob với `pattern`). `mode = none` thì không có head.
- `behindCount(service, env)` = số commit **khớp quy tắc nhánh** mới hơn commit đang chạy. UI hiển thị "còn N commit chưa deploy" khi `N > 0`.
- Trả cả hai giá trị này trong API tổng quan để UI không phải tự tính.

### 3.2 Thứ tự ưu tiên ở màn tổng quan
Điểm ưu tiên của service = `1000 × (số môi trường failed) + 500 × (số deploying) + 300 × (số degraded) + min(tổng behindCount, 99)`. Sắp service giảm dần theo điểm trong từng nhóm dự án; sắp nhóm dự án theo điểm cao nhất bên trong. Backend phải hỗ trợ `sort=priority` (mặc định) và trả `priorityScore` để client kiểm chứng.

### 3.3 Cảnh báo cấu hình (tính phía backend, trả kèm)
- **Thiếu cấu hình:** service có ít nhất một môi trường mà mapping phân giải ra `none` (hoặc `value` rỗng).
- **Nhánh ánh xạ tới nhiều môi trường:** cùng một `value` ở hai môi trường trở lên với `mode` là `auto` hoặc `pattern` (sẽ tự deploy đồng thời). Ô `manual` không tính là xung đột.

### 3.4 Kiểm tra trước khi deploy/rollback (preflight)
Với mỗi mục `(service, env, targetSha)` backend trả:
- `from` (commit đang chạy) và `to` (commit đích).
- `changes`: danh sách commit giữa hai commit, kèm hướng (`forward` = sẽ được đưa lên, `backward` = sẽ bị gỡ). Nếu chưa có bản đang chạy: trả vài commit gần nhất của đích và cờ `firstDeploy = true`.
- `migrations`: số commit có `hasDbMigration` trong khoảng. Với rollback, cảnh báo riêng "migration không tự đảo ngược".
- `dependents`: danh sách service đang dựa vào service này.
- `suggestions`: commit gợi ý theo quy tắc của môi trường (HEAD của nhánh ánh xạ; commit mới nhất mọi nhánh; với rollback là bản liền trước đã `passed`).
- `blockers` (chặn cứng) và `warnings` (cảnh báo, không chặn), mỗi mục có `code`, `message`.

Mã chặn tối thiểu:
| code | Điều kiện |
|---|---|
| `ALREADY_RUNNING` | commit đích trùng commit đang chạy |
| `BUILD_FAILED` | build của commit đích `failed` |
| `BUILD_NOT_READY` | build chưa `passed` (queued/running) |
| `NOTHING_TO_ROLLBACK` | rollback nhưng chưa có bản đang chạy |
| `ROLLBACK_TARGET_NEWER` | rollback về commit mới hơn bản đang chạy |
| `PERMISSION_DENIED` | vai trò hiện tại không đủ quyền (deploy hoặc rollback) ở môi trường |
| `FREEZE_WINDOW` | đang trong khung giờ khóa |
| `RUN_IN_PROGRESS` | cặp (service, env) đang có run khác chạy |

Mã cảnh báo tối thiểu: `HAS_MIGRATION`, `ROLLBACK_CROSSES_MIGRATION`, `HAS_DEPENDENTS`, `DEPLOY_OLDER_COMMIT` (deploy lùi, nên dùng rollback).

### 3.5 Yêu cầu xác nhận theo mức bảo vệ
Khi tạo deployment, backend **tự thực thi** (không tin client):
- `requireTypeName`: request phải mang `confirmText` đúng bằng tên service (một service) hoặc tên môi trường (nhiều service); sai thì `422`.
- `requireApproval`: deployment vào trạng thái `pending_approval`, chỉ chạy sau khi người có quyền duyệt (không được là chính người yêu cầu). Quá hạn duyệt (cấu hình, mặc định 24 giờ) thì `expired`.
- `restrictDeployers`: kiểm tra Permission; rollback cần `deploy_and_rollback`.
- `freezeWindow`: từ chối khi đang trong khung; có thể cho phép vai trò đặc biệt vượt qua kèm lý do (tùy chọn, cần xác nhận với product).

### 3.6 Tiến trình deploy
- Bốn bước tuần tự; bước sau chỉ bắt đầu khi bước trước `succeeded`.
- **Health check thất bại:** nếu `autoRollback = true` thì chuyển item sang `rolling_back`, đưa về `fromSha`, kết thúc `rolled_back`, runtime `healthy` ở bản cũ. Nếu `autoRollback = false` thì item `failed`, runtime `failed` (ghi rõ commit thử deploy).
- Người dùng bật/tắt `autoRollback` **ngay khi run đang chạy**; giá trị áp dụng tại thời điểm health check thất bại.
- **Hủy:** hủy mục đang chạy/đang rollback; mục đã xong giữ nguyên kết quả; mục chưa xong giữ nguyên bản đang chạy trước đó, trạng thái `cancelled`. Hủy phải idempotent.
- Run của nhiều service chạy **song song và độc lập**; một mục lỗi không làm hỏng mục khác.
- Cùng một cặp (service, env) chỉ có một run hoạt động; yêu cầu thứ hai trả `409 RUN_IN_PROGRESS`.

### 3.7 Lưu cấu hình an toàn
- **Xem trước tác động** (không ghi) trả về:
  - `affectedServices`: số service có mapping phân giải thay đổi.
  - `changedCells`: số ô (service × môi trường) đổi.
  - `autoDeploys`: danh sách deploy tự động **sẽ chạy ngay sau khi lưu**: các ô mới ở chế độ `auto`/`pattern` có head khác commit đang chạy, kèm `{service, environment, branch, fromSha, toSha}`.
  - `changes`: các dòng mô tả bằng văn bản (thêm/xóa/đổi tên môi trường, đổi màu, đổi mức bảo vệ, đổi thứ tự, số ô mặc định nhóm đổi, số ô ghi đè đổi, phân quyền, quy tắc nhánh).
  - `warnings`: các cảnh báo ở mục 3.3 sau khi áp dụng thay đổi.
- **Lưu** có kiểm soát đồng thời bằng `baseVersion` (optimistic locking); nếu cấu hình đã đổi bởi người khác thì `409 CONFIG_VERSION_CONFLICT` kèm bản mới nhất.
- **Hoàn tác** = khôi phục một phiên bản cũ thành **bản nháp/xem trước**, rồi lưu thành phiên bản mới (không xóa lịch sử).
- Xóa môi trường: cascade xóa mapping và quyền liên quan; quy tắc nhánh trỏ tới môi trường đó chuyển về "không có đích" và phải được báo trong `warnings`. Không xóa lịch sử Deployment/Audit; chúng giữ `environmentId` và tên tại thời điểm xảy ra (`environmentNameSnapshot`).

---

## 4. Quy ước chung của API

- Base path `/api/v1`, JSON UTF-8, thời gian ISO-8601 UTC.
- Xác thực: Bearer token / session của hệ thống SSO của công ty. `GET /me` trả `{ id, name, roles[] }`.
- Phân trang kiểu cursor: `?limit=50&cursor=...`, response `{ items, nextCursor }`.
- Lỗi thống nhất: `{ "error": { "code": "FREEZE_WINDOW", "message": "...", "details": {...}, "requestId": "..." } }` với `400` (sai cú pháp), `401`, `403`, `404`, `409` (xung đột trạng thái/phiên bản), `422` (vi phạm nghiệp vụ, kèm `blockers`), `429`.
- **Idempotency:** mọi `POST` tạo deployment/run nhận header `Idempotency-Key`; gửi lại cùng khóa trả cùng kết quả.
- Mọi thao tác ghi sinh `AuditEvent`.
- Hiệu năng: `GET /overview` với 50 service × 10 môi trường phản hồi dưới 500 ms (dùng cache runtime + commit; không gọi Git provider đồng bộ).

---

## 5. Danh sách endpoint theo màn hình

### 5.1 Màn 1 — Tổng quan hệ thống

**`GET /overview`**

Query:
| Tham số | Ý nghĩa |
|---|---|
| `projectId` | lọc theo dự án |
| `environmentId` | chỉ trả các cột của môi trường này |
| `status` | `healthy|deploying|failed|degraded|behind` (trạng thái "lệch phiên bản" = có `behindCount > 0`); khớp nếu bất kỳ môi trường nào trong phạm vi lọc thỏa |
| `q` | tìm theo tên service hoặc message của commit đang chạy |
| `sort` | `priority` (mặc định) \| `name` |

Response:
```jsonc
{
  "environments": [ { "id": "prod", "name": "prod", "color": "#...", "order": 0, "protected": true } ],
  "summary": { "services": 12, "failed": 2, "deploying": 1, "degraded": 1, "behind": 7 },
  "groups": [
    {
      "project": { "id": "...", "name": "Thanh toán" },
      "attentionCount": 2,
      "services": [
        {
          "id": "payments-api", "name": "payments-api", "type": "api", "priorityScore": 300,
          "configWarnings": [ { "code": "NO_MAPPING", "environmentId": "stg" } ],
          "cells": {
            "prod": {
              "deployed": true,
              "commit": { "sha": "…", "shortSha": "a1b2c3d", "message": "…", "author": "…", "branch": "release/2.4" },
              "health": "degraded", "deployedAt": "…",
              "mapping": { "mode": "manual", "value": "release/*", "inherited": true },
              "head": { "shortSha": "…" }, "behindCount": 3
            },
            "beta": { "deployed": false }
          }
        }
      ]
    }
  ]
}
```
Yêu cầu: `cells` được khóa theo `environmentId`; môi trường không có bản ghi trả `deployed:false`. Nhóm/service sắp theo mục 3.2. Tổng `summary` tính trên **toàn bộ** service (không phụ thuộc bộ lọc) để các chip thống kê ổn định.

### 5.2 Màn 2 — Chi tiết service

| Method & path | Mô tả |
|---|---|
| `GET /services/{id}` | Thông tin service: repo, project, type, dependsOn, dependents, healthCheck, autoRollbackDefault |
| `GET /services/{id}/environments` | Với từng môi trường: runtime hiện hành (commit, health, deployedAt, deployedBy), mapping đã phân giải, `head`, `behindCount`, và `metrics` (xem 5.2.1) |
| `GET /services/{id}/commits` | Lịch sử commit của riêng service. Query: `branch`, `cursor`, `limit`. Mỗi commit kèm `build`, `hasDbMigration`, `runningIn: [environmentId...]` (nhãn "đang chạy"), và cờ `canRollbackTo` / `canDeploy` |
| `GET /services/{id}/deployments` | Dòng thời gian deployment của riêng service. Query: `environmentId`, `cursor`, `limit`. Hỗ trợ `include=commits` để trả timeline gộp (commit và deployment xen kẽ) |
| `GET /services/{id}/deployments/{deploymentId}` | Chi tiết một deployment gồm các bước |
| `GET /services/{id}/deployments/{deploymentId}/logs` | Log build/deploy của lần đó (hỗ trợ `?follow=true` dạng stream hoặc phân trang theo offset) |
| `GET /services/{id}/diff?base={sha|environmentId}&target={sha}` | So sánh. `base` có thể là sha hoặc `env:<environmentId>` (bản đang chạy). Trả: `commits[]`, `files[] {path, additions, deletions, status}`, `hasDbMigration`, `direction` |
| `GET /services/{id}/logs?environmentId=…` | Log runtime; hỗ trợ `follow` (SSE) và lọc `level`, `since` |
| `GET /services/{id}/env-vars?environmentId=…` | Danh sách biến; giá trị `secret` bị che (`"••••"`). `?reveal=true` chỉ cho vai trò đủ quyền, và ghi audit |
| `PUT /services/{id}/env-vars/{key}?environmentId=…` | Tạo/sửa biến (cần quyền ở môi trường đó, ghi audit không chứa giá trị secret) |
| `DELETE /services/{id}/env-vars/{key}?environmentId=…` | Xóa biến |
| `PATCH /services/{id}/settings` | Sửa `healthCheck`, `autoRollbackDefault`, `dependsOn` |

#### 5.2.1 Chỉ số trước/sau lần deploy gần nhất
`metrics` cho mỗi môi trường: hai chuỗi thời gian nhẹ (khoảng 24 điểm): `errorRate` (%) và `latencyP95` (ms), kèm `deployMarkerIndex` (vị trí lần deploy gần nhất) và `summary: { errorBefore, errorAfter, latencyBefore, latencyAfter }`. Nguồn: hệ thống giám sát có sẵn (Prometheus, Datadog...). Nếu nguồn không sẵn sàng trả `metrics: null` thay vì lỗi cả response.

### 5.3 Màn 3 — Hộp thoại Deploy / Rollback

**`POST /deployments/preflight`** — kiểm tra trước, không ghi
```jsonc
{
  "kind": "deploy",            // hoặc "rollback"
  "environmentId": "prod",
  "items": [ { "serviceId": "payments-api", "targetSha": "…" } ]   // targetSha có thể bỏ trống để lấy gợi ý mặc định
}
```
Response (mỗi mục độc lập, vì mỗi service giữ commit đích riêng):
```jsonc
{
  "environment": { "id": "prod", "name": "prod", "protection": { "requireApproval": true, "requireTypeName": true, "restrictDeployers": true, "freezeWindow": { "enabled": true, "frozenNow": false, "from": "…", "to": "…" } } },
  "permission": { "allowed": true },
  "confirmation": { "typeNameRequired": true, "expectedText": "payments-api", "approvalRequired": true },
  "items": [
    {
      "serviceId": "payments-api",
      "from": { "shortSha": "…", "message": "…" },
      "to":   { "shortSha": "…", "message": "…", "build": "passed" },
      "suggestions": [ { "label": "HEAD release/*", "sha": "…" } ],
      "changes": [ { "shortSha": "…", "message": "…", "direction": "forward", "hasDbMigration": true } ],
      "migrationCount": 1,
      "dependents": [ "payments-web", "order-api" ],
      "blockers": [ ],
      "warnings": [ { "code": "HAS_MIGRATION", "message": "…" } ]
    }
  ],
  "canProceed": true
}
```
Gọi lại preflight mỗi khi người dùng đổi môi trường hoặc đổi commit đích (UI gọi nhiều lần; endpoint phải rẻ và không có tác dụng phụ).

**`POST /deployments`** — tạo yêu cầu (batch)
```jsonc
{
  "kind": "deploy",                     // "deploy" | "rollback"
  "environmentId": "prod",
  "items": [ { "serviceId": "payments-api", "targetSha": "…" }, { "serviceId": "billing-svc", "targetSha": "…" } ],
  "autoRollback": true,
  "confirmText": "payments-api",        // nếu môi trường yêu cầu gõ tên
  "approverId": "user-123"              // nếu môi trường yêu cầu phê duyệt
}
```
Hành vi:
- Chạy lại toàn bộ preflight phía server; có `blockers` thì trả `422` kèm chi tiết từng mục (không tạo gì cả). Quy tắc: **tất cả hoặc không** ở mức yêu cầu; sau khi chạy, từng mục độc lập.
- Cần phê duyệt: trả `202` với `status = pending_approval`, `approvalId`.
- Không cần phê duyệt: tạo `Run`, trả `201 { runId, deploymentIds[] }`.

**Phê duyệt**
| Method & path | Mô tả |
|---|---|
| `GET /approvals?status=pending&mine=true` | Việc chờ tôi duyệt |
| `GET /approvals/{id}` | Chi tiết (gồm kết quả preflight tại lúc yêu cầu) |
| `POST /approvals/{id}/approve` · `POST /approvals/{id}/reject` | Body `{ comment }`. Người duyệt không được là người yêu cầu. Duyệt xong tạo Run |
| `POST /approvals/{id}/cancel` | Người yêu cầu rút lại |

### 5.4 Màn 4 — Tiến trình deploy trực tiếp

| Method & path | Mô tả |
|---|---|
| `GET /runs/{runId}` | Snapshot đầy đủ: các mục, 4 bước từng mục, trạng thái, `autoRollback` |
| `GET /runs?status=active` | Các run đang chạy (cho chỉ báo "Tiến trình deploy" trên thanh điều hướng) |
| `GET /runs/{runId}/events` | **SSE** (hoặc WebSocket) phát sự kiện: `step.started`, `step.progress`, `step.succeeded`, `step.failed`, `item.rolling_back`, `item.rolled_back`, `item.succeeded`, `item.failed`, `run.finished`, `log.line`. Hỗ trợ `Last-Event-ID` để nối lại không mất sự kiện |
| `GET /runs/{runId}/logs` | Log gộp của run (có tiền tố tên service khi nhiều mục); phân trang theo offset để lấy lại khi tải trang |
| `PATCH /runs/{runId}` | Body `{ "autoRollback": true|false }` — đổi tùy chọn tự rollback khi run đang chạy |
| `POST /runs/{runId}/cancel` | Hủy (mục 3.6). Tùy chọn `{ "itemServiceIds": [...] }` để hủy riêng một số mục. Idempotent |

Mỗi sự kiện log: `{ at, serviceId, level: info|warn|error|success, text }`.

### 5.5 Màn 5 — Cấu hình môi trường và nhánh

Cấu hình là **một tài liệu có phiên bản**; UI sửa trên bản nháp ở client và chỉ gửi lên khi xem trước/lưu. Vì vậy API ưu tiên thao tác ở mức tài liệu, kèm các endpoint đọc tiện lợi.

**Đọc**
| Method & path | Mô tả |
|---|---|
| `GET /config` | Cấu hình hiện hành: `{ version, environments[], groupDefaults[], serviceOverrides[], rules[], permissions[], roles[] }` |
| `GET /config/validate` | (tùy chọn) trả `warnings` hiện tại: thiếu cấu hình, nhánh ánh xạ nhiều môi trường |

**Xem trước và lưu**
| Method & path | Mô tả |
|---|---|
| `POST /config/preview` | Body: `{ baseVersion, proposed: <tài liệu cấu hình> }`. Trả đối tượng xem trước ở mục 3.7. Không ghi |
| `PUT /config` | Body: `{ baseVersion, proposed, summary? }`. Lưu thành `ConfigVersion` mới. `409` nếu `baseVersion` lỗi thời. Sau khi lưu, kích hoạt các deploy tự động (nếu có) và đảm bảo kết quả trùng với `autoDeploys` đã xem trước. Ghi audit |
| `GET /config/versions` | Lịch sử thay đổi: `{ version, at, by, summary }` |
| `GET /config/versions/{v}` | Snapshot đầy đủ của một phiên bản |
| `POST /config/versions/{v}/restore` | Trả snapshot đó dưới dạng `proposed` (để UI nạp vào bản nháp và đi qua preview/lưu). Không tự ghi |

**Import / export**
| Method & path | Mô tả |
|---|---|
| `GET /config/export?format=json\|yaml` | Xuất cấu hình hiện hành. YAML và JSON phải **tương đương nhau hoàn toàn** |
| `POST /config/import` | Body JSON hoặc YAML (`Content-Type: application/json` hoặc `application/yaml`). Validate cấu trúc và tham chiếu (service, môi trường, vai trò tồn tại), trả `proposed` + danh sách lỗi theo đường dẫn (`path`) nếu sai. **Không ghi trực tiếp**; luôn đi qua `preview` → `PUT /config` |

**Các thao tác chi tiết (tùy chọn, cho client không dùng tài liệu)**: backend có thể thêm CRUD tương ứng, nhưng mọi đường đều phải đi qua cùng cơ chế phiên bản và audit:
`POST|PATCH|DELETE /environments`, `PUT /environments/order`, `PUT /mappings/project/{projectId}/{environmentId}`, `PUT|DELETE /mappings/service/{serviceId}/{environmentId}`, `POST|PATCH|DELETE /rules`, `PUT /rules/order`, `PUT /permissions/{roleId}/{environmentId}`.

**Trình thử quy tắc nhánh:** `POST /rules/test` body `{ "branch": "feat/login", "rules": [ ... ] }` (nếu bỏ `rules` thì dùng quy tắc hiện hành). Trả `{ matchedRuleId, matchedIndex, target, ephemeral: { name, ttlDays } | null, evaluated: [ { ruleId, matched } ] }`. Khớp glob `*` (không phân biệt chữ hoa/thường là quyết định cần chốt, xem mục 9).

**Môi trường tạm**
| Method & path | Mô tả |
|---|---|
| `GET /environments?ephemeral=true` | Danh sách, kèm `expiresAt` |
| `DELETE /environments/{id}` | Xóa sớm môi trường tạm (và mọi môi trường thường, qua cùng luồng cấu hình) |
| Job nền | Tự xóa môi trường tạm khi đến `expiresAt`; ghi audit; thông báo trước (tùy chọn) |

**Khu vực nguy hiểm** (các thao tác xóa hàng loạt) chỉ là các thao tác chỉnh bản nháp ở client rồi đi qua `preview` → `PUT /config`; backend không cần endpoint riêng, nhưng **mọi thao tác xóa phải ghi audit và có thể hoàn tác bằng lịch sử phiên bản**.

### 5.6 Màn 6 — Lịch sử toàn hệ thống (audit, chỉ xem)

**`GET /audit`**
Query: `serviceId`, `actorId`, `environmentId`, `type` (nhiều giá trị), `from`, `to`, `q`, `cursor`, `limit`.
Trả dòng thời gian gộp **mọi** sự kiện deploy, rollback, đổi cấu hình, phân quyền, hoàn tác. Mỗi dòng:
`{ id, at, actor: {id,name}, type, summary, serviceId?, serviceName?, environmentId?, environmentName (snapshot), fromSha?, toSha?, outcome?, links: { deploymentId?, runId?, configVersion? } }`.
- Tuyệt đối **không có endpoint sửa hoặc xóa** audit; API này chỉ đọc.
- Hỗ trợ `Accept: text/csv` để xuất.
- Tên môi trường hiển thị là tên **tại thời điểm xảy ra** để lịch sử không bị sai khi đổi tên/xóa.

### 5.7 Command palette (Ctrl+K)

**`GET /search?q=…&limit=8`**
Trả kết quả gom nhóm: `services[]` (khớp tên, ưu tiên khớp đầu chuỗi), `environments[]`, và `commands[]` được phân tích sẵn.

**`POST /commands/parse`** body `{ "text": "deploy billing-svc lên beta" }`
Phân tích câu lệnh tiếng Việt/Anh thành ý định có cấu trúc, **không thực thi**:
```jsonc
{ "intent": "deploy", "service": { "id": "billing-svc" }, "environment": { "id": "beta" }, "confidence": 0.95,
  "candidates": [ ... ] }   // khi mơ hồ (thiếu môi trường hoặc nhiều service khớp) trả nhiều ứng viên
```
Từ khóa tối thiểu: `deploy|triển khai [service] (lên|to) [môi trường]`, `rollback|quay lại|lùi [service] (ở|về|on) [môi trường]`, `mở|open [service]`. Tên môi trường lấy từ cấu hình động, không hardcode. Thực thi thật luôn đi qua `preflight` → `POST /deployments`; palette không được bỏ qua các bước xác nhận.

---

## 6. Thời gian thực

- Kênh SSE hoặc WebSocket chung `GET /stream` (hoặc theo tài nguyên) phát: thay đổi `Runtime` (đổi `health`, đổi commit đang chạy) để màn tổng quan và chi tiết cập nhật mà không phải tải lại; sự kiện run (mục 5.4); sự kiện `config.saved`, `approval.requested`, `approval.decided`.
- Mỗi sự kiện có `id` tăng dần để nối lại. Client chưa kết nối vẫn dùng được bằng polling các `GET` ở trên.

## 7. Tích hợp bên ngoài

- **Git provider** (GitHub/GitLab/Bitbucket): webhook `push` để cập nhật commit và kích hoạt `auto`/`pattern`; đọc diff, danh sách commit. Cần chiến lược cache và đồng bộ lại khi mất webhook.
- **CI/CD và nền tảng chạy** (build, test, rolling update, health check): backend điều phối qua adapter có thể thay thế; hợp đồng adapter: `startBuild`, `getBuildStatus`, `deploy(image, env)`, `checkHealth`, `rollback(previousRelease)`, `streamLogs`.
- **Giám sát**: nguồn chỉ số lỗi/độ trễ và logic `degraded`.
- **Thông báo** (tùy chọn): Slack/email cho yêu cầu phê duyệt, deploy thất bại, tự rollback.
- Kích hoạt tự động (`auto`/`pattern`) phải đi qua **cùng đường kiểm tra** như deploy thủ công, trừ bước người dùng gõ tên/phê duyệt: môi trường bật `requireApproval` thì deploy tự động tạo yêu cầu chờ duyệt thay vì chạy thẳng (cần chốt, xem mục 9).

## 8. Yêu cầu phi chức năng

- **Phân quyền ở server cho mọi thao tác ghi.** Không tin ẩn/hiện nút ở UI.
- **Tính nhất quán:** trạng thái Runtime và Deployment cập nhật nguyên tử; không để UI thấy hai bản đang chạy cho cùng một cặp.
- **Bảo mật dữ liệu nhạy cảm:** secret mã hóa lúc lưu, che trong log, không đưa vào audit hay response mặc định.
- **Khả năng chịu lỗi:** run tiếp tục dù client ngắt kết nối; có thể lấy lại trạng thái và log bằng `GET`. Khởi động lại dịch vụ không làm mất run đang chạy (khôi phục từ lưu trữ bền).
- **Giới hạn tốc độ** cho các endpoint ghi và `search`.
- **Lưu trữ:** audit ≥ 12 tháng; log deployment ≥ 90 ngày (cấu hình được); lịch sử cấu hình giữ vô thời hạn.
- **Quan sát:** `requestId` xuyên suốt, metric số run, thời lượng từng bước, tỷ lệ tự rollback.
- **Địa phương hóa:** message lỗi trả `code` cố định; UI tự dịch. Trường `message` mặc định tiếng Việt.
- **Kiểm thử:** có bộ dữ liệu mẫu tương đương prototype (12 service, 4 dự án, 3 môi trường, các trạng thái failed/deploying/degraded, commit có migration, build failed) để dựng môi trường dev và test hợp đồng.

## 9. Điểm cần chốt trước khi làm

1. Cách xác định commit có migration (đường dẫn, nhãn, hay metadata của CI).
2. Môi trường bật phê duyệt: deploy tự động (`auto`/`pattern`) chạy thẳng hay phải chờ duyệt?
3. Có cho phép vai trò đặc biệt vượt khung giờ khóa (hotfix) kèm lý do không?
4. Hạn duyệt mặc định và cách xử lý khi người duyệt vắng mặt.
5. Khớp glob có phân biệt chữ hoa/thường không; có hỗ trợ `**` và `?` không.
6. Nguồn chỉ số cho biểu đồ và ngưỡng chuyển `degraded`.
7. Có cần xác thực hai bước hoặc xác nhận lại mật khẩu cho thao tác trên môi trường bảo vệ cao không.
8. Giới hạn số môi trường tạm đồng thời và chính sách dọn dẹp tài nguyên khi môi trường tạm hết hạn.

## 10. Tiêu chí nghiệm thu (đối chiếu với giao diện)

| Màn hình | Hành vi phải kiểm chứng được qua API |
|---|---|
| Tổng quan | Thêm môi trường mới ở cấu hình → `GET /overview` có thêm cột mới mà không đổi mã nguồn UI. Bộ lọc theo dự án/môi trường/trạng thái/tìm kiếm trả đúng; service lỗi, đang deploy, lệch phiên bản đứng đầu; `behindCount` đúng theo nhánh ánh xạ |
| Chi tiết service | Mọi danh sách chỉ chứa dữ liệu của service đó; nhãn "đang chạy" đúng theo môi trường; diff so với bản đang chạy của một môi trường bất kỳ; log mở được cạnh danh sách |
| Deploy/Rollback | Preflight trả đúng thay đổi, cảnh báo migration, service phụ thuộc; chặn đúng các trường hợp ở 3.4; môi trường bảo vệ bắt gõ tên/phê duyệt/kiểm tra quyền/khung giờ ngay tại server; batch nhiều service giữ commit đích riêng |
| Tiến trình | Sự kiện bước và log đến theo thời gian thực; hủy và đổi tự động rollback khi đang chạy; health check lỗi tự rollback đúng; một mục lỗi không ảnh hưởng mục khác |
| Cấu hình | Preview đếm đúng service ảnh hưởng và liệt kê deploy tự động sẽ chạy; lưu có khóa phiên bản; hoàn tác qua lịch sử; import/export JSON và YAML tương đương; xóa môi trường không làm hỏng lịch sử; môi trường tạm tự hết hạn |
| Lịch sử | Gộp đủ mọi loại sự kiện, lọc theo service/người/môi trường, chỉ đọc |
| Command palette | `deploy billing-svc lên beta` và `rollback auth-api` được phân tích đúng, dùng tên môi trường động, và luôn đi qua preflight |
