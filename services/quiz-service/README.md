# Quiz Service — Hướng dẫn TV3 nhận việc

Owner: chưa chốt tên. Workspace `@lms/quiz-service`, port mặc định 3003, branch hiện có `feat/quiz/grading`. Theo [quy trình nhận task](../../README.md) và đọc [AGENTS.md](AGENTS.md) trước khi sửa.

## Trạng thái và phạm vi

Hiện chỉ có scaffold `GET /` → `Hello World!`; chưa có quiz API, DB, deadline worker hoặc publisher. Quiz sở hữu cấu hình quiz, câu hỏi/đáp án đúng, immutable attempt snapshots, answers, grading result và outbox trong PostgreSQL riêng. Không sở hữu enrollment hoặc tiến độ khóa học.

## Contracts phải đọc

| Nguồn                                                                       | Mục đích                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [Quiz DTO](../../packages/contracts/src/http/quiz.ts)                       | Policy, authoring/delivery, attempt, answer, review/statistics |
| [Result DTO](../../packages/contracts/src/http/quiz-result.ts)              | QuizResultV2Data tách attemptStatus/gradingStatus              |
| [Internal DTO](../../packages/contracts/src/internal/integration.ts)        | Course references, graded summary, attempt ownership           |
| [Graded event v2](../../packages/contracts/src/events/attempt-graded.v2.ts) | Kết quả/policy/assessmentVersion và skillScores gửi Learning   |
| [Quiz OpenAPI](../../packages/contracts/openapi/quiz.json)                  | Method/path, request/response, quyền và idempotency            |
| [Baseline](../../packages/contracts/README.md)                              | Grading, deadline, retention/retry, migration v1/v2            |

API cần triển khai: quiz draft/publish/archive; question CRUD; start/get attempt; save answers/submit/result/review/history; owner statistics/learner summaries; internal graded summary/attempt access. Lấy operationId từ [catalog](../../packages/contracts/src/endpoints.ts), không tự đổi route hoặc quay về legacy result.status.

## Thứ tự nhận task

1. Config/DB/migrations, health, auth và Course integration adapter cho enrollment/access/content reference.
2. Draft quiz/policy và question authoring; publish đóng băng assessment version.
3. Start attempt với transaction/idempotency, policy/questions/order snapshot và expiresAt.
4. Autosave với revision, submit atomic, objective grading, result V2 và deadline worker.
5. Outbox graded.v2 và internal graded/attempt-access để Learning tích hợp.
6. History/review policy/statistics, skill score evidence, failure/recovery tests.

## Quy tắc phải giữ

QuestionAuthoringDTO có correctChoiceIds/explanation/skillIds; QuestionDeliveryDTO chỉ có câu hỏi, lựa chọn và points. Student payload phải map bằng allowlist; không spread authoring object rồi xóa vài field. Parser delivery từ chối đáp án đúng hoặc explanation.

Start chỉ khi Student có enrollment/access hợp lệ, quiz PUBLISHED trong lịch, còn maxAttempts. Snapshot policy/questions/version/order một lần; đọc lại attempt không shuffle lần nữa. `expiresAt` do server tính, lấy mốc sớm hơn giữa duration và closesAt. Không dựa vào countdown client.

SaveAnswers thay toàn bộ answer set, xác minh question/choice thuộc snapshot, không nhận question trùng. expectedRevision ngăn autosave cũ ghi đè mới. Submit dùng answers đã lưu, kiểm tra revision, khóa trạng thái và lưu result/outbox cùng transaction. Client không gửi score/passed/userId tự chọn.

Hết hạn từ chối save/submit trễ; worker idempotent chấm answers đã lưu và chuyển EXPIRED. SINGLE_CHOICE/MULTIPLE_CHOICE chấm all-or-nothing; không partial credit/trừ điểm trong baseline. So sánh passed bằng score/maxScore theo threshold snapshot, không làm tròn trước so sánh. Practice không thay required graded assessment.

Tách AttemptStatus, GradingStatus và ProgressSyncStatus. Result đang chờ chấm có các trường điểm null; SYNCED thuộc receipt Learning, không suy ra từ outbox SENT. Student chỉ đọc attempt của chính mình; Instructor/Admin dùng owner statistics. Review chỉ lộ đáp án khi reviewPolicy cho phép.

## Dependency và bàn giao

Consume Course enrollment/access/reference; dependency failure trả 503/504, không bypass enrollment. Publish/start phải xác minh course/lesson/quiz reference và version đúng. Identity cấp user JWT; service authentication dùng credential riêng.

Provide Learning: internal graded summary có policy/version/skillScores và attempt access có owner/eventId; publish quiz.attempt.graded.v2 qua outbox. Consumer mới không subscribe đồng thời v1/v2 cho cùng kết quả. Không đưa answer keys vào events. Fake Course adapter trong test phải theo contracts; không coi đó là integration thật.

## Chạy local và cấu hình

Từ root sau `npm.cmd ci`:

```powershell
npm.cmd run build -w @lms/contracts
$env:NODE_ENV='development'
$env:PORT='3003'
npm.cmd run start:dev -w @lms/quiz-service
```

Terminal khác: `Invoke-RestMethod http://127.0.0.1:3003/` để kiểm tra hello scaffold.

[Env example](.env.example): NODE_ENV, PORT, MOCK_AUTH, DATABASE_URL, RABBITMQ_URL, COURSE_URL, JWT_PUBLIC_KEY/JWT_ISSUER. Chỉ PORT đang được đọc. Owner bổ sung config loader, service credential và worker settings khi triển khai; không commit secret hoặc cho rằng env example đã kết nối DB/broker. Mock authentication theo [hướng dẫn](../../packages/auth/README.md), không tự bật trong production.

## Kiểm tra và nghiệm thu

```powershell
npm.cmd run build -w @lms/quiz-service
npm.cmd run lint -w @lms/quiz-service
npm.cmd run test -w @lms/quiz-service -- --runInBand
npm.cmd run test:e2e -w @lms/quiz-service -- --runInBand
npm.cmd test -w @lms/contracts
```

Các ca cần bổ sung: student không thấy answer keys; sai owner; draft/outside-window quiz; enrollment unavailable; concurrent starts không vượt maxAttempts; idempotency key replay/conflict; autosave stale revision; lựa chọn ngoài snapshot; submit trùng; boundary deadline; worker replay không chấm/phát event hai lần; policy đổi không sửa điểm lịch sử; review trước giờ đóng bị chặn; result vẫn GRADED khi Learning pending.

PR cần migration, API lỗi và sample event đã qua parseContract; nêu rõ case dùng fake adapter. Chỉ làm mock dataset sau review baseline, dùng [IDs chung](../../packages/contracts/fixtures/ids.json) và kiểm tra quan hệ/version. Các test scaffold hiện chưa chứng minh các ca nghiệp vụ này.
