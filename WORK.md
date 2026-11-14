# Theo dõi chức năng Learning Service

Cập nhật ngày **14/11/2026** theo code trên nhánh `feat/learning/progress`, gồm các thay đổi đang có ở máy local. Mã và tên chức năng lấy từ bảng `Function List`. Kết quả kiểm thử và cách chạy lại nằm trong [báo cáo kiểm thử Learning](services/learning-service/test/TEST_REPORT.md).

Thứ tự triển khai và điều kiện hoàn thành của từng chức năng nằm trong [PLAN.md](PLAN.md).

**Xác nhận lại ngày 14/11/2026.** PRG-01 đến PRG-08 và học lại theo contract main 0981c48 đạt 40/40 E2E, 9/9 mock API và 59/59 request HTTP được gọi trực tiếp. Đã sửa thêm việc giữ checkpoint trong mock và xóa lý do thông báo cũ sau khi học lại. Có thể đóng phạm vi phát triển với mock API và dữ liệu mẫu. Xem [phần học lại](#học-lại-sau-khi-course-sửa-nội-dung) và [báo cáo đối chiếu API](services/learning-service/test/TEST_REPORT.md#xác-nhận-trực-tiếp-kết-quả-http).

| Mã | Chức năng | Trạng thái |
| --- | --- | --- |
| [PRG-01](#prg-01--lưu-hoàn-thành-từng-bài) | Lưu hoàn thành từng bài | **Hoàn thành phần backend** cho item và lesson. Đã kiểm thử lưu PostgreSQL và gửi lặp. |
| [PRG-02](#prg-02--tính-phần-trăm-hoàn-thành-khóa) | Tính phần trăm hoàn thành khóa | **Hoàn thành phần tính theo bài học.** Ghép Course để xác nhận khả năng đọc các phiên bản đã phát hành trước đó. |
| [PRG-03](#prg-03--tiến-độ-theo-chương) | Tiến độ theo chương | **Hoàn thành phần backend** trả số bài, tỷ lệ và trạng thái chương. Frontend dùng dữ liệu này để vẽ thanh tiến độ. |
| [PRG-04](#prg-04--tổng-hợp-điểm-quiz) | Tổng hợp điểm quiz | **Hoàn thành backend và mock API.** Học viên xem điểm của mình, chủ khóa và Admin xem điểm đã đồng bộ trong khóa. |
| [PRG-05](#prg-05--dashboard-tiến-độ-cá-nhân) | Dashboard tiến độ cá nhân | **Hoàn thành backend và mock API.** Có tiến độ theo bài, quiz gần đây và bước học tiếp. |
| [PRG-06](#prg-06--đồng-bộ-tiến-độ-qua-event) | Đồng bộ tiến độ qua event | **Hoàn thành luồng quiz đã chấm theo contract.** Hoàn thành bài được ghi qua API Learning của PRG-01. Còn kiểm tra với Quiz thật. |
| [PRG-07](#prg-07--chống-tính-trùng-event) | Chống tính trùng event | **Hoàn thành cho luồng Quiz hiện có.** Gửi lại event giữ nguyên điểm và số lượt. |
| [PRG-08](#prg-08--lưu-thời-điểm-học-gần-nhất) | Lưu thời điểm học gần nhất | **Hoàn thành backend và mock API.** Lưu vị trí học tiếp và dùng mốc hoạt động mới nhất để sắp xếp khóa trong dashboard. |

## Vị trí trong dự án

Các đường dẫn `src/` và `test/` trong bảng nằm dưới `services/learning-service/`.

| Vị trí | Nội dung |
| --- | --- |
| [`src/modules/progress/`](services/learning-service/src/modules/progress/) | Controller, service và quy tắc tiến độ cho PRG-01/02/03/08. Các thư mục con `quiz-scores` và `dashboard` chứa API PRG-04/05. |
| [`src/modules/progress-sync/`](services/learning-service/src/modules/progress-sync/) | Consumer nhận điểm, repository chống trùng và API tra đồng bộ cho PRG-06/07. |
| [`src/integrations/`](services/learning-service/src/integrations/) | HTTP client gọi Course để lấy lượt ghi danh và policy, gọi Quiz để xác minh chủ lượt làm. |
| [`src/database/migrations/`](services/learning-service/src/database/migrations/) | Tạo các bảng item, lesson, kết quả quiz và trạng thái đồng bộ trong PostgreSQL. |
| [`test/`](services/learning-service/test/) | Test NestJS, test tích hợp, mock API cho Postman và báo cáo kiểm thử. |
| [`packages/contracts/openapi/learning.json`](packages/contracts/openapi/learning.json) | Đặc tả đường dẫn, dữ liệu gửi và dữ liệu trả về của Learning. |

## Dùng các ví dụ bên dưới

Chạy mock server từ thư mục gốc bằng `npm.cmd run start:mock -w @lms/learning-service`. Trên Postman, thêm header `X-Mock-User: studentB`. Với `PUT` và `POST`, chọn **Body → raw → JSON**. Khởi động lại mock để đưa dữ liệu về trạng thái ban đầu.

Các URL mẫu dùng mock trên `http://127.0.0.1:3104`. Để chạy API NestJS mặc định trên cổng `3004`, dùng các ID từ lượt ghi danh của môi trường đó và [lệnh chạy service, cấu hình và migration](services/learning-service/README.md#chạy-api-tiến-độ). Kiểu dữ liệu request/response của hai môi trường lấy từ cùng contract.

## PRG-01 – Lưu hoàn thành từng bài

**Vị trí trong code** gồm [controller](services/learning-service/src/modules/progress/progress.controller.ts), [service](services/learning-service/src/modules/progress/progress.service.ts), [repository item](services/learning-service/src/modules/progress/repositories/item-completions.repository.ts), [repository lesson](services/learning-service/src/modules/progress/repositories/lesson-completions.repository.ts) và [migration lesson](services/learning-service/src/database/migrations/1794528000004-create-lesson-completions.ts).

**Trạng thái hiện tại** là đã hoàn thành phần đọc và ghi tiến độ item/lesson. Đã xác minh hai request hoàn thành lesson gửi đồng thời chỉ tạo một dòng PostgreSQL. Sự kiện `learning.lesson.completed.v1` dành cho Analytics vẫn là phần tích hợp tùy chọn trong contract.

Chức năng lưu video hoặc bài đọc đã xong. Khi đủ các mục bắt buộc, học viên có thể ghi nhận cả bài học đã hoàn thành. Một bài học (`lesson`) có thể chứa nhiều mục (`item`).

**Ví dụ khi học.** Một bài có video bắt buộc và tài liệu đọc thêm. Bạn đánh dấu video đã xem, sau đó xác nhận hoàn thành bài học. Bài được ghi nhận là **Đã hoàn thành** dù bạn chưa mở tài liệu đọc thêm. Nếu bạn xác nhận trước khi đánh dấu video đã xem, bài vẫn còn dang dở.

Với mục quiz thuộc yêu cầu đánh giá, kết quả đạt phải khớp ngưỡng của policy đã ghi danh. Ví dụ, điểm 60% được đánh dấu đạt theo một ngưỡng 60% sẽ chưa hoàn thành mục quiz nếu khóa đang yêu cầu 70%.

**Cách hoạt động**

1. Learning lấy lượt ghi danh và cấu trúc khóa từ Course. API ghi kiểm tra đúng `contentVersion` và điều kiện mở chương hoặc học tuần tự.
2. Lệnh hoàn thành item ghi video hoặc bài đọc theo khóa ghép `enrollmentId + contentVersion + learningItemId`. Kết quả hoàn thành item quiz lấy từ Quiz đã chấm.
3. Lệnh hoàn thành lesson kiểm tra tất cả item bắt buộc trong bài. Nếu thiếu, API trả `409 COURSE_REQUIREMENTS_NOT_MET`. Nếu chương bị khóa hoặc chưa đạt điều kiện học tuần tự, API trả `403 PREREQUISITE_NOT_COMPLETED`.
4. Khi đủ điều kiện, Learning ghi một dòng theo `enrollmentId + contentVersion + lessonId`. Gửi lại giữ cùng `completedAt`. API đọc tiến độ lesson trả trạng thái của bài và từng item.

| API mẫu dùng trong Postman | Kết quả mong đợi |
| --- | --- |
| `GET http://127.0.0.1:3104/api/v1/learning/lessons/00000000-0000-4000-8000-000000000211/progress` | Ban đầu `200`, `data.status = NOT_STARTED`. Sau khi hoàn thành video thì `IN_PROGRESS`. |
| `PUT http://127.0.0.1:3104/api/v1/learning/items/00000000-0000-4000-8000-000000000221/completion` | Với body bên dưới, trả `200` và item có `status = COMPLETED`. |
| `PUT http://127.0.0.1:3104/api/v1/learning/lessons/00000000-0000-4000-8000-000000000211/completion` | Dùng cùng body sau khi hoàn thành video. Trả `200`, bài có `status = COMPLETED` và có `completedAt`. Đọc lại API `GET` sẽ thấy trạng thái này, dù bài đọc tùy chọn vẫn có thể là `NOT_STARTED`. |

```json
{"completed":true,"contentVersion":1}
```

## PRG-02 – Tính phần trăm hoàn thành khóa

**Vị trí trong code** gồm [controller](services/learning-service/src/modules/progress/progress.controller.ts), [`getCourseProgress()`](services/learning-service/src/modules/progress/progress.service.ts#L110), [luật tính từ item và quiz](services/learning-service/src/modules/progress/rules/progress-evidence.ts) và [`CourseClient`](services/learning-service/src/integrations/course.client.ts).

**Hoàn thành phần backend.** API bổ sung `completedRequiredLessons`, `totalRequiredLessons` và `lessonProgressPercent` theo yêu cầu trong bảng phân công. Dashboard dùng `lessonProgressPercent` để hiển thị. API giữ `progressPercent` theo contract hiện tại cho các phần cần tỷ lệ theo item.

Học viên dùng API để xem tiến độ nội dung và biết khóa đã đủ điều kiện hoàn thành chưa.

**Ví dụ khi học.** Khóa mẫu có hai bài bắt buộc. Bạn xem xong video của bài 1 rồi xác nhận hoàn thành bài. Dashboard hiện **1/2 bài · 50%**. Sau khi xác nhận cả hai bài, dashboard hiện **2/2 bài · 100%**. Nếu bài kiểm tra cuối khóa chưa đạt, khóa vẫn hiện **Đang học**.

Một bài được tính vào tổng nếu chứa ít nhất một mục bắt buộc trong policy cấp khóa hoặc cấp chương. Một bài đã xác nhận hoàn thành qua PRG-01 được đếm một lần. Nếu tổng bằng 0 thì tỷ lệ là `0`. Trạng thái `COMPLETED` dùng điều kiện trong policy gồm item, bài đánh giá cấp khóa và các chương. Khi phiên bản đang phát hành khác lượt ghi danh, đặt `COURSE_SERVICE_TOKEN` để Learning yêu cầu bản cũ từ Course. Nếu Course chưa cung cấp bản đó, Learning trả `409 CONTENT_VERSION_MISMATCH`.

```text
GET http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/progress
```

Sau khi chỉ hoàn thành video, khóa mẫu trả `progressPercent: 50` và `lessonProgressPercent: 0`. Sau khi xác nhận hoàn thành bài 1, API trả `completedRequiredLessons: 1`, `totalRequiredLessons: 2` và `lessonProgressPercent: 50`.

## PRG-03 – Tiến độ theo chương

**Vị trí trong code** gồm [API chapter access](services/learning-service/src/modules/progress/progress.controller.ts#L97), [`getCourseChapterAccess()`](services/learning-service/src/modules/progress/progress.service.ts#L185), [repository lesson](services/learning-service/src/modules/progress/repositories/lesson-completions.repository.ts) và [kiểu dữ liệu chapter access](packages/contracts/src/http/learning.ts#L12).

**Backend đã hoàn thành** phần trả số bài đã xong, tổng số bài, phần trăm, trạng thái và lý do khóa. Đã kiểm thử NestJS với PostgreSQL và RabbitMQ thật, cùng Course và Quiz giả lập.

Frontend dùng dữ liệu này để hiển thị `x/y bài`, thanh tiến độ của từng chương và quyền vào chương kế tiếp.

**Ví dụ khi học.** Chương 1 có một bài học và người tạo khóa đặt điều kiện đạt ít nhất 80% ở bài kiểm tra của chương. Bạn học xong bài và làm bài kiểm tra được 79%. Màn hình có thể hiện **Chương 1 · 1/1 bài · 100%**, nhưng **chương 2 vẫn khóa** vì điểm chưa đủ. Khi bạn làm lại và đạt 80%, chương 2 mở. Con số **100%** trên thanh tiến độ cho biết bạn đã học xong số bài trong chương.

Learning đọc các bài đã được xác nhận hoàn thành qua PRG-01 theo lượt ghi danh và phiên bản nội dung. Với mỗi chương, API trả `completedLessons`, `totalLessons` và `progressPercent`. Chương rỗng trả `0%`. Trường `status` xét các item và quiz bắt buộc trong `chapterPolicies`. Khi chương trước còn thiếu điều kiện, chương sau trả `LOCKED` với `reason = PREVIOUS_CHAPTER_NOT_COMPLETED`.

```text
GET http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/chapters/access
```

| Thao tác với dữ liệu mẫu | Chương 1 | Chương 2 |
| --- | --- | --- |
| Chỉ hoàn thành video trong PRG-01 | `0/1 bài`, `0%`, `UNLOCKED` | `LOCKED` |
| Ghi hoàn thành lesson trong PRG-01, gửi quiz mẫu `chapterAttempt79` | `1/1 bài`, `100%`, `UNLOCKED` | `LOCKED` |
| Gửi tiếp quiz mẫu `chapterAttempt80` | `1/1 bài`, `100%`, `COMPLETED` | `UNLOCKED` |

Ngưỡng `80%` là policy của khóa mẫu. Mỗi khóa dùng ngưỡng do Course cấu hình cho phiên bản đã ghi danh.

## PRG-04 – Tổng hợp điểm quiz

**Vị trí trong code** gồm [`progress/quiz-scores/quiz-scores.controller.ts`](services/learning-service/src/modules/progress/quiz-scores/quiz-scores.controller.ts), [`quiz-scores.service.ts`](services/learning-service/src/modules/progress/quiz-scores/quiz-scores.service.ts) và [`progress-sync/repositories/assessment-attempts.repository.ts`](services/learning-service/src/modules/progress-sync/repositories/assessment-attempts.repository.ts). Hai đường dẫn được khai báo trong [contract OpenAPI Learning](packages/contracts/openapi/learning.json).

**Công dụng.** Cho học viên và giảng viên xem điểm cao nhất, số lượt đã chấm và trạng thái đạt của từng quiz theo phiên bản.

**Ví dụ khi xem điểm.** Bạn làm cùng một bài kiểm tra hai lần, lần đầu được 79% và lần sau được 80%. Với ngưỡng mẫu 80%, bạn thấy **2 lượt đã chấm · Cao nhất 80% · Đã đạt** sau khi cả hai kết quả được cập nhật. Giảng viên phụ trách khóa cũng có thể xem kết quả này trong bảng điểm của khóa.

**Cách hoạt động.** Sau khi PRG-06 lưu kết quả vào PostgreSQL, API lấy các lượt quiz có `quizType = GRADED` và nhóm theo khóa, học viên, quiz và `assessmentVersion`. Điểm phần trăm của mỗi lượt là `score / maxScore × 100`. `bestScorePercent` lấy giá trị cao nhất, `passed` là `true` khi có ít nhất một lượt đã đạt theo kết quả từ Quiz. PRG-07 giữ một dòng điểm cho mỗi lượt làm và phiên bản, nên việc giao lại event giữ nguyên số lượt. API trả `items: []` nếu chưa có điểm đã đồng bộ.

| API thử trên Postman | Header | Kết quả |
| --- | --- | --- |
| `GET http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/me/quiz-scores` | `X-Mock-User: studentB` | `200`. Trả điểm của chính học viên từ thời điểm lượt ghi danh hiện tại. `studentA` nhận `403 ENROLLMENT_REQUIRED` với khóa mẫu. |
| `GET http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/quiz-scores` | `X-Mock-User: instructorA` hoặc `adminA` | `200`. Trả các điểm đã đồng bộ của học viên trong khóa, bao gồm kết quả lịch sử. `instructorB` nhận `403 NOT_COURSE_OWNER`. |

Hai API dùng `page` và `limit` để phân trang, mặc định là trang 1 với 20 kết quả. `total` là số nhóm kết quả trước khi phân trang.

1. Chạy mock và gọi API học viên. Khi mới khởi động, `data.items` là `[]`.
2. Với header `X-Mock-User: studentB`, gửi `POST http://127.0.0.1:3104/__mock/events` và body `{"event":"chapterAttempt79"}`. Đọc lại API thấy `gradedAttempts: 1`, `bestScorePercent: 79`, `passed: false`.
3. Gửi tiếp `{"event":"chapterAttempt80"}` vào đường dẫn POST trên. API trả `gradedAttempts: 2`, `bestScorePercent: 80`, `passed: true`. Gửi lại event lần nữa vẫn thấy hai lượt. Ngưỡng 80% thuộc policy mẫu của quiz.

**Kiểm thử và tích hợp.** [Suite E2E](services/learning-service/test/learning-workflow.db.e2e-spec.ts) dùng PostgreSQL, RabbitMQ và Course/Quiz giả lập. [Suite Postman mock](services/learning-service/test/mock-server.test.cjs) dùng dữ liệu trong bộ nhớ. Khi ghép service, cần xác nhận Course cung cấp chủ khóa và Quiz phát `quiz.attempt.graded.v2` theo contract.

## PRG-05 – Dashboard tiến độ cá nhân

**Vị trí trong code** gồm [controller dashboard](services/learning-service/src/modules/progress/dashboard/dashboard.controller.ts), [service tiến độ và chọn bước tiếp](services/learning-service/src/modules/progress/progress.service.ts), [phần rút gọn kết quả quiz](services/learning-service/src/modules/progress/rules/recent-quiz.ts) và [contract dữ liệu](packages/contracts/src/http/learning.ts).

**Ví dụ khi học.** Bạn dừng video ở phút **1:00**. Khi mở trang học tập, khóa vừa học được đưa lên đầu và nút học tiếp đưa bạn về phút đó. Sau khi bạn xác nhận xong bài 1 và được **79%** ở bài kiểm tra của chương, dashboard hiện **1/2 bài · 50%**, hiển thị điểm 79% và gợi ý làm lại bài kiểm tra để mở chương sau.

**Cách hoạt động.** Learning lấy các lượt ghi danh còn hiệu lực của tài khoản đang đăng nhập và dùng cùng kết quả PRG-02 để hiển thị tỷ lệ theo bài. Các khóa được xếp theo mốc mới nhất trong các lần ghi nhận học, kết quả quiz hợp lệ hoặc lưu vị trí. Dashboard đưa tối đa **10 lượt quiz có chấm điểm** đã đồng bộ, mới nhất trước. Bước học tiếp dùng vị trí đã lưu nếu mục đó còn học được. Các bước khác có thể là mở mục bắt buộc, xác nhận hoàn thành bài hoặc làm quiz còn thiếu. Hết bước cần làm trả `nextStep: null`.

| API thử trên Postman | Kết quả mong đợi |
| --- | --- |
| `GET http://127.0.0.1:3104/api/v1/learning/me/dashboard` với `X-Mock-User: studentB` | `200`, có `courses`, `recentQuizzes` và `updatedAt`. Sau khi thử lưu ở phút 1:00 theo PRG-08, `courses[0].nextStep.positionSeconds` là `60`. |
| Cùng API với `X-Mock-User: studentA` | `200`, danh sách khóa và quiz rỗng vì tài khoản này chưa ghi danh trong dữ liệu mẫu. |

**Kiểm thử và tích hợp.** Đã chạy E2E với PostgreSQL, RabbitMQ và Course/Quiz giả lập. Khi ghép, giao diện dùng `lessonProgressPercent`, `nextStep` và `recentQuizzes` để hiển thị.

## PRG-06 – Đồng bộ tiến độ qua event

**Vị trí trong code** gồm [consumer RabbitMQ](services/learning-service/src/modules/progress-sync/consumers/assessment-results.consumer.ts), [controller](services/learning-service/src/modules/progress-sync/progress-sync.controller.ts), [service tra cứu](services/learning-service/src/modules/progress-sync/progress-sync.service.ts) và [`QuizClient`](services/learning-service/src/integrations/quiz.client.ts).

**Luồng quiz đã hoàn thành** phần nhận kết quả chấm, lưu PostgreSQL, retry và xử lý lại event. Function List nêu nhận hoàn thành bài và nộp quiz qua broker hoặc API đáng tin cậy. Contract hiện giao Learning xác nhận hoàn thành bài qua API PRG-01 và định nghĩa `learning.lesson.completed.v1` theo chiều Learning → Analytics. Kết quả quiz đi từ Quiz sang Learning qua `quiz.attempt.graded.v2`, sau khi có điểm. Khi ghép còn xác minh service token, chủ lượt làm và publisher của Quiz thật.

Chức năng cập nhật điểm vào Learning sau khi Quiz chấm và cho học viên kiểm tra kết quả đã đồng bộ chưa.

**Ví dụ sau khi nộp bài.** Bài kiểm tra đã có điểm 79%, nhưng trang tiến độ có thể vẫn đang chờ cập nhật. Khi Learning nhận và lưu điểm, lượt làm có trạng thái **Đã đồng bộ**. Nếu chương yêu cầu 80%, điểm 79% đã được lưu và chương kế tiếp vẫn khóa.

**Cách hoạt động**

1. Quiz gửi `quiz.attempt.graded.v2` vào RabbitMQ. Consumer kiểm tra dữ liệu event rồi ghi điểm và receipt trong cùng transaction PostgreSQL. Sau khi commit, consumer gửi `ACK`.
2. Lỗi ghi được thử lại sau 1, 5 và 30 giây. Khi hết lượt thử, consumer cố lưu receipt lỗi và chuyển bản tin vào DLQ. Có receipt lỗi đã lưu thì API trả `FAILED`. Gửi lại event hợp lệ giữ nguyên `eventId` để xử lý lại.
3. Khi học viên gọi API tra trạng thái, Learning hỏi Quiz xem lượt làm thuộc ai rồi đọc receipt của event. Chưa có receipt thì `PENDING`. Lưu điểm thành công thì `SYNCED`. Trạng thái đạt hay trượt được xét riêng dựa trên kết quả quiz và policy.

```text
GET http://127.0.0.1:3104/api/v1/learning/attempts/00000000-0000-4000-8000-000000000501/sync
POST http://127.0.0.1:3104/__mock/events
```

Gọi `GET` trước sẽ thấy `PENDING`. Gửi `POST` với `{"event":"attemptGraded"}`, rồi gọi lại `GET` để thấy `SYNCED` và `updatedAt` có thời điểm. Đổi sang `studentA` tại API `GET` sẽ nhận `403 NOT_ATTEMPT_OWNER`. Route `POST /__mock/events` chỉ dùng trên mock server. NestJS nhận điểm qua RabbitMQ.

Để thử PRG-03, gửi lần lượt `{"event":"chapterAttempt79"}` và `{"event":"chapterAttempt80"}` đến cùng URL `POST`, rồi gọi API chapter access sau mỗi lần gửi. Cả hai lượt có thể trả `SYNCED`. Chỉ lượt đủ điểm góp vào điều kiện mở chương.

## PRG-07 – Chống tính trùng event

**Vị trí trong code** gồm [repository ghi kết quả](services/learning-service/src/modules/progress-sync/repositories/assessment-attempts.repository.ts), [entity lượt làm](services/learning-service/src/modules/progress-sync/entities/assessment-attempt.entity.ts), [entity receipt](services/learning-service/src/modules/progress-sync/entities/assessment-sync-receipt.entity.ts) và [test tích hợp](services/learning-service/test/learning-workflow.db.e2e-spec.ts).

**Đã hoàn thành và kiểm thử** cho `quiz.attempt.graded.v2`. Phạm vi chống trùng cho các consumer khác sẽ được xác minh khi có triển khai.

Khi RabbitMQ giao lại bản tin, Learning giữ một kết quả điểm cho cùng lượt làm và phiên bản bài đánh giá.

**Ví dụ khi hệ thống gửi lại điểm.** Bạn làm bài kiểm tra một lần và được 80%. Nếu kết quả của lần đó được gửi lại do gián đoạn kết nối, bảng điểm vẫn ghi **1 lượt đã chấm · Cao nhất 80%**. Số lượt tăng lên 2 khi bạn làm thêm một lượt và kết quả mới đã được cập nhật.

Receipt dùng khóa `eventId`. Bảng điểm dùng cặp `attemptId + assessmentVersion`. Nếu gửi lại cùng event, repository giữ receipt đã đồng bộ và mốc `updatedAt`. Nếu bản tin dùng mã event mới nhưng chứa cùng kết quả của cùng lượt làm, Learning cho phép tra receipt theo mã mới và vẫn giữ một dòng điểm. Nếu dữ liệu điểm thay đổi trái với kết quả đã lưu, consumer chuyển bản tin sang DLQ với lý do `EVENT_CONFLICT`.

Trong Postman, gửi hai lần `POST http://127.0.0.1:3104/__mock/events` với `{"event":"chapterAttempt80"}`. Hai phản hồi có cùng `data.eventId` và `data.updatedAt`. Trường hợp cùng lượt làm có mã event khác và trường hợp mâu thuẫn được kiểm tra ở luồng NestJS và RabbitMQ.

## PRG-08 – Lưu thời điểm học gần nhất

**Vị trí trong code** gồm [controller](services/learning-service/src/modules/progress/progress.controller.ts), [service](services/learning-service/src/modules/progress/progress.service.ts), [kiểm tra dữ liệu đầu vào](services/learning-service/src/modules/progress/dto/save-resume-request.pipe.ts), [repository lưu vị trí](services/learning-service/src/modules/progress/repositories/learning-resume.repository.ts) và [migration bảng vị trí học](services/learning-service/src/database/migrations/1794528000005-create-resume-checkpoints.ts).

**Công dụng.** Lưu bài, mục đang học, vị trí dừng và thời điểm lưu để giao diện có thể mở lại đúng chỗ. PostgreSQL giữ một vị trí gần nhất cho mỗi lượt ghi danh và phiên bản nội dung. Dashboard dùng cả thời gian hoàn thành nội dung và thời gian chấm quiz đã đồng bộ để xếp khóa theo lần học gần nhất.

**Ví dụ khi học.** Bạn dừng video ở phút **1:00**. Sau khi giao diện gửi yêu cầu lưu, lần sau bạn có thể tiếp tục từ **1:00**, kể cả khi đổi thiết bị. Bạn vẫn cần đánh dấu video đã xem để ghi nhận hoàn thành. Nếu điện thoại đã lưu một vị trí mới, máy tính đang giữ dữ liệu cũ sẽ cần tải lại trước khi cập nhật.

**Cách hoạt động**

1. Learning kiểm tra học viên có lượt ghi danh còn hiệu lực. Khi lưu hoặc đọc vị trí đã có, Learning đối chiếu mục học với phiên bản đã ghi danh và áp dụng luật mở chương, học tuần tự.
2. Với video, `positionSeconds` là số giây từ 0 đến độ dài video. Với bài đọc hoặc bài kiểm tra, trường này là `null` và hệ thống ghi nhớ mục đang học.
3. Lần lưu đầu gửi `expectedRevision: 0` và nhận `revision: 1`. Để cập nhật, gửi lại số `revision` mới nhất trong `expectedRevision`. Nếu hai thiết bị lưu cùng lúc với cùng số này, một yêu cầu ghi được và yêu cầu còn lại nhận `409 REVISION_CONFLICT`. Khi đó đọc lại bằng `GET`.

| API thử trên Postman với `X-Mock-User: studentB` | Kết quả mong đợi |
| --- | --- |
| `GET http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/resume` | `200`. Ban đầu `data: null`. Sau khi lưu, trả mục đang học, vị trí, thời điểm lưu và số `revision`. |
| `PUT http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/resume` | Gửi JSON bên dưới để lưu ở giây 60. Lần đầu trả `200` với `positionSeconds: 60`, `revision: 1` và `updatedAt`. Gửi lại yêu cầu cũ trả `409 REVISION_CONFLICT`. |

```json
{
  "lessonId": "00000000-0000-4000-8000-000000000211",
  "learningItemId": "00000000-0000-4000-8000-000000000221",
  "contentVersion": 1,
  "positionSeconds": 60,
  "expectedRevision": 0
}
```

**Kiểm thử và tích hợp.** [Suite E2E](services/learning-service/test/learning-workflow.db.e2e-spec.ts) dùng PostgreSQL thật và Course giả lập. Khi ghép hệ thống, cần kiểm tra thời điểm giao diện gửi yêu cầu lưu và Course trả đúng phiên bản nội dung.

## Học lại sau khi Course sửa nội dung

**Vị trí trong code**

| Thư mục hoặc file | Công dụng |
| --- | --- |
| [`progress/migrations/`](services/learning-service/src/modules/progress/migrations/) | API internal nhận yêu cầu học lại và kiểm tra revision, item, policy. |
| [`course-item-migrations.repository.ts`](services/learning-service/src/modules/progress/repositories/course-item-migrations.repository.ts) | Ghi sổ migration và đổi trạng thái các completion trong cùng transaction. |
| [`item-migrations.ts`](services/learning-service/src/modules/progress/rules/item-migrations.ts) | Áp dụng nội dung được sửa và phiên bản quiz mới cho đúng mục của lượt ghi danh cũ. |
| [`progress-evidence.ts`](services/learning-service/src/modules/progress/rules/progress-evidence.ts) | Tính lại bằng chứng hoàn thành sau invalidation. |
| [`1794528000006-add-item-invalidations.ts`](services/learning-service/src/database/migrations/1794528000006-add-item-invalidations.ts) | Nâng dữ liệu cũ thành `COMPLETED`, thêm trạng thái và thông tin invalidation. |
| [`internal-service.guard.ts`](services/learning-service/src/common/internal-service.guard.ts) | Xác thực credential nội bộ cho endpoint migration. |
| [`course-items-migration.db.e2e-spec.ts`](services/learning-service/test/course-items-migration.db.e2e-spec.ts) | Kiểm tra học lại, dữ liệu cũ, giữ lịch sử, rollback và ghi đồng thời bằng PostgreSQL. |

**Ví dụ cho người học.** Bạn đã học xong hai bài nên khóa hiện **2/2 bài · 100%**. Người tạo khóa phát hiện video ở bài 1 bị sai và yêu cầu học lại video đó. Bài 1 hiện **Cần học lại**, tiến độ còn **1/2 bài · 50%** và chương sau có thể khóa lại theo điều kiện của chương. Bài 2 vẫn giữ kết quả đã học. Bạn xem lại video đã sửa rồi xác nhận hoàn thành bài 1, tiến độ trở lại **2/2 bài · 100%** khi các điều kiện khác đều đã đạt.

**Nếu chỉ thông báo.** Người tạo khóa sửa lỗi chính tả và gửi `NOTIFY_ONLY`. Bài đã hoàn thành vẫn được tính. Dữ liệu của mục có lý do để giao diện hiển thị thông báo.

| Chức năng bị ảnh hưởng | Cách xử lý mới |
| --- | --- |
| PRG-01 | Mục cần học lại có `status: OUTDATED`, `invalidatedAt` và `invalidationReason`. Hoàn thành lại chuyển về `COMPLETED` và xóa metadata invalidation đang áp dụng. Trạng thái `RESET` cũng được loại khỏi bằng chứng hoàn thành và cho phép học lại. |
| PRG-02/03 | Chỉ mục `COMPLETED` được tính. Bài có mục bắt buộc bị invalidated cần được xác nhận lại sau khi học lại. Policy tiếp tục quyết định trạng thái chương và khóa. |
| PRG-04/06/07 | Giữ attempt và điểm cũ để tra cứu. Khi quiz bị sửa, điều kiện mới dùng `assessmentVersion` mới. Giao lại migration hoặc event quiz cũ giữ nguyên kết quả học lại hiện có. |
| PRG-05 | Dashboard gợi ý mục cần học lại và tính lại tỷ lệ theo bài. |
| PRG-08 | Vị trí dừng của video bị sửa được trả về đầu video khi đọc lại. Số revision của checkpoint được giữ để thiết bị có thể lưu vị trí mới. Sau khi lưu, dashboard tiếp tục dùng vị trí mới đó. |

### API nội bộ và thử bằng mock

```text
POST http://127.0.0.1:3104/api/v1/internal/courses/33333333-3333-4333-8333-333333333333/migrations
Authorization: Bearer learning-mock-service-token
Content-Type: application/json
```

```json
{
  "revisionId": "00000000-0000-4000-8000-000000000901",
  "itemIds": ["00000000-0000-4000-8000-000000000902"],
  "reason": "Video đã được chỉnh sửa",
  "policy": "REQUIRE_RECOMPLETION"
}
```

Trong fixture, mục `...902` của revision mới thay video `...221` trong lượt ghi danh cũ. Mock sửa thời lượng video từ 180 xuống 30 giây. Hoàn thành video và bài đầu tiên theo PRG-01, gửi request này, rồi đọc lại API tiến độ bài để thấy `OUTDATED`. Kết quả migration thành công là `204` với body rỗng. Để thử thông báo riêng, dùng `NOTIFY_ONLY` trước khi gửi yêu cầu học lại.

Credential mẫu ở trên dành cho mock. NestJS dùng `LEARNING_SERVICE_TOKEN` được cấu hình trên server. `X-Mock-User` của học viên hoặc Admin không cấp quyền gọi migration. Endpoint được đánh dấu `INTERNAL` trong contract.

### Dữ liệu Course cần cung cấp khi ghép

Main cung cấp hướng dẫn và endpoint nhận migration. Learning đã bổ sung contract đọc context tin cậy từ Course tại `GET /api/v1/internal/course-revisions/{id}/item-migration-context`. Dữ liệu trả về theo `CourseItemMigrationContext` gồm metadata revision đã xuất bản, item đích, các item nguồn ở phiên bản cũ và yêu cầu assessment mới.

API này cần thiết vì Course có thể tạo mã chapter, lesson và item mới khi tạo revision. Learning dùng liên hệ nguồn–đích để tìm đúng completion cũ. Course cần triển khai API này cùng credential nội bộ và cung cấp nội dung sửa đúng cho học viên cũ. Test hiện giả lập phần cung cấp context. Cấu hình `COURSE_SERVICE_TOKEN` cho phía Learning khi ghép.

## Cập nhật khi làm thêm chức năng

Khi bắt đầu, ghi mã và tên chức năng theo Function List. Khi kết thúc, cập nhật trạng thái và ghi rõ phạm vi đã hoàn thành. Nếu đang làm dở, ghi phần đã chạy và phần còn thiếu. Đặt vị trí thư mục, file ngay dưới tên chức năng, rồi bổ sung công dụng, cách xử lý, API hoặc event và ví dụ có kết quả mong đợi. Thêm một ví dụ ngắn mô tả người dùng làm gì và thấy gì, bằng lời dễ hiểu cho người không đọc code. Đính kèm link test và ghi môi trường đã chạy, gồm dịch vụ thật và phần dùng giả lập.
