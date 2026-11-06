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

## Mục tiêu và cách thực hiện

Xây dựng backend để giảng viên soạn quiz, học viên làm/nộp bài và Learning nhận kết quả chấm chính xác. Thực hiện sáu giai đoạn; kiểm thử chức năng, sai quyền và lỗi liên quan sau từng bước.

### Giai đoạn 1 — Chuẩn bị hệ thống và kiểm tra quyền truy cập

**Mục tiêu:** Có DB và nền tảng xác thực, kiểm tra Course trước khi xử lý quiz.

**Công việc cụ thể:**

1. Triển khai config validation, PostgreSQL/migrations và health; thiết kế quiz, question, attempt, answer, result và outbox.
2. Kiểm tra user JWT và ownership theo course, không tin userId/role từ client.
3. Viết Course adapter kiểm tra enrollment, access và quan hệ course/lesson/item/quiz.

**Giải thích thuật ngữ:** Migration thay đổi DB schema; ownership là quyền sở hữu tài nguyên; adapter kết nối service khác; outbox giữ sự kiện trong DB trước khi gửi; dependency là thành phần cần dùng từ bên ngoài.

**Kết quả cần đạt:** Service có DB và adapter xác định được điều kiện truy cập; chưa có Course thật thì dùng fake adapter có ghi rõ trong test.

**Cách kiểm thử:** Config/DB lỗi, JWT không hợp lệ, owner khác course và Course timeout/unavailable. Xác nhận provider lỗi trả 503/504, không cho học viên truy cập theo giả định.

### Giai đoạn 2 — Soạn câu hỏi và xuất bản quiz

**Mục tiêu:** Giảng viên tạo quiz có policy và câu hỏi hợp lệ mà không lộ đáp án cho học viên.

**Công việc cụ thể:**

1. Viết quiz draft CRUD và question authoring cho SINGLE_CHOICE/MULTIPLE_CHOICE; kiểm tra choices, đáp án, points và skillIds.
2. Validate thời lượng, threshold, số lần làm, lịch mở/đóng và review policy; cập nhật phải kiểm tra version.
3. Publish đóng băng assessmentVersion/policy/questions; archive chặn start mới, chỉ xóa draft đủ điều kiện.
4. Tách QuestionAuthoringDTO khỏi QuestionDeliveryDTO bằng mapping allowlist.

**Giải thích thuật ngữ:** Authoring là dữ liệu soạn câu hỏi có đáp án; delivery là dữ liệu gửi người làm bài; policy là quy tắc làm/chấm bài; assessmentVersion là phiên bản bài kiểm tra; threshold là mức điểm đạt.

**Kết quả cần đạt:** Quiz draft chỉnh sửa được; quiz đã publish bất biến theo baseline; metadata/delivery không có đáp án đúng hoặc explanation.

**Cách kiểm thử:** Không phải owner, choice trùng/ngoài câu hỏi, single-choice có nhiều đáp án đúng, points không dương, policy sai và stale version. Thử sửa published quiz, publish thiếu câu hỏi và parse delivery có answer keys để xác nhận bị chặn.

### Giai đoạn 3 — Bắt đầu và đọc lại lượt làm bài

**Mục tiêu:** Mỗi attempt có dữ liệu cố định, deadline server và giới hạn số lượt rõ ràng.

**Công việc cụ thể:**

1. Start chỉ khi enrollment/access, trạng thái/lịch quiz và maxAttempts hợp lệ.
2. Tạo attempt cùng snapshot policy/questions/version/thứ tự câu-lựa chọn trong transaction.
3. Tính expiresAt từ server; xử lý Idempotency-Key và concurrent starts không vượt giới hạn.
4. Cho đúng attempt owner đọc lại cùng snapshot và answers đã lưu.

**Giải thích thuật ngữ:** Attempt là một lượt làm bài; snapshot là bản dữ liệu cố định; expiresAt là hạn chót do server cấp; idempotency key nhận biết request lặp; concurrency là nhiều thao tác đồng thời.

**Kết quả cần đạt:** Start/retry không tạo lượt trùng; get attempt không shuffle lại và người khác không đọc được lượt làm bài.

