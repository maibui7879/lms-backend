# Course Service — Hướng dẫn TV2 nhận việc

Owner: chưa chốt tên. Workspace `@lms/course-service`, port mặc định 3002, branch hiện có `feat/course/enrollment`. Nhận task theo [README gốc](../../README.md), đọc [AGENTS.md](AGENTS.md) trước khi sửa.

## Trạng thái và phạm vi

Hiện chỉ có scaffold `GET /` → `Hello World!`; chưa có DB, enrollment, review, internal APIs hoặc RabbitMQ. Course sở hữu course/chapter/lesson/learning item, review history, enrollment và immutable requirements snapshots trong PostgreSQL riêng. Quiz sở hữu câu hỏi/điểm; Learning sở hữu tiến độ. Không join DB của hai service này.

## Contracts phải đọc

| Nguồn                                                                               | Mục đích                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [Course DTO](../../packages/contracts/src/http/course.ts)                           | CRUD, approval, outline, item, completion policy, discussions |
| [Enrollment DTO](../../packages/contracts/src/http/enrollment.ts)                   | EnrollmentSnapshotData và enrollment check                    |
| [Internal DTO](../../packages/contracts/src/internal/integration.ts)                | Content reference, access, learning structure                 |
| [Course OpenAPI](../../packages/contracts/openapi/course.json)                      | Routes, quyền, input/output                                   |
| [Enrollment event v2](../../packages/contracts/src/events/enrollment-created.v2.ts) | Snapshot version gửi Learning                                 |
| [Domain events](../../packages/contracts/src/events/domain-events.ts)               | Cancellation, publication/review, content revision tùy chọn   |
| [Baseline](../../packages/contracts/README.md)                                      | State machine, ownership, sequencing và event migration       |

Nhóm API: course CRUD/catalog; submit-review/admin review; chapter/lesson/item CRUD/reorder; outline/completion policy; enrollment/my enrollments; instructor courses/learners; discussions; internal enrollment/access/reference/structure. Xem operationId chính xác ở [catalog](../../packages/contracts/src/endpoints.ts).

## Thứ tự nhận task

1. Config, PostgreSQL/migrations, health và owner authorization; schema course hierarchy, aggregate version, enrollment uniqueness, review history và outbox.
2. Draft course/chapter/lesson/item và reorder. Xác minh quan hệ parent và version trong transaction.
3. Internal content reference/structure và enrollment check để Quiz/Learning viết adapter; không cần chờ discussion/statistics.
4. Submit-review/Admin approve/reject, đóng băng published requirements snapshot.
5. Enrollment pin contentVersion, access check và outbox enrollment.created.v2; phối hợp Learning cho sequence policy.
6. Catalog/instructor/learner lists, discussion/moderation, cancellation và các event có consumer thực tế.

## Quy tắc bắt buộc theo baseline

Instructor không publish trực tiếp: DRAFT/REJECTED → IN_REVIEW → PUBLISHED hoặc REJECTED. Chỉ Admin review; reject cần reason, actor/time do server ghi. Sai transition trả INVALID_COURSE_TRANSITION; stale expectedVersion trả VERSION_CONFLICT.

Chỉ sửa draft/rejected; snapshot PUBLISHED bất biến. Không tự migrate enrollment khi thay nội dung. Course pin required items/graded assessment references theo contentVersion; requiredItemIds do server tính từ item flags. Không publish requirements rỗng hoặc quiz reference sai course/version/policy.

Student enrollment unique course/user, chỉ PUBLISHED; response mới bắt buộc contentVersion. CANCELLED không có access, COMPLETED còn quyền đọc. Baseline chưa hỗ trợ re-enroll canceled record. Không suy ra access=true khi dependency Learning/Identity lỗi; trả 503/504.

Sequential access cần Course structure và Learning state. Internal structure phải độc lập, không gọi vòng qua checkCourseAccess. Nếu chưa thống nhất cách đọc state với Learning thì chốt adapter/contract trước, không tự đoán prerequisite đã hoàn thành.

## Provider, consumer và dữ liệu

Provider cho Quiz: enrollment/access và course/lesson/item/quiz reference. Provider cho Learning: immutable structure/completion policy theo contentVersion và enrollment event v2. Course/Gateway có thể đọc learner progress/assessment summaries qua internal APIs; không đọc DB service khác.

Enrollment/review/publish transaction phải ghi outbox cùng dữ liệu nghiệp vụ; publisher sau commit. Routing keys và optional consumers theo baseline. Không phát content.updated từ mỗi lần lưu draft; published revision workflow chưa được định nghĩa để triển khai.

## Chạy local và cấu hình

Từ root sau `npm.cmd ci`:

```powershell
npm.cmd run build -w @lms/contracts
$env:NODE_ENV='development'
$env:PORT='3002'
npm.cmd run start:dev -w @lms/course-service
```

Smoke check ở terminal khác: `Invoke-RestMethod http://127.0.0.1:3002/` chỉ trả hello scaffold.

[Env example](.env.example) dự kiến: NODE_ENV, PORT, MOCK_AUTH, DATABASE_URL, RABBITMQ_URL, IDENTITY_URL, JWT_PUBLIC_KEY/JWT_ISSUER. Chỉ PORT đang được đọc. Khi triển khai adapter Learning, bổ sung LEARNING_URL và service credentials vào config/env example; hiện các biến đó chưa được khai báo. Không cho rằng copy `.env` là đã có config loader. Mock auth xem [package auth](../../packages/auth/README.md).

## Kiểm tra và bàn giao

```powershell
npm.cmd run build -w @lms/course-service
npm.cmd run lint -w @lms/course-service
npm.cmd run test -w @lms/course-service -- --runInBand
npm.cmd run test:e2e -w @lms/course-service -- --runInBand
```

Acceptance tests cần bổ sung: Instructor khác không sửa course; Student không review; reject thiếu lý do; published content không sửa; stale version/reorder sai parent; enrollment trùng và course draft; snapshot/version đúng; outbox không mất khi crash; access dependency unavailable; canceled enrollment bị chặn; discussion parent/author đúng course.

PR bàn giao cho Quiz/Learning phải nêu provider routes đã chạy, policy snapshot, event sample đã validate và failure paths. Dataset/seed chỉ làm sau review contracts, theo [IDs chung](../../packages/contracts/fixtures/ids.json), idempotent và không tạo foreign key xuyên DB. Scaffold test pass chưa đáp ứng các acceptance trên.
