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

## Mục tiêu và cách thực hiện

Xây dựng backend theo dõi học tập, tiếp tục bài đang học, xác định hoàn thành và cấp chứng chỉ theo policy. Thực hiện sáu giai đoạn, kiểm thử từng bước trước khi chuyển tiếp. Khi provider chưa sẵn sàng, dùng fake adapter đúng contracts trong test và ghi rõ phần chưa tích hợp thật.

### Giai đoạn 1 — Chuẩn bị hệ thống và dữ liệu tiến độ

**Mục tiêu:** Có nơi lưu trạng thái học tập chính thức và cơ chế xử lý event an toàn.

**Công việc cụ thể:**

1. Triển khai config validation, PostgreSQL connection/migrations, health và kiểm tra user/service credentials.
2. Thiết kế progress theo enrollment/contentVersion, checkpoint có revision, certificate unique theo enrollment/version.
3. Tạo processed_events và receipts; chuẩn bị transaction cập nhật cùng progress.

**Giải thích thuật ngữ:** Migration thay đổi bảng; checkpoint là vị trí học gần nhất; revision phát hiện cập nhật cũ; processed_events lưu event đã xử lý; receipt ghi trạng thái đồng bộ; transaction làm các thay đổi cùng thành công hoặc cùng hủy.

**Kết quả cần đạt:** DB schema có ràng buộc chống trùng; service khởi động và báo lỗi config/DB rõ ràng. PostgreSQL là nguồn progress chính thức.

**Cách kiểm thử:** DB test mới chạy được migrations; config thiếu/DB lỗi được phát hiện; DB từ chối processed_event/certificate trùng. Thử rollback transaction để xác nhận không ghi receipt thành công khi progress chưa commit.

### Giai đoạn 2 — Kết nối Course và Quiz

**Mục tiêu:** Learning sử dụng đúng cấu trúc, điều kiện học và kết quả đánh giá từ service sở hữu dữ liệu.

**Công việc cụ thể:**

1. Viết Course adapters đọc enrollment/access và learning structure/completion policy theo contentVersion.
2. Viết Quiz adapters đọc graded summary và attempt access để xác minh user/version/event identity.
3. Kiểm tra dữ liệu trả về qua contracts, đặt timeout và phân biệt not-found, denied, unavailable.
4. Thống nhất luồng kiểm tra học tuần tự với Course, tránh hai API gọi vòng nhau.

**Giải thích thuật ngữ:** Adapter kết nối provider; immutable snapshot là cấu trúc đã chốt không bị sửa; timeout giới hạn thời gian chờ; service credential xác thực service gọi nội bộ.

**Kết quả cần đạt:** Có thể lấy metadata cần thiết mà không join DB hoặc đoán version từ fixture IDs; có fake adapter trong test nếu provider chưa xong.

**Cách kiểm thử:** Course/policy khác version, attempt của user khác, token sai scope, provider 404/timeout/unavailable và payload sai schema. Không biến dependency lỗi thành cho phép học hoặc course completed.

### Giai đoạn 3 — Nhận đăng ký và khởi tạo tiến độ

**Mục tiêu:** Mỗi enrollment được khởi tạo progress một lần theo đúng requirements snapshot.

**Công việc cụ thể:**

1. Tạo queue/consumer cho course.enrollment.created.v2; đọc pinned contentVersion và lấy structure đúng version.
2. Ghi processed_events cùng dữ liệu khởi tạo progress trong transaction.
3. ACK sau commit; xử lý event lặp và cancellation theo baseline, giữ lịch sử học tập.

**Giải thích thuật ngữ:** Queue là hàng đợi event; consumer xử lý event; ACK xác nhận đã xử lý cho broker; deduplication ngăn áp dụng event trùng; pin version giữ requirements của lần đăng ký.

**Kết quả cần đạt:** Nhận enrollment v2 tạo progress đúng user/course/version; gửi lại không tạo thêm dữ liệu hoặc reset tiến độ.

**Cách kiểm thử:** Gửi một event nhiều lần, rollback giữa các bước, consumer khởi động lại và snapshot provider không có. Thử cancellation/event đến trễ; xác nhận không xóa lịch sử hoặc mở lại quyền học trái policy.

### Giai đoạn 4 — Progress, completion của item/lesson và resume

**Mục tiêu:** Học viên xem tiến độ, hoàn thành nội dung hợp lệ và tiếp tục đúng vị trí đang học.