**Cách kiểm thử:** Quiz draft/archived/ngoài lịch; hết maxAttempts; cùng key/cùng body, cùng key/khác body và hai start đồng thời. Kiểm tra expiresAt lấy mốc sớm hơn duration và closesAt, và câu hỏi không đổi giữa hai lần đọc.

### Giai đoạn 4 — Lưu đáp án, nộp bài và chấm điểm

**Mục tiêu:** Answers được lưu theo revision và chấm đúng snapshot khi nộp hoặc hết hạn.

**Công việc cụ thể:**

1. SaveAnswers thay toàn bộ bộ đáp án, kiểm tra question/choice thuộc snapshot và expectedRevision.
2. Submit khóa attempt, chấm answers đã lưu, ghi result V2 và outbox trong cùng transaction.
3. Triển khai worker tự chấm answers đã lưu khi hết hạn; từ chối dữ liệu nộp trễ.
4. Tách attemptStatus/gradingStatus; điểm chờ chấm là null, không lấy score/passed từ client.

**Giải thích thuật ngữ:** Autosave lưu đáp án trong quá trình làm; revision là số lần cập nhật để chặn ghi đè cũ; worker xử lý công việc nền; atomic nghĩa là các thay đổi nghiệp vụ cùng thành công hoặc cùng hủy.

**Kết quả cần đạt:** Nộp/hết hạn chỉ chấm một lần; score/passed dựa policy snapshot và trạng thái hợp lệ, không phụ thuộc countdown frontend.

**Cách kiểm thử:** Autosave đến sai thứ tự, câu/choice ngoài snapshot, submit hai lần, worker và submit chạy đồng thời, crash trước commit và boundary deadline. Kiểm tra all-or-nothing grading, threshold không làm tròn và thay policy không sửa kết quả lịch sử.

### Giai đoạn 5 — Gửi kết quả và cung cấp API cho Learning

**Mục tiêu:** Learning nhận kết quả có đủ version/policy/evidence và xác minh được attempt owner.

**Công việc cụ thể:**

1. Publisher đọc outbox và gửi quiz.attempt.graded.v2 sau commit; thêm retry theo baseline.
2. Cung cấp internal graded summary và attempt access với credential riêng.
3. Payload chứa assessmentVersion, quizType, threshold, gradedAt và skillScores; không có answer keys.
4. Chốt queue/version cutover với Learning; không áp dụng trùng v1/v2.

**Giải thích thuật ngữ:** Publisher gửi sự kiện; consumer nhận/xử lý sự kiện; routing key phân loại event trên broker; skillScores là bằng chứng điểm theo kỹ năng; receipt là xác nhận xử lý do Learning lưu.

**Kết quả cần đạt:** Kết quả chấm không mất khi broker lỗi và Learning có thể kiểm tra dữ liệu/ownership qua internal API; outbox SENT không bị gọi nhầm là progress SYNCED.

**Cách kiểm thử:** Dừng/khởi động lại broker, publisher retry và gửi trùng event; validate payload v2. Gọi internal API bằng user JWT hoặc sai scope; phối hợp Learning thử nhận lại event mà không cộng progress hai lần.

### Giai đoạn 6 — Lịch sử, review và thống kê

**Mục tiêu:** Hoàn thiện trải nghiệm xem kết quả theo đúng quyền và policy.

**Công việc cụ thể:**

1. Viết history của chính học viên, review chỉ khi policy cho phép, owner statistics và learner assessment summaries.
2. Hoàn thiện skill evidence cho mastery theo mapping đã được review.
3. Kiểm thử failure/recovery, cập nhật cấu hình, migrations và tài liệu demo tích hợp.

**Giải thích thuật ngữ:** Review trả chi tiết đáp án sau điều kiện cho phép; statistics tổng hợp điểm/lượt làm; recovery khôi phục xử lý sau lỗi; evidence là dữ liệu làm căn cứ tính kết quả.

**Kết quả cần đạt:** Học viên chỉ xem attempt của mình; giảng viên/Admin dùng báo cáo được phép; kết quả GRADED vẫn đọc được khi Learning còn PENDING.

**Cách kiểm thử:** History sai owner, review trước closesAt/NEVER, thống kê không có mẫu trả null và không trộn assessmentVersion. Kiểm tra dữ liệu đúng qua Gateway và Learning thật; ghi rõ case còn dùng fake adapter.

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
