# Theo dõi chức năng Learning Service

Cập nhật ngày **15/11/2026** theo code trên nhánh `feat/learning/progress`, gồm các thay đổi đang có ở máy local. Mã và tên chức năng lấy từ bảng `Function List`. Kết quả kiểm thử và cách chạy lại nằm trong [báo cáo kiểm thử Learning](services/learning-service/test/TEST_REPORT.md).

Thứ tự triển khai và điều kiện hoàn thành của từng chức năng nằm trong [PLAN.md](PLAN.md).

## Xác thực Identity cho PRG, MST, ADP, CERT và INS

**Cập nhật ngày 23/11/2026.** Các controller NestJS của Learning dùng access token RS256 do Identity cấp. Cấu hình kết nối nằm trong `.env` của Learning và được mô tả trong [README](services/learning-service/README.md#xác-thực-và-kết-nối-identity).

| Vị trí | Công dụng |
| --- | --- |
| `services/learning-service/src/common/auth/learning-auth.guard.ts` | Xác minh Bearer token, hạn dùng, issuer và kiểm tra tài khoản hiện tại ở Identity. |
| `services/learning-service/src/common/auth/learning-auth.module.ts` | Đăng ký guard và Identity client để các module nghiệp vụ cùng sử dụng. |
| `services/learning-service/src/common/auth/service-token.ts` | Ký JWT nội bộ ngắn hạn cho từng thao tác gọi Identity hoặc Course ở staging/production. |
| `services/learning-service/src/integrations/identity.client.ts` | Đọc trạng thái/quyền tài khoản và lấy tên tiếng Việt để tạo PDF chứng chỉ. |
| `services/learning-service/src/integrations/course.client.ts` | Truyền access token khi đọc dữ liệu Course theo người dùng và dùng credential nội bộ khi lấy snapshot. |
| `services/learning-service/test/fixtures/identity-auth.ts` | Tạo token RSA phục vụ kiểm thử và mô phỏng API Identity với guard nội bộ thật. |
| `services/learning-service/test/learning-auth.e2e-spec.ts` | Kiểm thử token, trạng thái tài khoản, đổi vai trò và lỗi Identity. |
| `services/learning-service/test/identity-integration.db.e2e-spec.ts` | Chạy Identity thật với PostgreSQL test, đăng nhập và dùng access token gọi Learning. |

**Luồng API.** Người dùng đăng nhập qua `POST /api/v1/auth/login` của Identity và nhận `data.accessToken`. Khi gọi ví dụ `GET /api/v1/learning/me/certificates`, họ gửi `Authorization: Bearer <accessToken>`. Learning xác minh token rồi gọi `GET /api/v1/internal/users/{id}/access` bằng JWT service có scope `getUserAccess`. Khi tài khoản còn hoạt động và vai trò khớp, controller mới chạy. Các kiểm tra Student, chủ khóa và Admin trong từng chức năng tiếp tục quyết định quyền thao tác.

**Ví dụ dễ hiểu.** An đăng nhập và nhận token còn hạn 15 phút. Sau 5 phút, Admin khóa tài khoản An. Lần gọi API Learning tiếp theo trả `403` vì Identity báo tài khoản đã ngừng hoạt động. Nếu An sửa chữ ký token hoặc dùng token đã hết hạn, Learning trả `401`.

**PDF chứng chỉ.** Khi tạo tài liệu, Learning dùng JWT service với scope `getUserSummary` để đọc tên người nhận từ Identity. API xác minh QR công khai tiếp tục trả tình trạng chứng chỉ. Các ví dụ `X-Mock-User` ở những mục mock bên dưới áp dụng cho mock server riêng tại cổng `3104`.

**Trạng thái hoàn thành.** Hoàn thành xác thực Identity cho API NestJS của Learning. Kiểm thử đạt 127/127 E2E, 37/37 unit, 22/22 mock HTTP và 11/11 contract. Năm ca E2E chạy với Identity thật trên PostgreSQL test, gồm đăng nhập, tên chứng chỉ tiếng Việt, khóa tài khoản và đổi vai trò. Đã xác nhận thêm token từ Identity local cổng 3001 gọi Learning cổng 3004 và truy vấn Supabase thành công.

**Bổ sung ở Identity.** Migration `services/identity-service/src/database/migrations/1795392000000-AlignUserAuthenticationColumns.ts` thêm các cột OAuth đang được entity sử dụng, cho phép tài khoản OAuth có mật khẩu rỗng và đặt mặc định `version=1`. Môi trường mới phải chạy migration này. Database Identity local dùng container `lms-identity-local-pg` với volume lưu dữ liệu riêng; tài khoản Admin khởi tạo và mật khẩu nằm trong `services/identity-service/.env`.

**Cập nhật ngày 14/11/2026 — chốt sau kiểm thử bởi hai agent.** Learning đọc cấu trúc trực tiếp từ API internal theo phiên bản đã ghi danh. Bộ đầy đủ đạt **56/56 E2E**, gồm PostgreSQL và RabbitMQ thật; mock API đạt **10/10**. Agent thứ hai tự chạy **32/32 E2E** trong ba suite và **10/10 mock**, rồi đối chiếu logic và bản sửa. 32 ca này nằm trong bộ 56 ca, không cộng thành số test mới. Lần xác nhận trước đối chiếu 59/59 request HTTP trực tiếp. **Hoàn thành PRG-01 đến PRG-08 trong phạm vi Learning với mock/provider giả, có thể chuyển sang nhóm tiếp theo.** Xem [quy tắc snapshot](#đọc-snapshot-course-theo-lượt-ghi-danh) và [báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md).

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
| [MST-01](#mst-01--danh-sách-kỹ-năng-khóa-học) | Danh sách kỹ năng khóa học | **Hoàn thành backend và mock API với Course giả lập.** Chủ khóa quản lý danh mục, học viên xem kỹ năng đang dùng, Quiz có API nội bộ để tra mã. |
| [MST-02](#mst-02--liên-kết-câu-hỏi-với-kỹ-năng) | Liên kết câu hỏi với kỹ năng | **Hoàn thành phần kiểm tra của Learning.** Luồng lưu mapping và giữ phiên bản đã được thử với Quiz giả lập. Tích hợp QUIZ-08 còn ở phía Quiz. |
| [MST-03](#mst-03--tính-điểm-mastery) | Tính điểm mastery | **Đã lưu điểm tổng hợp và số câu với Quiz giả lập.** Hai API dùng công thức tổng điểm đạt chia tổng điểm tối đa. |
| [MST-04](#mst-04--phân-loại-mức-độ-thành-thạo) | Phân loại mức độ thành thạo | **Đã nối bộ phân loại vào API mastery.** |
| [MST-05](#mst-05--dữ-liệu-biểu-đồ-năng-lực) | Dữ liệu biểu đồ năng lực | **API trả điểm theo công thức MST-03.** |
| [MST-06](#mst-06--cập-nhật-mastery-sau-quiz) | Cập nhật mastery sau quiz | **API dùng kết quả đã commit qua RabbitMQ → PostgreSQL.** |
| [MST-07](#mst-07--lịch-sử-mastery) | Lịch sử mastery | **API phân trang các mốc đã lưu cố định vào PostgreSQL.** |
| [ADP-01](#adp-01--phát-hiện-kỹ-năng-yếu) | Phát hiện kỹ năng yếu | **Đã nối luật vào NestJS và mock API.** |
| [ADP-02](#adp-02--gợi-ý-bài-học-bổ-trợ) | Gợi ý bài học bổ trợ | **Hoàn thành phía Learning với Course giả lập.** Dùng snapshot ghi danh và luật truy cập của Progress. |
| [ADP-03](#adp-03--gợi-ý-quiz-ôn-tập) | Gợi ý quiz ôn tập | **Hoàn thành phía Learning với Quiz giả lập.** Chọn quiz luyện tập phù hợp còn mở và còn lượt làm. |
| [ADP-04](#adp-04--xếp-hạng-gợi-ý) | Xếp hạng gợi ý | **Hoàn thành.** Xếp chung bài và quiz theo tiên quyết, điểm và xu hướng, rồi phân trang. |
| [ADP-05](#adp-05--giải-thích-lý-do-đề-xuất) | Giải thích lý do đề xuất | **Hoàn thành cho gợi ý bài học và quiz luyện tập.** |
| [ADP-06](#adp-06--đồ-thị-kỹ-năng-tiên-quyết) | Đồ thị kỹ năng tiên quyết | **Hoàn thành.** Chủ khóa quản lý quan hệ theo phiên bản. API gợi ý nội dung củng cố kỹ năng cần học trước. |
| [ADP-07](#adp-07--cá-nhân-hóa-theo-lịch-sử) | Cá nhân hóa theo lịch sử | **Hoàn thành.** Xét xu hướng từ bốn lượt chấm gần nhất hợp lệ. |

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

Một bài được tính vào tổng nếu chứa ít nhất một mục bắt buộc trong policy cấp khóa hoặc cấp chương. Một bài đã xác nhận hoàn thành qua PRG-01 được đếm một lần. Nếu tổng bằng 0 thì tỷ lệ là `0`. Trạng thái `COMPLETED` dùng điều kiện trong policy gồm item, bài đánh giá cấp khóa và các chương. Learning luôn đọc cấu trúc từ API internal theo `enrollment.contentVersion`, với `COURSE_SERVICE_TOKEN`. Nếu Course chưa cung cấp bản đó, Learning trả `409 CONTENT_VERSION_MISMATCH`.

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

Dashboard và INS-03 dùng cùng mốc hoạt động học. Ví dụ, học viên lưu vị trí lúc 09:12 và giảng viên sửa nội dung lúc 11:00, màn hình vẫn hiện lần học gần nhất lúc 09:12. Tiến độ có thể cập nhật lúc 11:00 theo revision.

**Ví dụ khi học.** Bạn dừng video ở phút **1:00**. Sau khi giao diện gửi yêu cầu lưu, lần sau bạn có thể tiếp tục từ **1:00**, kể cả khi đổi thiết bị. Bạn vẫn cần đánh dấu video đã xem để ghi nhận hoàn thành. Nếu điện thoại đã lưu một vị trí mới, máy tính đang giữ dữ liệu cũ sẽ cần tải lại trước khi cập nhật.

**Cách hoạt động**

1. Learning kiểm tra học viên có lượt ghi danh còn hiệu lực. Khi lưu hoặc đọc vị trí đã có, Learning đối chiếu mục học với phiên bản đã ghi danh và áp dụng luật mở chương, học tuần tự.
2. Với video, `positionSeconds` là số giây từ 0 đến độ dài video. Với bài đọc hoặc bài kiểm tra, trường này là `null` và hệ thống ghi nhớ mục đang học.
3. Lần lưu đầu của lượt học gửi `expectedRevision: 0`. Để cập nhật, dùng số `revision` API vừa trả. Nếu cùng ID và phiên bản được dùng lại, số mới tiếp tục tăng qua các lượt để tab cũ không ghi đè vị trí mới. Nếu hai thiết bị lưu cùng lúc với cùng revision, một yêu cầu ghi được và yêu cầu còn lại nhận `409 REVISION_CONFLICT`. Khi đó đọc lại bằng `GET`.

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

## Tách tiến độ khi ghi danh lại

**Mã chức năng.** PRG-01 lưu hoàn thành, PRG-02/03 tính tiến độ và mở chương, PRG-05/08 hiển thị lần học và vị trí học tiếp. Báo cáo INS và gợi ý ADP dùng cùng dữ liệu Progress.

**Vị trí.** [Khóa lượt học](services/learning-service/src/modules/progress/repositories/progress-scope.ts), [lưu item](services/learning-service/src/modules/progress/repositories/item-completions.repository.ts), [lưu bài](services/learning-service/src/modules/progress/repositories/lesson-completions.repository.ts), [lưu vị trí](services/learning-service/src/modules/progress/repositories/learning-resume.repository.ts) và [migration PostgreSQL](services/learning-service/src/database/migrations/1794528000014-scope-progress-to-enrollment-start.ts).

Learning lấy `enrollmentId`, `contentVersion` và `enrolledAt` từ Course cho mỗi yêu cầu. Ba trường xác định lượt học dùng khi đọc, ghi hoặc tính điều kiện khóa. Học viên gọi các API tiến độ, hoàn thành và lưu vị trí hiện có. Chứng chỉ vẫn được tra theo học viên, khóa và phiên bản.

Ví dụ, An đã hoàn thành **1/2 bài** và dừng ở giây 45. Sau khi hủy rồi đăng ký lại, Course trả cùng ID và phiên bản với `enrolledAt` mới. `GET /api/v1/learning/courses/{id}/progress` trả **0/2 bài**, API `/resume` trả `data: null`, và giảng viên xem chi tiết thấy danh sách bài hoàn thành rỗng. An có thể học lại và lưu vị trí mới với `expectedRevision: 0`. PostgreSQL vẫn giữ vị trí 45 giây của lượt cũ.

Nếu vị trí cũ đã đến `revision: 2`, lần lưu đầu ở lượt mới trả `revision: 3`. Tab còn giữ revision 1 hoặc 2 sẽ nhận `409 REVISION_CONFLICT` và vị trí mới được giữ nguyên.

Migration giữ bản ghi đã có. Bản ghi tạo trước migration chỉ được dùng cho lượt hiện tại nếu thời điểm hoàn thành hoặc lưu vị trí từ mốc ghi danh của lượt đó trở đi. Khi ghi lại một bản ghi cũ đủ điều kiện, Learning gắn nó vào lượt hiện tại trong cùng giao dịch. Chạy migration cùng đợt triển khai phiên bản Learning này.

## Đọc snapshot Course theo lượt ghi danh

**Vị trí trong code** gồm [`CourseClient.structure()`](services/learning-service/src/integrations/course.client.ts) và [test HTTP snapshot](services/learning-service/test/course-snapshot.e2e-spec.ts). Thay đổi ảnh hưởng PRG-01/02/03/05/08 và việc áp dụng migration vào snapshot cũ.

**Ví dụ dễ hiểu.** Bạn đăng ký khi khóa ở phiên bản 1. Sau đó khóa được phát hành phiên bản 2 với thêm bài hoặc điều kiện khác. Learning dùng cấu trúc và policy của phiên bản 1 để tính tiến độ cho bạn. Các mục cần học lại do critical revision được áp dụng riêng qua migration.

Learning gửi một request lấy cả outline và completion policy theo phiên bản đã ghi danh.

```text
GET /api/v1/internal/courses/{id}/structure?contentVersion={enrollment.contentVersion}
Authorization: Bearer <COURSE_SERVICE_TOKEN>
X-Request-Id: <requestId>
```

Client kiểm tra cả `courseId` và `contentVersion` trong outline và policy. Thiếu credential trả `503`. Snapshot bị thiếu hoặc trả sai phiên bản dẫn tới `409 CONTENT_VERSION_MISMATCH`. Learning dừng xử lý khi chưa có đúng snapshot.

| Dữ liệu Learning đang gọi | Cách gọi hiện tại |
| --- | --- |
| Cấu trúc và policy dùng tính tiến độ | API internal `getLearningStructure`, kèm phiên bản ghi danh và credential service. |
| Quyền tra lượt quiz | API internal `getAttemptAccess` của Quiz. |
| Context revision để học lại | API internal `getCourseItemMigrationContext` của Course. |
| Danh sách khóa đã ghi danh và metadata chủ khóa | Các API theo người dùng đã có trong contract. `checkEnrollment` hiện trả trạng thái và mã ghi danh, chưa cung cấp đủ danh sách khóa và snapshot cho dashboard. |

Khi ghép, Course cần trả snapshot lịch sử, chuyển giá trị `contentVersion` từ query HTTP sang số và kiểm tra credential của caller. Các điểm này đã được đối chiếu với code main và ghi trong báo cáo.

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

## Rà soát chéo PRG-01 đến PRG-08 ngày 14/11/2026

**Vị trí code và test bổ sung**

| File | Chức năng và thay đổi |
| --- | --- |
| [`progress.service.ts`](services/learning-service/src/modules/progress/progress.service.ts) | PRG-01/02/05: khóa chỉ hoàn thành khi đủ bài bắt buộc đã xác nhận và đủ policy. `completedAt` tính cả lần xác nhận bài bắt buộc cuối. |
| [`progress-evidence.ts`](services/learning-service/src/modules/progress/rules/progress-evidence.ts) | PRG-01/03/05/06/07: nhận kết quả đúng phiên bản dù đến trước migration, kiểm tra ngưỡng khi đổi loại item sang quiz, giữ lý do thông báo của quiz đã hoàn thành. |
| [`course-items-migration.db.e2e-spec.ts`](services/learning-service/test/course-items-migration.db.e2e-spec.ts) | API NestJS với PostgreSQL: grade đến trước migration, video đổi thành quiz, ngưỡng sai, practice và thông báo quiz. |
| [`progress-audit.e2e-spec.ts`](services/learning-service/test/progress-audit.e2e-spec.ts) | API tiến độ và dashboard: đủ item/quiz nhưng chưa xác nhận bài, xác nhận từng bài rồi hoàn thành khóa. |
| [`mock-server.cjs`](services/learning-service/test/mock-server.cjs), [`mock-server.test.cjs`](services/learning-service/test/mock-server.test.cjs) | Mock và test HTTP áp dụng cùng điều kiện xác nhận bài bắt buộc với backend. |

**Bốn điểm đã sửa và ví dụ dễ hiểu**

1. **PRG-01/02/05 — xác nhận bài trước khi hoàn thành khóa.** Bạn đã xem hết nội dung và đạt mọi quiz, nhưng chưa bấm hoàn thành hai bài. API tiến độ khóa vẫn trả `IN_PROGRESS`, **0/2 bài · 0%**; dashboard dẫn tới `COMPLETE_LESSON`. Gửi `PUT /api/v1/learning/lessons/{id}/completion` cho bài 1 thì thành **1/2 · 50%**, cho bài 2 thì **2/2 · 100%** và `COMPLETED`. Mốc hoàn thành khóa bao gồm thời điểm xác nhận bài cuối. Trạng thái mở chương vẫn xét policy của chương.
2. **PRG-03/06/07 — kết quả quiz đến trước lệnh học lại.** Bạn làm đạt quiz phiên bản 2 lúc 10:01; lệnh migration đến Learning lúc 10:02. Kết quả phiên bản 2 vẫn được tính. API tiến độ khóa trả số assessment đã đạt tương ứng; không bắt làm lại chỉ vì thứ tự chuyển bản tin. Kết quả phiên bản 1 không được dùng thay phiên bản 2.
3. **PRG-01/03 — video được sửa thành quiz bắt buộc.** Course cung cấp quiz mới yêu cầu 90%. Kết quả practice hoặc kết quả được đánh dấu đạt theo ngưỡng 70% đều chưa đủ. API tiến độ bài giữ mục ở `OUTDATED`; xác nhận bài trả `409`. Khi có kết quả `GRADED`, đạt và đúng ngưỡng 90% thì mục mới hoàn thành, cho phép xác nhận bài. Ngưỡng lấy từ context tin cậy của Course, không đặt cố định 90% trong code.
4. **PRG-01/05 — thông báo sửa quiz.** Bạn đã đạt quiz; Course chỉ sửa hướng dẫn và gửi `NOTIFY_ONLY`. API tiến độ bài giữ `COMPLETED`, trả lý do để giao diện hiển thị. Event kết quả cũ đến trễ không xóa thông báo. Một kết quả hợp lệ được chấm sau thông báo sẽ xóa lý do; yêu cầu học lại mới hơn cũng thay thế thông báo cũ khi đã hoàn thành hợp lệ.

**Quy ước policy khi đổi loại.** Nếu quiz đổi thành bài đọc, Learning giữ requirement assessment của policy đã pin. Context migration hiện không chỉ rõ scope để xóa requirement cấp chương/khóa. Thay đổi requirement này cần thống nhất contract với Course; Learning không tự bỏ một điều kiện hoàn thành. Ngược lại, quiz mới của một item phải thỏa ngưỡng do Course cung cấp cho chính item đó, không tự thêm scope policy mới.

**Kết luận.** Hai agent đã chạy test riêng và đối chiếu các trường hợp trên. Chưa phát hiện lỗi chặn còn lại trong phạm vi kiểm thử hiện tại. Phần ghép Course/Quiz thật tiếp tục theo PLAN, không phải điều kiện chờ để chuyển sang chức năng Learning tiếp theo. Các sửa mới đang ở local, chưa push.

## MST-01 – Danh sách kỹ năng khóa học

| Vị trí | Công dụng |
| --- | --- |
| [`src/modules/mastery/`](services/learning-service/src/modules/mastery/) | Controller cho học viên, chủ khóa và Admin. Controller nội bộ để Quiz kiểm tra mã. Service kiểm tra quyền theo khóa rồi mới đọc hoặc ghi. |
| [`course-skills.repository.ts`](services/learning-service/src/modules/mastery/repositories/course-skills.repository.ts) | Lưu danh mục trong PostgreSQL. Khóa dòng khi sửa để kiểm tra `expectedVersion` và tăng version trong cùng transaction. |
| [`1794528000007-create-course-skills.ts`](services/learning-service/src/database/migrations/1794528000007-create-course-skills.ts) | Tạo bảng `learning_course_skills` và index theo khóa. |
| [OpenAPI Learning](packages/contracts/openapi/learning.json) | Bốn operation `listCourseSkills`, `createCourseSkill`, `updateCourseSkill` và `getCourseSkillReference`. |
| [Fixture khóa và kỹ năng](services/learning-service/test/fixtures/course-skills.mock.json), [E2E PostgreSQL](services/learning-service/test/course-skills.db.e2e-spec.ts) | Dữ liệu Postman và ca kiểm thử khóa nháp, quyền truy cập, ghi đồng thời và tra cứu nội bộ. |

**Trạng thái.** Hoàn thành phần danh mục kỹ năng trong Learning với Course giả lập. **MST-02** đã bổ sung API để Quiz kiểm tra một nhóm mã kỹ năng khi gắn câu hỏi.

**Ví dụ khi học.** Cô Mai thêm kỹ năng “Tổ chức module” vào khóa NestJS. Học viên đã ghi danh thấy kỹ năng này trong danh sách. Sau khi cô ngừng dùng một kỹ năng cũ, danh sách học viên chỉ còn kỹ năng đang dùng. Mã kỹ năng cũ vẫn còn để hệ thống đối chiếu bài quiz đã chấm trước đó.

Danh mục Learning dùng mã ổn định theo `courseId`. Bản đầu lấy danh sách hiện hành của khóa. Cách lưu tên hoặc trạng thái kỹ năng theo từng bản nội dung để phục vụ lịch sử sẽ được đối chiếu với MST-02/MST-07. Với chủ khóa hoặc Admin, Learning gọi `GET /api/v1/courses/{id}/reviews?page=1&limit=1` của Course để kiểm tra quyền trên cả khóa nháp. Học viên cần lượt ghi danh hợp lệ. API nội bộ cần `LEARNING_SKILL_LOOKUP_TOKEN`, tách với token ghi migration. Quiz sẽ chỉ dùng kỹ năng `ACTIVE` cho lần gắn mới.

Chạy `npm.cmd run start:mock -w @lms/learning-service` từ thư mục gốc rồi thử trong Postman.

| Bước | Request và dữ liệu | Kết quả mong đợi |
| --- | --- | --- |
| 1 | `GET http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/skills`, header `X-Mock-User: studentB`. | `200`, `data.skills` chỉ gồm kỹ năng đang dùng. Dùng `studentA` trả `403 ENROLLMENT_REQUIRED`. |
| 2 | `POST` đến cùng URL, header `X-Mock-User: instructorA`, gửi body tạo bên dưới. | `201`, kỹ năng mới có `status: ACTIVE` và `version: 1`. Lấy `data.id` để dùng ở bước 3. |
| 3 | `PATCH http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/skills/{skillId}`, cùng header, gửi body ngừng dùng bên dưới. | `200`, cùng mã, `status: INACTIVE` và `version: 2`. Gửi lại body với version cũ trả `409 VERSION_CONFLICT`. Đọc lại bằng học viên thấy mục đã ẩn. |
| 4 | `GET http://127.0.0.1:3104/api/v1/internal/courses/33333333-3333-4333-8333-333333333333/skills/{skillId}`, header `Authorization: Bearer learning-mock-skill-token`. | `200` và giữ trạng thái `INACTIVE` để tra lịch sử. Token ở đây dành cho mock. Sai khóa trả `404`. |

Body tạo kỹ năng. Chọn **Body → raw → JSON**.

```json
{"name":"Dependency injection","description":"Biết cách inject provider vào controller."}
```

Body ngừng sử dụng kỹ năng vừa tạo.

```json
{"status":"INACTIVE","expectedVersion":1}
```

Kết quả kiểm thử và môi trường chạy nằm ở [TEST_REPORT.md](services/learning-service/test/TEST_REPORT.md#mst-01--danh-sách-kỹ-năng-khóa-học).

## MST-02 – Liên kết câu hỏi với kỹ năng

| Vị trí | Công dụng |
| --- | --- |
| [`internal-course-skills.controller.ts`](services/learning-service/src/modules/mastery/internal-course-skills.controller.ts) | Nhận danh sách mã và kiểm tra token tra kỹ năng trước khi xử lý. |
| [`course-skills.service.ts`](services/learning-service/src/modules/mastery/course-skills.service.ts), [`course-skills.repository.ts`](services/learning-service/src/modules/mastery/repositories/course-skills.repository.ts) | Dùng một truy vấn để tìm kỹ năng hoạt động của đúng khóa. Trả các mã bị từ chối nếu có. |
| [OpenAPI Learning](packages/contracts/openapi/learning.json) | Operation `validateCourseSkills`, request `ValidateCourseSkillsRequest`, lỗi `INVALID_SKILL_REFERENCE`. |
| [Suite API và Quiz giả lập](services/learning-service/test/course-skills.db.e2e-spec.ts), [mock API](services/learning-service/test/mock-server.test.cjs) | Kiểm tra mã hợp lệ, trùng mã, token, khác khóa, ngừng dùng và lưu mapping theo phiên bản câu hỏi. |

**Ví dụ khi soạn bài.** Câu hỏi “Module dùng để làm gì?” có thể đánh giá cả kỹ năng “Tổ chức module” và “Dependency injection”. Quiz kiểm tra hai mã trong một request. Nếu một mã thuộc khóa khác, Quiz nhận danh sách mã lỗi để giảng viên chọn lại. Nếu sau này giảng viên ngừng dùng một kỹ năng, lượt làm đã lưu vẫn giữ kỹ năng đó khi đọc kết quả cũ.

### Request mẫu để thử trong Postman

```http
POST http://127.0.0.1:3104/api/v1/internal/courses/33333333-3333-4333-8333-333333333333/skills/validate
Authorization: Bearer learning-mock-skill-token
Content-Type: application/json
```

```json
{"skillIds":["00000000-0000-4000-8000-000000000a01"]}
```

| Tình huống | Kết quả mong đợi |
| --- | --- |
| Danh sách có từ 1 đến 100 mã, tất cả đang dùng và thuộc đúng khóa. | `204`, body rỗng. |
| Thêm mã mẫu `00000000-0000-4000-8000-000000000a02` đã ngừng dùng, dùng mã thuộc khóa khác hoặc mã không tồn tại. | `422 INVALID_SKILL_REFERENCE`. `error.details.skillIds` chỉ ra các mã bị từ chối. |
| Mã sai định dạng, trùng kể cả viết hoa, danh sách rỗng hoặc vượt 100 mã. | `400 VALIDATION_ERROR`. |
| Thiếu token tra kỹ năng hoặc dùng token migration. | `401 UNAUTHORIZED` khi server đã cấu hình token tra kỹ năng. |

**Luồng khi ghép QUIZ-08.** Quiz xác minh quyền giảng viên và lấy `courseId` từ quiz/câu hỏi mà nó quản lý. Lấy phần mã vừa thêm so với phiên bản câu hỏi hiện tại rồi gọi Learning bằng `LEARNING_SKILL_LOOKUP_TOKEN`. Nếu không thêm mã nào, có thể bỏ qua request. Chỉ lưu phiên bản mới sau khi nhận 204. Khi chấm, Quiz dùng mapping đã lưu của phiên bản học viên làm, nên việc chỉnh câu hỏi hoặc ngừng dùng kỹ năng không đổi kết quả cũ. Lookup `GET .../skills/{skillId}` vẫn dùng để tra mã đã ngừng dùng.

**Trạng thái.** Hoàn thành phía Learning và thử qua Quiz giả lập. Quiz thật cần gọi API trong luồng tạo/sửa câu hỏi, lưu mapping theo phiên bản và kiểm tra lại khi ghép.

## MST-03 – Tính điểm mastery

| Vị trí | Công dụng |
| --- | --- |
| [`mastery-calculator.ts`](services/learning-service/src/modules/mastery/mastery-calculator.ts) | Cộng tổng điểm đạt và tổng điểm tối đa của từng kỹ năng. |
| [`mastery.service.ts`](services/learning-service/src/modules/mastery/mastery.service.ts) | Chọn các lượt chấm hợp lệ, gom theo kỹ năng và gọi bộ tính cho điểm hiện tại và lịch sử. |
| [`mastery-results.repository.ts`](services/learning-service/src/modules/mastery/repositories/mastery-results.repository.ts), [migration 0008](services/learning-service/src/database/migrations/1794528000008-save-mastery.ts) | Lưu điểm hiện tại và snapshot lịch sử vào PostgreSQL trong cùng transaction. |
| [`mastery.mock.json`](services/learning-service/test/fixtures/mastery.mock.json), [OpenAPI Quiz](packages/contracts/openapi/quiz.json) | Fixture có số câu trong từng lượt và contract `getAssessmentSummary`. |
| [`learning-workflow.db.e2e-spec.ts`](services/learning-service/test/learning-workflow.db.e2e-spec.ts) | Kiểm tra điểm có mẫu số khác nhau qua RabbitMQ, PostgreSQL và API NestJS. |

`scorePercent = tổng score / tổng maxScore × 100`. Với kỹ năng “Tổ chức module”, hai lượt `4/10` và `18/20` cho `(4 + 18) / (10 + 20) × 100 ≈ 73,33%`. API trả điểm trước khi làm tròn, mức `PROFICIENT`, `evidenceCount: 2` và `algorithmVersion: weighted-score-v1`. Mỗi kỹ năng dùng tổng riêng. Quiz luyện tập, lượt sai phiên bản hoặc dữ liệu trùng không làm tăng số mẫu.

`GET /api/v1/learning/courses/{id}/mastery` trả và lưu điểm hiện tại vào bảng `learning_mastery_current`. Hai lượt mẫu có 3 và 5 câu nên API trả `questionCount: 8` và `evidenceCount: 2`. Nếu còn một lượt góp điểm thiếu số câu, trường `questionCount` là `null`. Thêm `/history` để đọc mốc đã lưu. [Kết quả kiểm thử](services/learning-service/test/TEST_REPORT.md#mst-03-và-mst-07--số-câu-quiz-và-snapshot)

## MST-04 – Phân loại mức độ thành thạo

| Vị trí | Công dụng |
| --- | --- |
| [`mastery-level.ts`](services/learning-service/src/modules/mastery/rules/mastery-level.ts) | Nhận điểm phần trăm đã tính và số bằng chứng của một kỹ năng, kiểm tra đầu vào rồi trả mức thành thạo. |
| [`mastery-level.spec.ts`](services/learning-service/src/modules/mastery/rules/mastery-level.spec.ts) | Kiểm tra ngay dưới, đúng và trên ngưỡng, trường hợp thiếu dữ liệu, ngưỡng tùy chỉnh và đầu vào lỗi. |
| [Kiểu `MasteryData`](packages/contracts/src/http/learning.ts) | Định nghĩa ba mức sẽ dùng trong API `getMastery` của MST-05. |

| Điểm đã tính từ dữ liệu hợp lệ | Mức |
| --- | --- |
| Dưới 40% | `BEGINNER` |
| Từ 40% đến dưới 70% | `DEVELOPING` |
| Từ 70% | `PROFICIENT` |
| Chưa có bằng chứng | Không xếp mức |

**Ví dụ khi học.** Hai học viên cùng xem kỹ năng “Tổ chức module”. Người có điểm đánh giá 0% được xếp `BEGINNER`. Người chưa có bài đánh giá chưa được xếp mức. Nếu điểm là 69,999%, mức vẫn là `DEVELOPING`. Từ đúng 70% thì lên `PROFICIENT`. Bộ phân loại so sánh giá trị trước khi làm tròn để hiển thị.

Ngưỡng mặc định lấy từ baseline. Cấu hình hai biến `LEARNING_MASTERY_DEVELOPING_MIN` và `LEARNING_MASTERY_PROFICIENT_MIN` khi khởi động NestJS. Chúng áp dụng cho cả instance và phải thỏa `0 < developingMin < proficientMin <= 100`. Mock Postman dùng mốc 40/70 mặc định. Quyền mở chương tiếp tục dùng policy khóa học.

**Ca kiểm thử ở biên.** Hai lượt `0,03/0,4` và `0,29/0,4` cho đúng 40% theo toán học. Máy có thể biểu diễn kết quả thấp hơn 40% một lượng rất nhỏ. Bộ tính giảm sai số cộng và bộ phân loại cho phép sai số ở mức biểu diễn số để trả `DEVELOPING`. Giá trị thực sự dưới ngưỡng, ví dụ 39,999%, vẫn là `BEGINNER`.

**Trạng thái.** API MST-05 và MST-07 gọi bộ phân loại trên điểm MST-03.

Chạy lại bộ kiểm tra MST-04 từ thư mục gốc bằng `npm.cmd test -w @lms/learning-service -- --runInBand mastery-level`. [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md#mst-04--phân-loại-mức-độ-thành-thạo)

## MST-05 – Dữ liệu biểu đồ năng lực

| Vị trí | Công dụng |
| --- | --- |
| [`mastery.controller.ts`](services/learning-service/src/modules/mastery/mastery.controller.ts), [`mastery.service.ts`](services/learning-service/src/modules/mastery/mastery.service.ts) | API lấy tên kỹ năng trong khóa, điểm và số lượt đánh giá của chính học viên đã ghi danh. Dùng bộ phân loại MST-04 để trả mức. |
| [`mastery-calculator.ts`](services/learning-service/src/modules/mastery/mastery-calculator.ts) | Bộ tính điểm MST-03 và `algorithmVersion`. |

`GET /api/v1/learning/courses/{id}/mastery` trả `skills` với tên, điểm, mức, `questionCount` và `evidenceCount`. Học viên chưa có bằng chứng nhận `skills: []`. Tài khoản khác hoặc chưa ghi danh bị từ chối.

`updatedAt` là thời điểm Learning tạo hoặc lưu thay đổi của bảng điểm hiện tại khi đọc mastery. Ví dụ, bạn đã thấy 90% từ một lượt. Nếu điểm của lượt làm trước đó đến muộn và làm bảng điểm đổi thành 73,33%, `updatedAt` tăng. Đọc lại cùng dữ liệu hoặc nhận lại kết quả đã đồng bộ sẽ giữ mốc này.

**Ví dụ khi học.** Với mock, trước khi có quiz đã chấm, biểu đồ chưa có cột “Tổ chức module”. Sau lượt chấm mẫu đạt 40%, cột xuất hiện ở mức `DEVELOPING`. Sau lượt thứ hai, cột lên khoảng 73,33%.

## MST-06 – Cập nhật mastery sau quiz

| Vị trí | Công dụng |
| --- | --- |
| [`assessment-results.consumer.ts`](services/learning-service/src/modules/progress-sync/consumers/assessment-results.consumer.ts), [`assessment-attempts.repository.ts`](services/learning-service/src/modules/progress-sync/repositories/assessment-attempts.repository.ts) | Luồng PRG-06/07 nhận `quiz.attempt.graded.v2`, ghi kết quả và receipt vào PostgreSQL, chống trùng theo ID event và cặp attempt/phiên bản. |
| [`mastery-timeline.ts`](services/learning-service/src/modules/mastery/rules/mastery-timeline.ts), [`mastery.service.ts`](services/learning-service/src/modules/mastery/mastery.service.ts) | Chọn kết quả đã commit theo lượt ghi danh và các phiên bản quiz hợp lệ. API đọc lại dữ liệu khi được gọi nên lần đọc sau commit nhận lượt chấm mới. |

Learning chỉ dùng điểm kỹ năng trong lượt `GRADED` thuộc học viên, khóa, phiên bản phù hợp và có bằng chứng của kỹ năng trong khóa. Kết quả quiz luyện tập không tính mastery. Khi yêu cầu học lại thay phiên bản quiz, kết quả của phiên bản cũ đã đủ căn cứ còn nằm trong lịch sử. Kết quả đúng phiên bản mới đã được chấm trước lúc Learning nhận migration được dùng từ lúc migration có hiệu lực.

Kết quả chấm có thời gian trong tương lai được giữ trong hệ thống đồng bộ. Trước mốc chấm ghi trên sự kiện, Progress và Mastery chưa dùng kết quả đó để mở chương, hiện điểm hoặc bổ sung lịch sử.

**Ví dụ khi học.** Bạn hoàn thành một quiz và Quiz gửi kết quả sang Learning. Lần đọc kế tiếp sau khi lưu thấy số lượt tăng thêm một. Nếu RabbitMQ giao lại cùng lượt, bảng vẫn giữ nguyên số lượt và lịch sử. Kịch bản dùng PostgreSQL/RabbitMQ thật và công thức MST-03.

## MST-07 – Lịch sử mastery

| Vị trí | Công dụng |
| --- | --- |
| [`mastery.controller.ts`](services/learning-service/src/modules/mastery/mastery.controller.ts), [`mastery.service.ts`](services/learning-service/src/modules/mastery/mastery.service.ts) | API phân trang các mốc mastery từ lượt chấm đã lưu, mốc gần nhất trước. Mỗi mốc có ID lượt làm, phiên bản ghi danh/quiz, thời điểm chấm, thời điểm có hiệu lực, phiên bản công thức và kết quả kỹ năng. |
| [`learning-workflow.db.e2e-spec.ts`](services/learning-service/test/learning-workflow.db.e2e-spec.ts), [`course-items-migration.db.e2e-spec.ts`](services/learning-service/test/course-items-migration.db.e2e-spec.ts) | Kiểm tra gửi lệch thứ tự, đổi phiên bản qua migration, phân trang, quyền và chống trùng. |

`GET /api/v1/learning/courses/{id}/mastery/history?page=1&limit=20` chỉ trả lịch sử cho chính học viên đã ghi danh. Lần đầu đọc mastery hoặc history sau khi có lượt hợp lệ, Learning lưu điểm, mức, tên kỹ năng, số câu và `algorithmVersion` của mốc vào `learning_mastery_snapshots`. `recordedAt` là thời điểm lưu. Lượt đến muộn có thể thêm mốc cũ và cập nhật điểm hiện tại. Mốc đã lưu giữ nguyên, kể cả khi đổi tên kỹ năng. Ví dụ, nếu đã đọc lượt 18/20 trước khi lượt 4/10 đến, lịch sử giữ 90% ở mốc đã đọc, còn mastery hiện tại là 73,33% sau khi cả hai lượt được lưu.

**Ví dụ thử trong Postman cho MST-05/06/07.** Chạy mock bằng `npm.cmd run start:mock -w @lms/learning-service`. Thêm header `X-Mock-User: studentB` cho các request dưới đây.

| Request | Kết quả mong đợi |
| --- | --- |
| `GET http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/mastery` | Ban đầu `200` và `skills: []`. |
| `GET http://127.0.0.1:3104/api/v1/internal/attempts/00000000-0000-4000-8000-000000000a12/graded`, header `Authorization: Bearer quiz-mock-service-token`. | `200`. API Quiz giả lập trả `data.skillScores[0].questionCount: 5` theo `getAssessmentSummary`. |
| `POST http://127.0.0.1:3104/__mock/events` với `{"event":"masteryAttemptFirst"}` | Trả receipt `SYNCED`. Lượt 4/10 cho 40%, `DEVELOPING`, 1 lượt và 3 câu. |
| Cùng URL POST với `{"event":"masteryAttemptSecond"}` | Thêm lượt 18/20 cho khoảng 73,33%, `PROFICIENT`, 2 lượt và 8 câu. Gửi lần nữa giữ nguyên số lượt và số câu. |
| `GET http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/mastery/history?page=2&limit=1` | `total: 2`, trang 2 trả mốc đầu tiên với 40% và 1 lượt đánh giá. |

**Trạng thái.** Đã hoàn thiện phần Learning với Quiz/Course giả lập. Khi ghép, Quiz cung cấp trường `skillScores[].questionCount` trong kết quả chấm và publisher. Dùng schema mới trên các consumer trước khi Quiz bật trường này. [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md#mst-03-và-mst-07--số-câu-quiz-và-snapshot)

## ADP-01 – Phát hiện kỹ năng yếu

| Vị trí | Công dụng |
| --- | --- |
| [`src/modules/recommendations/rules/weak-skills.ts`](services/learning-service/src/modules/recommendations/rules/weak-skills.ts) | Lọc kỹ năng đang dùng, có mức `BEGINNER` theo MST-04 và có ít nhất 5 câu đã chấm. Sắp điểm tăng dần, dùng mã kỹ năng khi bằng điểm. |
| [`test/fixtures/recommendations.mock.json`](services/learning-service/test/fixtures/recommendations.mock.json) và [`test/mock-server.cjs`](services/learning-service/test/mock-server.cjs) | Cấp kết quả chấm và liên kết kỹ năng với bài mẫu theo phiên bản. API mock dùng luật ADP-01 rồi lấy bài bổ trợ mà học viên truy cập được. |
| [Unit test](services/learning-service/src/modules/recommendations/rules/weak-skills.spec.ts) và [mock HTTP test](services/learning-service/test/mock-server.test.cjs) | Kiểm tra đủ bằng chứng, điểm sát ngưỡng, kỹ năng ngừng dùng, quyền và phân trang. |

**Ví dụ khi học.** Bạn có 35% ở kỹ năng “Tổ chức module” sau 3 câu. Hệ thống chờ thêm kết quả. Sau khi có đủ 8 câu và điểm vẫn là 35%, API mẫu gợi ý bài “Giới thiệu module” ở chương đang mở. Bài liên quan ở chương sau sẽ xuất hiện khi chương đó được mở. Ngưỡng thử là dưới 40% với cấu hình Mastery mặc định và tối thiểu 5 câu. Nếu lượt cũ thiếu số câu khiến `questionCount` là `null`, hệ thống xem bằng chứng là chưa đủ.

Chạy `npm.cmd run start:mock -w @lms/learning-service` từ thư mục gốc. Dùng header `X-Mock-User: studentB` cho các request.

| Request | Kết quả mong đợi |
| --- | --- |
| `GET http://127.0.0.1:3104/api/v1/learning/me/recommendations?page=1&limit=20` | `200` với `data.items: []` khi chưa có điểm. |
| `POST http://127.0.0.1:3104/__mock/events` với body `{"event":"recommendationFewQuestions"}` | `200`, `SYNCED`. Gọi lại GET vẫn rỗng vì mới chấm 3 câu. |
| Cùng URL POST với body `{"event":"recommendationMoreQuestions"}` | `200`, `SYNCED`. Gọi lại GET nhận một bài với `reason: LOW_MASTERY`. Lời giải thích có 35% và 8 câu. |
| Cùng URL GET với `X-Mock-User: studentA` | `200` với danh sách rỗng vì học viên này chưa ghi danh khóa mẫu. |

**Trạng thái.** Hoàn thành luật ADP-01 trong NestJS và mock HTTP. [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md#adp-01--phát-hiện-kỹ-năng-yếu)

## ADP-02 – Gợi ý bài học bổ trợ

| Vị trí | Công dụng |
| --- | --- |
| [`recommendations.controller.ts`](services/learning-service/src/modules/recommendations/recommendations.controller.ts) và [`recommendations.service.ts`](services/learning-service/src/modules/recommendations/recommendations.service.ts) | Xác thực học viên, lấy dữ liệu các khóa học viên đã ghi danh, chọn bài bổ trợ và phân trang. |
| [`mastery.service.ts`](services/learning-service/src/modules/mastery/mastery.service.ts) và [`progress.service.ts`](services/learning-service/src/modules/progress/progress.service.ts) | Đọc điểm hợp lệ từ Mastery, áp dụng các cập nhật Course và kiểm tra quyền mở nội dung thông qua luật Progress. |
| [`LessonOutline`](packages/contracts/src/http/course.ts) | Course có thể trả `skillIds` trong từng bài của snapshot đã xuất bản. |

`GET /api/v1/learning/me/recommendations?page=1&limit=20` dùng `contentVersion` của lượt ghi danh để đọc Course. API chọn bài có kỹ năng khớp và ít nhất một nội dung video hoặc bài đọc mà học viên truy cập được. Nếu nhiều kỹ năng yếu khớp một bài thì trả bài một lần. Snapshot thiếu `skillIds` sẽ không tạo gợi ý bài bổ trợ.

Learning kiểm tra chương, bài và item thuộc đúng khóa, đúng cấu trúc cha–con và đúng phiên bản ghi danh trước khi tính gợi ý. Mã UUID được chuẩn hóa để luật mở chương và chống trùng dùng cùng cách nhận diện.

Policy tham chiếu sai chương hoặc item bị từ chối với 503. Ví dụ, nếu Course gửi policy của chương 1 dưới một mã chương không có trong cấu trúc, API trả lỗi thay vì gợi ý bài ở chương 2 trước khi bạn đạt quiz chương 1.

**Ví dụ khi học.** Khóa đã xuất bản bản 2 nhưng bạn ghi danh bản 1. Learning dùng danh sách bài và kỹ năng của bản 1. Nếu cả hai bài củng cố cùng kỹ năng nhưng một bài nằm ở chương đang khóa, bạn chỉ thấy bài đang mở.

**Trạng thái.** Hoàn thành API Learning với Course giả lập. Khi ghép, Course thật cần cung cấp `skillIds` theo từng bản đã xuất bản. [Kiểm thử](services/learning-service/test/recommendations.db.e2e-spec.ts)

## ADP-03 – Gợi ý quiz ôn tập

| Vị trí | Công dụng |
| --- | --- |
| [`recommendations.service.ts`](services/learning-service/src/modules/recommendations/recommendations.service.ts) và [`progress.service.ts`](services/learning-service/src/modules/progress/progress.service.ts) | Lấy quiz trong bài theo snapshot ghi danh và áp dụng điều kiện mở chương, thứ tự học và cập nhật nội dung. |
| [`quiz.client.ts`](services/learning-service/src/integrations/quiz.client.ts) và [contract nội bộ](packages/contracts/src/internal/integration.ts) | Hỏi Quiz kỹ năng, số lượt còn và quyền tạo lượt mới theo học viên, khóa và phiên bản quiz. |
| [`content-recommendations.ts`](services/learning-service/src/modules/recommendations/rules/content-recommendations.ts) | Chọn quiz `PRACTICE` có kỹ năng cần ôn và được bắt đầu. Trả mã bài và `learningItemId` của quiz để giao diện mở nội dung. |

**Ví dụ khi học.** Sau hai kết quả mẫu của ADP-01, bạn có 35% từ 8 câu. Hoàn thành video đầu tiên thì “Quiz ôn tập module” xuất hiện với **2 lượt còn lại**. Quiz đã dùng hết lượt hoặc chưa đủ điều kiện được lọc ra. Quiz ở chương sau xuất hiện khi chương đã mở và bạn hoàn thành bài đọc đứng trước quiz.

Để thử bằng Postman, gửi hai event mẫu của ADP-01 với `X-Mock-User: studentB`. Gọi `PUT http://127.0.0.1:3104/api/v1/learning/items/00000000-0000-4000-8000-000000000221/completion` với JSON `{"completed":true,"contentVersion":1}`, rồi gọi lại `GET http://127.0.0.1:3104/api/v1/learning/me/recommendations`. Kết quả có bài bổ trợ và quiz luyện tập.

API Quiz giả lập có thể thử riêng bằng `GET http://127.0.0.1:3104/api/v1/internal/quizzes/00000000-0000-4000-8000-000000000b41/recommendation-context?courseId=33333333-3333-4333-8333-333333333333&userId=00000000-0000-4000-8000-000000000002&assessmentVersion=2` với header `Authorization: Bearer quiz-mock-service-token`. Phản hồi trả `canStart: true` và `attemptsRemaining: 2`. Gọi lại giữ nguyên số lượt.

**Trạng thái.** Hoàn thành ADP-03 cho quiz luyện tập gắn trong bài với Quiz/Course giả lập. Quiz thật cần triển khai `getQuizRecommendationContext`. Nếu mở rộng sang quiz đặt cuối chương, cần thống nhất định dạng điều hướng vì contract hiện yêu cầu `lessonId`. [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md#adp-03--gợi-ý-quiz-ôn-tập)

## ADP-04 – Xếp hạng gợi ý

| Vị trí | Công dụng |
| --- | --- |
| [`rank-recommendations.ts`](services/learning-service/src/modules/recommendations/rules/rank-recommendations.ts) | Xếp chung bài và quiz, bỏ mục trùng theo khóa/bài/item rồi trả thứ tự ổn định. |
| [`recommendations.service.ts`](services/learning-service/src/modules/recommendations/recommendations.service.ts) | Gom kết quả các khóa của học viên và phân trang sau khi xếp hạng. |

API `GET /api/v1/learning/me/recommendations?page=1&limit=20` ưu tiên nội dung giúp đạt kỹ năng tiên quyết. Các nội dung còn lại xếp theo điểm Mastery đã cộng mức điều chỉnh từ ADP-07. Khi bằng ưu tiên, dùng điểm gốc, mã khóa, thứ tự bài và item, sau đó dùng mã bài/item để phân định. Mỗi mục chỉ xuất hiện một lần.

**Ví dụ khi học.** Một bài bổ trợ và quiz cùng củng cố một kỹ năng, với bài xuất hiện trước quiz trong cấu trúc khóa. Sau khi bạn mở được cả hai, trang 1 với `limit=1` trả bài và trang 2 trả quiz. Gọi lại cùng dữ liệu sẽ thấy cùng thứ tự.

## ADP-05 – Giải thích lý do đề xuất

| Vị trí | Công dụng |
| --- | --- |
| [`rules/content-recommendations.ts`](services/learning-service/src/modules/recommendations/rules/content-recommendations.ts) | Tạo `reason: LOW_MASTERY` và câu giải thích dựa trên tên kỹ năng, điểm, số câu đã chấm và tên nội dung. Với quiz, lý do có thêm số lượt còn. Mock và NestJS dùng chung luật này. |

Ví dụ API trả **“Kỹ năng Tổ chức module đạt 35% từ 8 câu đã chấm. Ôn bài Giới thiệu module.”** Nếu bài liên quan cả kỹ năng 35% và kỹ năng 38%, lời giải thích dùng kỹ năng 35%.

**Trạng thái.** Hoàn thành cho bài học bổ trợ và quiz luyện tập. [Các request Postman](#adp-01--phát-hiện-kỹ-năng-yếu)

## ADP-06 – Đồ thị kỹ năng tiên quyết

| Vị trí | Công dụng |
| --- | --- |
| [`skill-prerequisites.controller.ts`](services/learning-service/src/modules/recommendations/skill-prerequisites.controller.ts) | API đọc/lưu cho chủ khóa hoặc Admin. |
| [`skill-prerequisites.repository.ts`](services/learning-service/src/modules/recommendations/repositories/skill-prerequisites.repository.ts) và [migration](services/learning-service/src/database/migrations/1794528000009-create-skill-prerequisites.ts) | Lưu đồ thị theo khóa trong PostgreSQL, kiểm tra trạng thái kỹ năng và chặn ghi đè từ hai thiết bị. |
| [`prerequisite-graph.ts`](services/learning-service/src/modules/recommendations/rules/prerequisite-graph.ts) | Từ chối trùng và chu trình. Duyệt quan hệ nhiều cấp để tìm kỹ năng cần củng cố trước. |

`GET /api/v1/learning/courses/{id}/skill-prerequisites` trả danh sách cạnh và `version`. Dùng `PUT` cùng URL để thay cả danh sách. Gửi `expectedVersion` bằng phiên bản mới nhất hoặc 0 ở lần đầu. Mỗi cạnh gồm `skillId` và `prerequisiteSkillId`.

**Ví dụ khi học.** Giảng viên đặt “Cấu hình ứng dụng” cần học trước “Tổ chức module”. Nếu bạn chưa đạt mức `PROFICIENT` ở “Cấu hình ứng dụng”, gợi ý chuyển sang bài củng cố kỹ năng đó với lý do `SKILL_PREREQUISITE`, miễn là bài đang truy cập được. Quan hệ có kỹ năng đã ngừng dùng được bỏ qua khi đọc gợi ý. Đồ thị áp dụng theo khóa, còn bài và quiz vẫn lấy theo phiên bản ghi danh.

Trong mock, dùng `X-Mock-User: instructorA` để bật kỹ năng `00000000-0000-4000-8000-000000000a02` thành `ACTIVE` qua API sửa kỹ năng MST-01 với `expectedVersion: 2`. Sau đó gửi JSON dưới đây tới `PUT http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/skill-prerequisites`. Đọc lại bằng phương thức GET sẽ thấy `version: 1`.

```json
{
  "expectedVersion": 0,
  "edges": [
    {
      "skillId": "00000000-0000-4000-8000-000000000a01",
      "prerequisiteSkillId": "00000000-0000-4000-8000-000000000a02"
    }
  ]
}
```

## ADP-07 – Cá nhân hóa theo lịch sử

| Vị trí | Công dụng |
| --- | --- |
| [`mastery.service.ts`](services/learning-service/src/modules/mastery/mastery.service.ts) | Đọc các lượt chấm hợp lệ theo học viên, lượt ghi danh và phiên bản quiz đang dùng. |
| [`rank-recommendations.ts`](services/learning-service/src/modules/recommendations/rules/rank-recommendations.ts) | Trong 30 ngày, so điểm tổng đạt trên tổng tối đa của hai lượt gần nhất với hai lượt liền trước. Cộng hoặc trừ tối đa 5 điểm vào thứ tự ưu tiên. |

**Ví dụ khi học.** Hai lượt trước đạt 55% và hai lượt mới đạt 13%. Kỹ năng có Mastery 34% và xu hướng giảm 42 điểm phần trăm. Khi xếp gợi ý, ưu tiên được tính như 29 điểm vì giới hạn điều chỉnh là 5. Mức điều chỉnh chỉ dùng khi xếp hạng, API Mastery vẫn trả điểm tổng 34%. Thiếu bốn lượt hợp lệ trong 30 ngày thì xếp theo điểm hiện tại.

Khi nhiều lượt trở nên hợp lệ cùng lúc sau migration, thời điểm chấm quyết định lượt nào gần hơn. Nếu thời điểm chấm cũng trùng, mã lượt và phiên bản tạo thứ tự ổn định.

Điểm quiz có thời điểm chấm trong tương lai được giữ trong dữ liệu đồng bộ. API gợi ý chỉ dùng điểm và điều kiện mở nội dung đã có hiệu lực tại lúc bắt đầu request.

Để thử mock từ đầu, gửi lần lượt `recommendationTrendFirst`, `recommendationTrendSecond`, `recommendationTrendThird` và `recommendationTrendFourth` qua `POST http://127.0.0.1:3104/__mock/events` với `X-Mock-User: studentB`. Gọi API gợi ý, lời giải thích có “giảm 42 điểm phần trăm”.

**Trạng thái nhóm ADP.** Hoàn thành ADP-01 đến ADP-07 phía Learning với Course/Quiz giả lập. Khi ghép thật, xác minh Course trả `LessonOutline.skillIds` và Quiz cung cấp kỹ năng, quyền cùng số lượt còn theo phiên bản. [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md)

## CERT-07 – Admin thu hồi chứng chỉ

**Hoàn thành phía Learning với tài khoản, Course và Identity giả lập.** Thu hồi giữ hồ sơ chứng chỉ và PDF trong PostgreSQL. Lý do, người thu hồi và thời điểm thu hồi được lưu cùng bước chuyển sang `REVOKED`.

| Vị trí | Công dụng |
| --- | --- |
| [`certificates.controller.ts`](services/learning-service/src/modules/certificates/certificates.controller.ts) | `AdminCertificatesController` kiểm tra tài khoản `ADMIN` đang hoạt động, kiểm tra ID và lý do. |
| [`certificates.repository.ts`](services/learning-service/src/modules/certificates/repositories/certificates.repository.ts) và [migration thu hồi](services/learning-service/src/database/migrations/1794528000012-add-certificate-revocation.ts) | Giao dịch dùng cùng khóa PostgreSQL với thao tác cấp lại. Lần thu hồi đầu tiên ghi `REVOKED`, `revokedAt`, `revokedBy` và lý do. Gửi lặp trả cùng bản ghi thu hồi. Khi tạo PDF bổ sung, Learning kiểm tra lại trạng thái dưới cùng khóa trước khi ghi. |
| [`certificates.service.ts`](services/learning-service/src/modules/certificates/certificates.service.ts) | QR tra cứu trạng thái hiện tại theo mã xác minh. API công khai chỉ trả trạng thái kèm các trường công khai theo contract. |

**Gọi API thu hồi.** `PUT http://127.0.0.1:3004/api/v1/admin/certificates/{id}/revocation`. Trong môi trường mock, gửi `X-Mock-User: adminA`, `Content-Type: application/json`. `{id}` là ID từ phản hồi cấp chứng chỉ. Lý do từ 1 đến 500 ký tự và phải có nội dung.

```json
{ "reason": "Phát hiện sai sót trong hồ sơ cấp chứng chỉ" }
```

| Tình huống | Kết quả |
| --- | --- |
| Admin thu hồi chứng chỉ tồn tại | `200`, trả `certificateId`, `status: "REVOKED"`, `revokedAt`, `revokedBy` và `reason`. Gửi lại trả lý do và thời điểm đã lưu ở lần đầu. |
| Học viên hoặc giảng viên yêu cầu thu hồi | `403 FORBIDDEN`. Thiếu xác thực trả `401`. |
| Lý do rỗng hoặc ID sai định dạng | `400 VALIDATION_ERROR`. ID hợp lệ nhưng không có chứng chỉ trả `404 NOT_FOUND`. |
| Quét QR trên PDF sau khi thu hồi | `200` với `valid: false`, `status: "REVOKED"`, `courseTitle`, `recipientName` và `issuedAt` đều `null`. Mã lạ trả `status: null`. Chứng chỉ đã thay thế trả `SUPERSEDED` và `valid: true` để xác nhận lịch sử. |
| Chủ sở hữu yêu cầu tải hoặc cấp lại cùng phiên bản | `409 CERTIFICATE_REVOKED`, kể cả khi gửi lại key cấp cũ. Bản mới vẫn có thể được cấp khi Course xác nhận học viên đã chọn phiên bản mới và tiến độ đủ điều kiện. |

**Ví dụ.** Admin phát hiện chứng chỉ của Dương có sai sót rồi thu hồi. Dương đã tải PDF trước đó vẫn có file trên máy. Khi bất kỳ ai quét QR trên file này, hệ thống báo chứng chỉ đã thu hồi. Nếu chứng chỉ cũ chưa có PDF và Admin hoàn tất thu hồi lúc yêu cầu tải đang đợi Identity, yêu cầu tải nhận `409`. Chỉ phản hồi dành cho Admin có lý do và người thu hồi.

Ca tích hợp dùng [bộ kiểm thử chứng chỉ](services/learning-service/test/certificates.db.e2e-spec.ts), dựng ảnh từ PDF thật và gọi URL lấy từ QR trước và sau thu hồi. Chạy lệnh ở mục PDF bên dưới. Khi ghép hệ thống thật, cần nối xác thực Admin với Identity của hệ thống.

## CERT-02/03/05 – Tạo PDF, tải PDF và xác minh qua QR

**Hoàn thành phía Learning với mock Course và Identity.** `CERT-02` tạo PDF. `CERT-03` cung cấp danh sách đã có và API tải PDF cho chủ sở hữu. `CERT-05` kiểm tra QR trỏ tới API xác minh theo mã chứng chỉ.

| Vị trí | Công dụng |
| --- | --- |
| [`pdf/certificate-pdf.ts`](services/learning-service/src/modules/certificates/pdf/certificate-pdf.ts) | Tạo PDF A4 ngang, nhúng font Be Vietnam Pro, in tên học viên, tên khóa, ngày cấp theo giờ Việt Nam, phiên bản và mã xác minh. Mã QR trỏ tới API xác minh công khai. |
| [`identity.client.ts`](services/learning-service/src/integrations/identity.client.ts) | Lấy `displayName` từ `GET /api/v1/users/me` tại `IDENTITY_URL`. Kiểm tra ID và trạng thái khớp học viên đang yêu cầu. Ca kiểm thử dùng hồ sơ giả lập. |
| [`certificates.repository.ts`](services/learning-service/src/modules/certificates/repositories/certificates.repository.ts) và [migration PDF](services/learning-service/src/database/migrations/1794528000011-create-certificate-documents.ts) | Lưu tên đã in và PDF vào bảng `learning_certificate_documents`. Với chứng chỉ mới, chứng chỉ, PDF, trạng thái thay thế và key chống gửi lặp được lưu trong cùng giao dịch. |
| [`certificates.controller.ts`](services/learning-service/src/modules/certificates/certificates.controller.ts) | Kiểm tra tài khoản sở hữu và trả PDF dưới dạng file đính kèm. |

**Luồng API.** Học viên đủ điều kiện gọi `POST /api/v1/learning/courses/{id}/certificate` với `Idempotency-Key`. `201` trả `downloadUrl` sau khi PostgreSQL lưu thành công PDF. Dùng `GET /api/v1/learning/me/certificates/{id}/download` với `X-Mock-User: studentB` trong môi trường mock. Chủ sở hữu nhận `200 application/pdf` và file `chung-chi-{id}.pdf`. Tài khoản khác nhận `404`, request thiếu xác thực nhận `401`. `id` là ID chứng chỉ trong phản hồi cấp, còn QR dùng `verificationCode`.

**Ví dụ.** Nguyễn Thị Ánh Dương hoàn thành khóa NestJS căn bản. Chứng chỉ ghi đúng tên và dấu tiếng Việt. Nếu Dương đổi tên hồ sơ sau khi cấp, API vẫn tải đúng PDF đã lưu. Khi mã QR được mở, `GET /api/v1/certificates/verify/{code}` trả `valid: true` nếu chứng chỉ đang hiệu lực. Chứng chỉ cũ được tạo trước bước PDF sẽ được bổ sung file khi chủ sở hữu tải lần đầu hoặc gửi lại yêu cầu cấp. Tên in trên bản bổ sung được lấy từ hồ sơ tại thời điểm tạo PDF, còn ID chứng chỉ và ngày cấp được giữ nguyên.

**Chạy kiểm thử.** Cấu hình `TEST_DATABASE_URL` tới PostgreSQL cục bộ có tên database kết thúc bằng `_test`. Đặt `TEST_PDF_RENDERER` tới `pdftoppm` để chạy thêm ca dựng ảnh và đọc QR. Bộ test khởi động Course, Identity và Learning trên cổng riêng.

```powershell
$env:TEST_PDF_RENDERER = (Get-Command pdftoppm).Source
npm.cmd run test:e2e -w @lms/learning-service -- --runInBand certificates.db.e2e-spec.ts
```

`LEARNING_PUBLIC_URL` là địa chỉ được ghi vào QR lúc cấp PDF. Khi thử bằng điện thoại, đặt biến này thành địa chỉ Learning hoặc Gateway mà điện thoại truy cập được trước khi cấp. Mặc định `127.0.0.1:3004` dùng trên chính máy chạy service. File đã lưu giữ QR gốc. [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md)

## CERT-01/04/06 – Cấp chứng chỉ và chống cấp trùng bằng PostgreSQL

**Cập nhật contract CERT-06.** API cấp và danh sách trả `status` và `supersededByCertificateId`. Chứng chỉ cũ trỏ đến bản thay thế trực tiếp. Migration bổ sung liên kết cho hồ sơ cũ khi tìm được bản thay thế theo thời điểm cấp đã lưu. [Migration](services/learning-service/src/database/migrations/1794528000013-link-certificate-replacements.ts)

**Hoàn thành phía Learning với Course giả lập.** NestJS dùng PostgreSQL để lưu chứng chỉ và kết quả yêu cầu cấp. Course giả lập trả ghi danh và cấu trúc theo phiên bản đã chọn. Các bài học và điểm quiz dùng để xét cấp được ghi vào PostgreSQL của Learning trong kiểm thử.

| Mã và chức năng | Vị trí | Cách hoạt động |
| --- | --- | --- |
| **CERT-01 – Kiểm tra đủ điều kiện** | [`certificates.service.ts`](services/learning-service/src/modules/certificates/certificates.service.ts), [`progress.service.ts`](services/learning-service/src/modules/progress/progress.service.ts) | Learning đọc `enrollment.contentVersion` từ Course, tải snapshot nội bộ của đúng phiên bản và dùng chung cách tính Progress. Policy phải bật `certificateEnabled` và trạng thái toàn khóa phải là `COMPLETED`. |
| **CERT-04 – Mã xác minh duy nhất** | [`certificates.repository.ts`](services/learning-service/src/modules/certificates/repositories/certificates.repository.ts), [`1794528000010-create-certificates.ts`](services/learning-service/src/database/migrations/1794528000010-create-certificates.ts) | Khi tạo chứng chỉ mới, Learning sinh mã ngẫu nhiên 32 ký tự. Ràng buộc PostgreSQL bảo đảm mã duy nhất trên toàn bảng. |
| **CERT-06 – Chống cấp trùng và cấp lại bản mới** | [`repositories/`](services/learning-service/src/modules/certificates/repositories/), [`entities/`](services/learning-service/src/modules/certificates/entities/) | PostgreSQL áp dụng khóa `(userId, courseId, contentVersion)` và giữ tối đa một bản hiện hành cho mỗi học viên và khóa. Nếu Course tạo lượt ghi danh khác cho cùng phiên bản, API vẫn trả ID và mã của chứng chỉ đã cấp. Lưu bản mới, chuyển bản cũ sang `SUPERSEDED` và ghi key trong cùng một giao dịch. |

Các route nằm ở [`certificates.controller.ts`](services/learning-service/src/modules/certificates/certificates.controller.ts). Khi NestJS chạy ở cổng mặc định `3004`, dùng các đường dẫn sau. Điền `{id}` bằng ID khóa có ghi danh trong môi trường đang gọi.

| API | Kết quả mong đợi |
| --- | --- |
| `POST http://127.0.0.1:3004/api/v1/learning/courses/{id}/certificate` cùng `Idempotency-Key`, body trống | `201` và dữ liệu chứng chỉ khi đủ điều kiện. `409 CERTIFICATE_NOT_ELIGIBLE` khi còn thiếu, ví dụ tất cả bài đã xong nhưng quiz cuối chưa đạt. Dùng key mới khi yêu cầu chứng chỉ của bản học lại. |
| `GET http://127.0.0.1:3004/api/v1/learning/me/certificates?page=1&limit=20` | `200`, danh sách phân trang của tài khoản hiện tại, có cả bản đã thay thế. |
| `GET http://127.0.0.1:3004/api/v1/certificates/verify/{code}` | `200` với `ACTIVE` hoặc `SUPERSEDED` và `valid: true`. Trạng thái cho biết bản đang hiệu lực hay bằng chứng lịch sử. `REVOKED` và mã lạ trả `valid: false`, mã lạ có `status: null`. |

**Ví dụ.** An hoàn thành bản 1 của khóa NestJS và nhận chứng chỉ A. Hôm sau giảng viên xuất bản bản 2. A vẫn `ACTIVE` khi An chưa chọn học lại hoặc đang học dở. Sau khi An học xong bản 2 và đạt quiz bắt buộc, yêu cầu với key mới cấp chứng chỉ B. Danh sách cho thấy A là `SUPERSEDED` và `supersededByCertificateId` của A là ID của B. QR của A vẫn xác minh được lịch sử với `valid: true`. Nếu thao tác lưu B gặp lỗi, A vẫn `ACTIVE`.

[`certificates.db.e2e-spec.ts`](services/learning-service/test/certificates.db.e2e-spec.ts) khởi động một API Course giả lập và NestJS, chạy migration trên PostgreSQL test rồi gọi đủ ba API ở trên. Cấu hình `TEST_DATABASE_URL` trỏ đến database cục bộ có tên kết thúc `_test` và chạy lệnh sau từ thư mục gốc.

```powershell
npm.cmd run test:e2e -w @lms/learning-service -- --runInBand certificates.db.e2e-spec.ts
```

Mock xác nhận việc học lại bằng cách trả lượt ghi danh đã chọn bản 2. Khi kết nối Course thật, cần đối chiếu trường xác nhận phiên bản được phép cấp lại và cách ghi nhận lượt học lại. Xem mục CERT-02/03/05 để biết cách tải và xác minh PDF, và mục CERT-07 để biết cách thu hồi.

Khi Course dùng lại cùng `enrollmentId` cho bản mới, `enrolledAt` phải là mốc của lượt học lại và sau thời điểm cấp chứng chỉ cũ. Ví dụ, nếu Course chỉ đổi bản 1 thành bản 2 nhưng vẫn trả ngày ghi danh cũ, yêu cầu cấp mới trả `409 CERTIFICATE_NOT_ELIGIBLE` và chứng chỉ bản 1 vẫn hiệu lực.

## CERT-01/04/06 – Cấp chứng chỉ và chống cấp trùng (mock)

| Vị trí | Công dụng |
| --- | --- |
| [`test/certificates.mock.cjs`](services/learning-service/test/certificates.mock.cjs) | Kiểm tra điều kiện cấp, sinh mã, trả chứng chỉ cũ khi cấp lặp và chuyển hiệu lực khi cấp bản mới. |
| [`test/fixtures/certificates.mock.json`](services/learning-service/test/fixtures/certificates.mock.json) | Mô phỏng lượt học Course bản 2 và policy cho phép cấp. |
| [`test/mock-server.cjs`](services/learning-service/test/mock-server.cjs) và [`test/mock-server.test.cjs`](services/learning-service/test/mock-server.test.cjs) | Mở các route theo contract và kiểm thử bằng HTTP từ bên ngoài mock server. |

Chạy `npm.cmd run start:mock -w @lms/learning-service` từ thư mục gốc. Dùng `X-Mock-User: studentB` cho các request của học viên. Việc xác minh công khai qua mã chỉ cần URL.

| Request | Kết quả |
| --- | --- |
| `POST http://127.0.0.1:3104/api/v1/learning/courses/33333333-3333-4333-8333-333333333333/certificate`, header `Idempotency-Key: cert-v1`, body để trống | Trả `409 CERTIFICATE_NOT_ELIGIBLE` nếu còn thiếu điều kiện. Sau khi học xong và đạt quiz bắt buộc, trả `201` với ID và mã xác minh. |
| Gửi lại POST với key cũ hoặc key mới khi đang yêu cầu cùng phiên bản | `201` với cùng ID và mã theo contract mock hiện tại. |
| `GET http://127.0.0.1:3104/api/v1/learning/me/certificates?page=1&limit=20` | `200` với danh sách chứng chỉ của chính tài khoản. |
| `GET http://127.0.0.1:3104/api/v1/certificates/verify/{code}` | `200` với `valid: true` cho `ACTIVE` và `SUPERSEDED`. Mã lạ trả `status: null` và `valid: false`. |

**Thử cấp bản 1 từ đầu.** Gửi các request theo thứ tự bên dưới. Các PUT dùng JSON `{"completed":true,"contentVersion":1}`. Hai POST event gửi JSON với trường `event`.

1. `PUT http://127.0.0.1:3104/api/v1/learning/items/00000000-0000-4000-8000-000000000221/completion` và `PUT http://127.0.0.1:3104/api/v1/learning/lessons/00000000-0000-4000-8000-000000000211/completion`.
2. `POST http://127.0.0.1:3104/__mock/events` với `{"event":"chapterAttempt80"}` để mở chương 2.
3. `PUT http://127.0.0.1:3104/api/v1/learning/items/00000000-0000-4000-8000-000000000222/completion` và `PUT http://127.0.0.1:3104/api/v1/learning/lessons/00000000-0000-4000-8000-000000000212/completion`. Gọi API cấp ở bước này vẫn nhận 409 vì thiếu quiz cuối khóa.
4. `POST http://127.0.0.1:3104/__mock/events` với `{"event":"attemptGraded"}`, rồi gọi API cấp để nhận chứng chỉ bản 1.

**Thử học lại và cấp bản 2.** Giữ mã xác minh bản 1. Gửi lần lượt các event sau qua `POST /__mock/events`. Dùng một `Idempotency-Key` mới cho yêu cầu cấp bản 2.

| Event giả lập | Kết quả khi kiểm tra |
| --- | --- |
| `certificatePublishVersion2` | Gọi cấp với key mới khi chưa chọn học lại vẫn nhận chứng chỉ bản 1. |
| `certificateStartRetake` | Yêu cầu cấp bản 2 nhận 409. Mã bản 1 vẫn xác minh hợp lệ. |
| `certificateCompleteRetake` | Gọi cấp với key mới nhận bản 2. Gọi lặp trả cùng mã bản 2. Bản 1 trỏ đến bản 2 trong danh sách và QR của bản 1 trả `SUPERSEDED`, `valid: true`. |

**Trạng thái.** CERT-01/04/06/07 hoạt động trên mock HTTP trong bộ nhớ. Trường `downloadUrl` là URL mẫu ở bộ mock này. Để tải PDF thật và thử QR, dùng ca NestJS và PostgreSQL ở phần trên. [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md#cert-010406--mock-cấp-chứng-chỉ)

## Báo cáo giảng viên — INS-03, INS-06, INS-07 và INS-09

**Trạng thái.** Hoàn thành trong phạm vi Learning dùng Course giả lập, dữ liệu điểm đã đồng bộ vào PostgreSQL và HTTP của NestJS. [Ca kiểm thử API](services/learning-service/test/instructor-reports.db.e2e-spec.ts) · [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md#báo-cáo-giảng-viên--ins-03-ins-06-ins-07-và-ins-09)

| File | Công dụng |
| --- | --- |
| [instructor-reports.module.ts](services/learning-service/src/modules/instructor-reports/instructor-reports.module.ts) | Nối module báo cáo với Course, Progress và Mastery. |
| [instructor-reports.controller.ts](services/learning-service/src/modules/instructor-reports/instructor-reports.controller.ts) | Khai báo API, xác thực vai trò, kiểm tra tham số và trả dữ liệu theo contract. |
| [instructor-reports.service.ts](services/learning-service/src/modules/instructor-reports/instructor-reports.service.ts) | Đọc danh sách ghi danh đã được Course xác nhận quyền, lấy cấu trúc đúng phiên bản ghi danh và tổng hợp báo cáo. |
| [course.client.ts](services/learning-service/src/integrations/course.client.ts), [course-learning-structure.ts](services/learning-service/src/integrations/course-learning-structure.ts) | Lấy ghi danh và cấu trúc đúng phiên bản, kiểm tra nội dung lồng nhau thuộc đúng khóa, chuẩn hóa UUID để các module nhận cùng dữ liệu. |
| [progress.service.ts](services/learning-service/src/modules/progress/progress.service.ts), [mastery.service.ts](services/learning-service/src/modules/mastery/mastery.service.ts) | Progress đọc trạng thái cập nhật khóa, bài, quiz và vị trí học tiếp của từng học viên từ cùng một ảnh chụp PostgreSQL. Mastery cung cấp kết quả kỹ năng từ điểm đã đồng bộ. |

Các API bên dưới dùng tiền tố `/api/v1/learning/courses/{id}`. Khi kiểm thử local với mock, giảng viên sở hữu khóa dùng `X-Mock-User: instructorA`.

### INS-03 — Tiến độ từng học viên

`GET /learners?page=1&limit=20` trả danh sách. Giao diện dùng `completedRequiredLessons`, `totalRequiredLessons` và `lessonProgressPercent`. `GET /learners/{userId}` trả thêm `completedLessons` với tên và thời điểm hoàn thành cùng `lastActivityAt`. Lần học gần nhất lấy từ hoàn thành bài hoặc item, kết quả quiz đã đồng bộ và vị trí học tiếp. Người chưa học có `lastActivityAt: null`.

Ví dụ, An học bản 1 và xong 1/2 bài nên danh sách hiện **50%**. Bình ở bản 2 mới ghi danh nên hiện **0/3 bài**. Mở chi tiết của An sẽ thấy bài **Giới thiệu module** và lần lưu vị trí học lúc **09:12 UTC**. Nếu bài đó cần học lại, danh sách bài đã hoàn thành hợp lệ của An sẽ rỗng, còn lần học gần nhất vẫn là **09:12 UTC**. [Dữ liệu ví dụ và kết quả API](services/learning-service/test/fixtures/INS-03-MOCK.md)

Nếu lần học gần nhất của An là nộp quiz bản 1 lúc **10:00 UTC**, và Course sau đó yêu cầu làm bản 2, báo cáo vẫn hiện **10:00 UTC**. Điều kiện hoàn thành dùng bản quiz mới.

### INS-06 — Tỷ lệ hoàn thành khóa

`GET /statistics?fromAt=2026-01-01T00:00:00Z&toAt=2026-02-01T00:00:00Z` chọn lượt ghi danh từ đầu tháng 1 đến trước đầu tháng 2 theo UTC. API tính tiến độ hiện tại của nhóm đó. `completionRatePercent = completedCount / enrolledCount × 100`, trong đó người hoàn thành phải đạt trạng thái `COMPLETED` theo policy. `averageProgressPercent` là trung bình phần trăm bài của nhóm. Cả hai tỷ lệ là `null` khi nhóm rỗng.

Ví dụ, trong hai học viên có một người đã làm đủ bài và đạt quiz cuối khóa, người còn lại đã xong bài nhưng chưa đạt quiz. Tỷ lệ hoàn thành khóa là **50%**.

### INS-07 — Thống kê kỹ năng yếu

`GET /weak-skills` trả tên kỹ năng, số học viên có đủ dữ liệu và số học viên ở mức `BEGINNER` cho kỹ năng đó. Mỗi học viên được đếm một lần khi có bằng chứng từ ít nhất 5 câu đã chấm của kỹ năng. Mức `BEGINNER` dùng ngưỡng mastery đang cấu hình, mặc định dưới 40%. Danh sách sắp theo số học viên yếu giảm dần.

Ví dụ, 3 học viên ghi danh, 2 người đủ số câu để đánh giá kỹ năng **Dependency Injection**, và 1 trong 2 người có điểm mastery dưới ngưỡng. API trả **1/2 học viên đã được đánh giá**, tương ứng **50%** cho kỹ năng này.

### INS-09 — Biểu đồ điểm và tiến độ

`GET /analytics` nhận `fromAt`, `toAt`, `quizId`, `assessmentVersion` và `classId`. Phân bố tiến độ hiện tại dùng bốn khoảng 0–dưới 25%, 25–dưới 50%, 50–dưới 75% và 75–100%. Xu hướng tiến độ đếm các bài hoàn thành còn hợp lệ theo ngày UTC. Dữ liệu điểm dùng kết quả quiz loại `GRADED` đã đồng bộ, chia theo quiz và phiên bản, có phân bố điểm và điểm phần trăm trung bình theo ngày UTC. Khoảng thời gian áp dụng cho hai chuỗi theo ngày và dữ liệu điểm. Bộ lọc quiz áp dụng cho phần điểm.

Ví dụ, cùng một quiz, bản 1 có hai lượt đạt **60%** và **80%** trong ngày, biểu đồ bản 1 thể hiện trung bình **70%**. Một lượt đạt **100%** ở bản 2 nằm trong nhóm riêng. Khi chọn lớp, API lấy lớp của lượt ghi danh từ Course.

**Ghép hệ thống.** Course cần xác nhận quyền Admin trên API danh sách học viên và cung cấp `classId` nếu dùng bộ lọc lớp. Phần điểm cần kiểm thử liên thông với Quiz khi ghép thật.

## Cập nhật khi làm thêm chức năng

Khi bắt đầu, ghi mã và tên chức năng theo Function List. Khi kết thúc, cập nhật trạng thái và ghi rõ phạm vi đã hoàn thành. Nếu đang làm dở, ghi phần đã chạy và phần còn thiếu. Đặt vị trí thư mục, file ngay dưới tên chức năng, rồi bổ sung công dụng, cách xử lý, API hoặc event và ví dụ có kết quả mong đợi. Thêm một ví dụ ngắn mô tả người dùng làm gì và thấy gì, bằng lời dễ hiểu cho người không đọc code. Đính kèm link test và ghi môi trường đã chạy, gồm dịch vụ thật và phần dùng giả lập.
