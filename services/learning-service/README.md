# Learning Service — Hướng dẫn TV4 nhận việc

Owner: chưa chốt tên. Workspace `@lms/learning-service`, port mặc định 3004, branch hiện có `feat/learning/progress`. Theo [README nhận việc](../../README.md) và đọc [AGENTS.md](AGENTS.md) trước khi sửa.

## Trạng thái và phạm vi

Hiện chỉ có scaffold `GET /` → `Hello World!`; chưa có progress API, consumer, receipt hoặc DB. Learning sở hữu progress/resume/mastery/certificate và processed_events/receipts trong PostgreSQL riêng. MongoDB Atlas chỉ cho activity/read model phụ trợ, không quyết định completion hay SYNCED.

Course sở hữu cấu trúc/requirements/enrollment; Quiz sở hữu câu hỏi và kết quả chấm. Learning không tự tạo danh sách required lessons hoặc chấm lại quiz.

## Contracts phải đọc

| Nguồn                                                                                                                                                | Mục đích                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [Learning DTO](../../packages/contracts/src/http/learning.ts)                                                                                        | Progress/resume/dashboard, receipt, mastery/certificate        |
| [Course policy](../../packages/contracts/src/http/course.ts)                                                                                         | Immutable requirements theo contentVersion                     |
| [Internal DTO](../../packages/contracts/src/internal/integration.ts)                                                                                 | Structure, access, graded summary và attempt access            |
| [Enrollment v2](../../packages/contracts/src/events/enrollment-created.v2.ts), [graded v2](../../packages/contracts/src/events/attempt-graded.v2.ts) | Khởi tạo/cập nhật theo version                                 |
| [Domain events](../../packages/contracts/src/events/domain-events.ts)                                                                                | Completion/certificate events tùy consumer                     |
| [Learning OpenAPI](../../packages/contracts/openapi/learning.json)                                                                                   | HTTP catalog đầy đủ                                            |
| [Baseline](../../packages/contracts/README.md)                                                                                                       | Completion, receipt, retry/DLQ/replay và thuật toán cần review |

API: item/lesson completion; lesson/course progress; resume; dashboard/mastery/recommendations; certificates; owner statistics/learner summaries; sync receipt và internal learner progress. Không thay percent progress bằng kết luận course completed.

## Thứ tự nhận task

1. Config, PostgreSQL migrations/health; thiết kế progress, checkpoint revision, unique processed_events, receipts và certificates.
2. Course structure/access adapter và Quiz graded/attempt-access adapter; snapshot version không được đoán từ fixture ID.
3. Enrollment v2 consumer khởi tạo progress idempotent theo enrollment/contentVersion.
4. Item/lesson/course progress và resume với quyền/sequencing/revision; cung cấp internal summaries cho Course/Gateway.
5. Graded v2 consumer, completion evaluator và sync receipt; test retry/DLQ/failure/replay trước happy-path demo.
6. Mastery/recommendation/dashboard, certificate issuance và Atlas activity/read model sau khi policy/task được review.

Không cần chờ broker/provider hoàn chỉnh để viết domain evaluator với fake adapters trong test; dữ liệu giả vẫn phải đúng schema và không được báo là integration thật.

## Quy tắc nghiệp vụ

Enrollment pin contentVersion; required items/assessments đọc từ Course snapshot cùng version. Course hoàn thành khi enrollment hợp lệ, mọi required item completed và mọi required graded assessment có passed attempt hợp lệ cùng assessmentVersion. Optional items không chặn; practice không thay graded requirement. Không tự migrate enrollment khi Course đổi cấu trúc.

Hoàn thành VIDEO/READING thủ công theo baseline; QUIZ completion phải dựa kết quả Quiz. CompleteLesson không tự hoàn thành mọi item. Lặp PUT/event không cộng progress lần nữa. Checkpoint video không phải bằng chứng hoàn thành; position/revision phải đúng item, duration và course access. Chưa có checkpoint trả data:null.

SYNCED chỉ sau transaction ghi processed_events + progress/mastery + receipt. Event đến trễ không downgrade completed hoặc ghi đè version khác. FAILED chỉ khi có failure receipt bền vững; broker DLQ tự nó không chứng minh DB đã ghi FAILED. Replay giữ cùng eventId và cho FAILED → PENDING → SYNCED. Không ACK trước commit.

Sync endpoint phải xác minh attempt existence/ownership qua Quiz; không tìm thấy là 404, dependency lỗi 503/504. Chưa có receipt thì pending, không dựng FAILED. Mastery mapping/algorithm và certificate eligibility cần owner review theo baseline; không tự tạo skill evidence khi payload không có.

## Tích hợp và dữ liệu

Consume course.enrollment.created.v2 và quiz.attempt.graded.v2 qua queue riêng; tránh áp dụng cả v1/v2. Cancellation chặn mutation mới nhưng giữ lịch sử. Internal Course structure phải cùng course/contentVersion với policy. Không suy luận published content từ dữ liệu Atlas.

Provide Course/Gateway: learner progress summaries, official course progress, dashboard và sync receipt. Completion/certificate events chỉ phát qua outbox khi có consumer thực tế. Certificate unique enrollment/version, retry không cấp trùng; public verification không lộ email/userId/enrollmentId.

Atlas unavailable cần retry/rebuild projection riêng; không đảo rollback progress chính thức đã commit hoặc tự báo progress chưa SYNCED chỉ vì Atlas lỗi. Không import Mongoose: workspace dùng MongoDB native driver theo thiết kế hiện tại.

## Chạy local và cấu hình

Từ root sau `npm.cmd ci`:

```powershell
npm.cmd run build -w @lms/contracts
$env:NODE_ENV='development'
$env:PORT='3004'
npm.cmd run start:dev -w @lms/learning-service
```

Terminal khác: `Invoke-RestMethod http://127.0.0.1:3004/` chỉ smoke check scaffold.

[Env example](.env.example): NODE_ENV, PORT, MOCK_AUTH, DATABASE_URL, RABBITMQ_URL, COURSE_URL, MONGODB_URI/MONGODB_DATABASE, JWT_PUBLIC_KEY/JWT_ISSUER. Chỉ PORT đang được đọc. Khi triển khai thêm QUIZ_URL, service credentials, queue/retry settings và config validation; các biến mới phải được ghi vào env example bằng placeholder. `.env` chưa tự load. Mock auth theo [package auth](../../packages/auth/README.md).

## Kiểm tra và bàn giao

```powershell
npm.cmd run build -w @lms/learning-service
npm.cmd run lint -w @lms/learning-service
npm.cmd run test -w @lms/learning-service -- --runInBand
npm.cmd run test:e2e -w @lms/learning-service -- --runInBand
```

Acceptance tests cần có: duplicate event; rollback trước ACK; event out-of-order/version mismatch; enrollment canceled; required/optional/practice/graded completion; progress 100% nhưng assessment chưa đạt; stale checkpoint; sai course/owner; pending/synced/failed và replay; provider timeout; certificate retry; Atlas outage không làm sai PostgreSQL receipt.

PR cần migration/queue topology, retry và replay procedure, sample event/receipt đã validate và phần chưa kiểm chứng. Mock/seed chỉ sau review contracts, dùng [IDs chung](../../packages/contracts/fixtures/ids.json), không tạo quan hệ giả giữa lesson/quiz/enrollment. Tests hello hiện tại chưa bao phủ nghiệp vụ trên.