**Công việc cụ thể:**

1. Viết đọc item/lesson/course progress và completion theo enrollment/sequence policy.
2. VIDEO/READING xác nhận theo baseline; không cho client tự đánh dấu QUIZ completed.
3. Save/get resume kiểm tra course/lesson/item/version, video duration và expectedRevision; không có checkpoint trả data:null.
4. Cung cấp internal learner summaries cho Course/Gateway; không suy ra course completed chỉ từ progressPercent.

**Giải thích thuật ngữ:** Progress là trạng thái học; completion xác nhận hoàn thành; resume tiếp tục từ checkpoint; sequence policy quy định thứ tự học; stale revision là phiên cập nhật đã cũ.

**Kết quả cần đạt:** API đúng user và snapshot; PUT lặp không cộng số bài; checkpoint chỉ thay vị trí, không tự chứng minh đã hoàn thành.

**Cách kiểm thử:** Sai owner/course/version, enrollment canceled, item chưa mở, video position quá duration, stale checkpoint và PUT completion lặp. CompleteLesson khi required items chưa hoàn thành phải bị chặn; dùng dữ liệu assessment do test tạo khi graded consumer chưa xong.

### Giai đoạn 5 — Kết quả quiz, hoàn thành khóa học và receipt

**Mục tiêu:** Cập nhật requirements từ quiz và công bố trạng thái đồng bộ dựa trên dữ liệu đã commit.

**Công việc cụ thể:**

1. Consume quiz.attempt.graded.v2; chỉ áp dụng kết quả đúng course/quiz/assessmentVersion và policy snapshot.
2. Tính course completed từ mọi required item và required graded assessment; practice không thay graded requirement.
3. Ghi processed_events, progress/mastery và receipt trong cùng transaction; thêm sync endpoint xác minh attempt owner qua Quiz.
4. Triển khai retry/DLQ/failure receipt/replay; phát completion event qua outbox khi có consumer thực tế.

**Giải thích thuật ngữ:** PENDING là đang chờ đồng bộ; SYNCED là xử lý đã commit; FAILED chỉ có khi có failure receipt bền vững. DLQ giữ event xử lý thất bại sau retry; replay xử lý lại event gốc đã giữ identity.

**Kết quả cần đạt:** Không cộng trùng/giảm progress do event trễ; 100% item vẫn có thể chưa completed nếu assessment chưa đạt; receipt phản ánh đúng transaction PostgreSQL.

**Cách kiểm thử:** Duplicate/out-of-order/wrong-version event, crash trước ACK, retry hết lượt, replay FAILED → PENDING → SYNCED và attempt không tồn tại/sai owner. Kiểm tra broker DLQ/outbox SENT không tự trở thành FAILED/SYNCED và Quiz GRADED vẫn tồn tại khi Learning pending.

### Giai đoạn 6 — Dashboard, mastery, chứng chỉ và projection

**Mục tiêu:** Hoàn thiện chức năng tổng hợp và bằng chứng hoàn thành theo policy đã review.

**Công việc cụ thể:**

1. Dashboard, recommendations, mastery theo skill evidence/algorithmVersion và thống kê theo đúng quyền.
2. Cấp/list/verify certificate khi đủ điều kiện; chống cấp trùng và giới hạn dữ liệu verification công khai.
3. Thêm MongoDB Atlas activity/read model bằng native driver; có retry/rebuild riêng khi lỗi.
4. Hoàn thiện event có consumer, integration tests và tài liệu vận hành/replay.

**Giải thích thuật ngữ:** Mastery là mức độ thành thạo tính từ bằng chứng học tập; projection/read model là bản dữ liệu tổng hợp phục vụ đọc; rebuild dựng lại projection; certificate là chứng chỉ; eligibility là điều kiện được cấp.

**Kết quả cần đạt:** Dashboard/báo cáo đúng quyền, certificate duy nhất và projection phụ không quyết định official progress. Policy mastery/certificate cần owner review trước triển khai.

**Cách kiểm thử:** Không có evidence, không đủ điều kiện certificate, cấp đồng thời/retry, public verification không lộ email/IDs, owner khác đọc thống kê. Dừng Atlas để kiểm tra PostgreSQL progress/receipt đã commit vẫn đúng; ghi rõ E2E thật và adapter còn giả.

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
