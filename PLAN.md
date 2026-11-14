# Kế hoạch công việc Learning Service

Cập nhật ngày **14/11/2026** cho nhánh `feat/learning/progress`. Mã và phạm vi nghiệp vụ bám Function List. Đặc tả kỹ thuật lấy từ [contract chung](packages/contracts/README.md) và [lộ trình Learning](services/learning-service/README.md#mục-tiêu-và-cách-thực-hiện). Xem [WORK.md](WORK.md) để tra file, API và chức năng đang chạy.

## Mastery (MST-01 đến MST-07)

**Đã triển khai công thức MST-03 đã chốt và nối vào MST-04/05/06/07.** API đọc điểm hiện tại và lịch sử dùng kết quả quiz đã đồng bộ. Khi ghép, QUIZ-08 dùng API kiểm tra mã mới và giữ mapping theo phiên bản. [Vị trí code và ví dụ MST-03](WORK.md#mst-03--tính-điểm-mastery)

**Cập nhật sau rà soát.** MST-03 đã dùng số câu từ kết quả chấm giả lập và lưu điểm tổng hợp. MST-05/06 cập nhật `updatedAt` khi bảng điểm thay đổi. MST-07 ghi các mốc cố định vào PostgreSQL từ lần đọc đầu tiên sau khi có dữ liệu. Phần ghép với Quiz/Course thật sẽ xác nhận contract và luồng phát kết quả. [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md#mst-03-và-mst-07--số-câu-quiz-và-snapshot)

1. Khi ghép, Quiz gửi `skillScores[].questionCount` từ snapshot lượt làm theo cùng hình dạng mock. Cập nhật consumer dùng schema mới trước khi bật trường này trên publisher.
2. Ghép QUIZ-08/RES-07 và Course thật. Thử gắn kỹ năng, chấm, gửi lại event, đọc điểm và lịch sử khi đổi phiên bản khóa. Xác minh Course trả đúng snapshot ghi danh qua HTTP.

Đối chiếu Function List dòng 125–131, tab Phân công TV4 và mã QUIZ-08/RES-07 của Quiz. Hai bản bảng tính hiện có trên máy khớp nhau ở các dòng Learning. Bản `(2).xlsm` được nhắc trong chat không có ở đường dẫn đã cho. API đã định nghĩa là `getMastery`. Contract hiện có `skillIds` trong dữ liệu soạn câu hỏi và `skillScores` trong event `quiz.attempt.graded.v2`. Danh mục kỹ năng, cách lấy số câu và API lịch sử cần bổ sung hoặc thống nhất trước khi dùng thật. [Function List và nguồn đối chiếu](<C:/Users/LENOVO/Downloads/Lms hay cjd tuong tu.xlsm>) · [Baseline Learning](packages/contracts/README.md#learning-completion-resume-certificate)

| Thứ tự | Mã và chức năng | Cách thực hiện | Kết quả cần đạt |
| --- | --- | --- | --- |
| 1 | **MST-01 (P1) — Danh sách kỹ năng khóa học. Đã làm.** | Learning lưu mã, khóa, tên, mô tả và trạng thái trên PostgreSQL. API phân quyền qua Course và giữ mã của kỹ năng đã ngừng dùng. | Đã thử chủ khóa và Admin quản lý, học viên đọc danh sách hiện hành, sai khóa bị chặn và tra được mã cũ qua API nội bộ. Course dùng HTTP giả lập. |
| 2 | **MST-02 (P1) — Liên kết câu hỏi với kỹ năng. Đã làm phía Learning.** | `validateCourseSkills` kiểm tra cùng khóa, đúng mã và trạng thái của cả danh sách trong một request. Quiz giả lập gọi trước khi lưu phiên bản câu hỏi. | Đã thử nhiều mã hợp lệ, sai khóa, sai mã, mục đã ngừng dùng và giữ mapping ở phiên bản cũ. **QUIZ-08** cần nối API và chạy lại ca gắn/chấm trên Quiz thật. |
| 3 | **MST-03 (P1) — Tính mastery score và số câu.** | Tính tổng điểm đạt chia tổng điểm tối đa. Cộng số câu theo kỹ năng từ kết quả chấm. Lưu điểm hiện tại khi đọc. | Hai lượt 4/10 và 18/20 trả 73,33%, 2 lượt và 8 câu với Quiz giả lập. Event cũ thiếu số câu trả `null`. |
| 4 | **MST-04 (P1) — Phân loại mức độ thành thạo. Đạt phía Learning.** | Ngưỡng mặc định 40% và 70%. Cấu hình qua `LEARNING_MASTERY_DEVELOPING_MIN` và `LEARNING_MASTERY_PROFICIENT_MIN` cho cả instance. | API điểm hiện tại và lịch sử dùng ngưỡng đã cấu hình. Đã thử số thập phân đúng biên và giá trị thực sự dưới biên. |
| 5 | **MST-06 (P1) — Cập nhật mastery sau quiz. Đã nối MST-03.** | Đọc attempt đã commit qua consumer PRG-06/07, lấy đúng phiên bản theo snapshot và migration. Tính khi có request đọc. | Kiểm tra kết quả lệch thứ tự và giao lại qua RabbitMQ/PostgreSQL. Còn xác nhận Quiz thật. |
| 6 | **MST-05 (P1) — Biểu đồ năng lực. Đã làm API.** | `GET /api/v1/learning/courses/{id}/mastery` trả tên kỹ năng, điểm, mức và số lượt đánh giá của chính học viên đã ghi danh. | Có điểm thì trả kết quả theo MST-03. Chưa có bằng chứng thì trả mảng rỗng. |
| 7 | **MST-07 (P2) — Lịch sử mastery. Đã lưu snapshot tại lần đọc đầu.** | `GET /api/v1/learning/courses/{id}/mastery/history` phân trang mốc trong PostgreSQL, giữ tên, mức, điểm, số câu và phiên bản công thức đã ghi. | Đã thử đọc đồng thời, đổi tên, event trùng, event cũ đến muộn và migration. Mốc đã lưu giữ nguyên. |

### Các quyết định cần thống nhất trước khi mở rộng contract

| Chủ đề | Đề xuất làm việc |
| --- | --- |
| **Số câu và số lượt** | Mock và schema đã hỗ trợ `skillScores[].questionCount`; `evidenceCount` đếm lượt. Đối chiếu cách đếm trên snapshot của Quiz thật và cách rollout schema khi ghép. |
| **Nguồn kỹ năng và phiên bản** | Learning sở hữu danh mục, luật và lịch sử mastery. Quiz sở hữu mapping, chấm điểm và phát event qua **QUIZ-08/RES-07**. Course sở hữu quyền, cấu trúc và phiên bản ghi danh. Xác nhận ba nguồn qua luồng ghép HTTP/RabbitMQ. |
| **Ngưỡng và lượng dữ liệu tối thiểu** | Dùng các mốc mặc định của baseline cho fixture. Chốt phạm vi cấu hình ngưỡng (toàn hệ thống hay từng khóa) và số bằng chứng tối thiểu trước khi gắn nhãn kỹ năng yếu ở ADP-01. |

### Checklist đã thực hiện cho MST-01

1. Đã bổ sung bốn operation và schema OpenAPI cho danh mục, gồm tạo, xem, sửa hoặc ngừng sử dụng và tra mã nội bộ.
2. Đã chuẩn bị fixture hai khóa và các tài khoản khác quyền, thêm mock API thử bằng Postman.
3. Đã triển khai `src/modules/mastery/`, migration PostgreSQL và kiểm tra quyền qua Course. Khóa nháp dùng cùng kiểm tra chủ khóa/Admin. Token tra kỹ năng dùng riêng cho API nội bộ đọc.
4. Đã ghi vị trí, API, ví dụ và kết quả vào [WORK.md](WORK.md) và [báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md). Sau khi ghép, xác nhận quyền trên Course thật và để Quiz kiểm tra mã đúng khóa, đúng trạng thái ở MST-02.

### Sau Mastery

| Nhóm | Thứ tự đề xuất và phần phụ thuộc |
| --- | --- |
| **ADP-01 đến ADP-07 — Gợi ý học tập** | Làm ADP-01–05 sau MST P1. Dùng mastery để tìm kỹ năng yếu, mapping kỹ năng–bài/quiz và trạng thái mở chương để chọn nội dung, cùng thông tin lượt làm từ Quiz để lọc quiz còn khả dụng. API sẵn có là `listRecommendations`. ADP-06 cần đồ thị tiên quyết và ADP-07 cần lịch sử MST-07, làm sau. |
| **CERT-01 đến CERT-07 — Chứng chỉ** | CERT-01/04/06 đặt nền điều kiện cấp, mã và chống trùng. Dùng trạng thái hoàn thành PRG và `certificateEnabled` của snapshot. CERT-02/03/05 thêm PDF, tải của chính học viên và xác minh công khai. CERT-07 P2 thêm thu hồi và audit. Có thể phát triển độc lập với mastery nếu nhóm cần ưu tiên chứng chỉ. Trước khi làm CERT-06, chốt chênh lệch giữa khóa duy nhất `userId/courseId` trong Function List và `enrollmentId/contentVersion` trong contract. |
| **INS-03/06/07/09 — Dashboard giảng viên** | Function List đánh dấu Frontend. Backend Learning phối hợp cung cấp `listLearnerProgress` và `getLearningStatistics`. Xử lý nhu cầu dữ liệu **INS-03 P0** theo tiến độ giao diện, với danh sách ghi danh từ Course và đúng quyền chủ khóa/Admin. INS-07 dùng mastery. Bộ lọc thời gian/lớp/quiz của INS-06/09 cần đối chiếu contract và nguồn dữ liệu trước khi chốt API. |

**Phạm vi mới.** Sau lần chốt nhóm PRG, main bổ sung quy tắc invalidation và yêu cầu học lại. Phần Learning cho quy tắc mới đã được triển khai và kiểm thử với Course giả lập.

## Cập nhật theo main 0981c48 — học lại mục bị ảnh hưởng

Nguồn là `packages/contracts/docs/learning-migration-guide.md` trên main, đã đọc ngày 14/11/2026. Phạm vi gồm PRG-01/02/03/05/06/07/08 và ảnh hưởng hiển thị lịch sử điểm PRG-04.

1. Đồng bộ kiểu `OUTDATED`, `RESET`, thông tin invalidation và API internal migration. Giữ các trường dashboard và tiến độ theo bài đang dùng.
2. Thêm trạng thái cho completion cũ, đặt mặc định `COMPLETED`. Thêm sổ migration để xử lý lại an toàn và giữ bản ghi lịch sử.
3. Xác minh revision đã xuất bản, đúng khóa và đúng item qua Course. Bổ sung contract API nội bộ trả liên hệ item trước và sau revision vì main hiện chỉ có API metadata dành cho chủ khóa, còn revision có thể tạo mã item mới.
4. Với `REQUIRE_RECOMPLETION`, chỉ loại bằng chứng hoàn thành của mục bị ảnh hưởng. Với `NOTIFY_ONLY`, giữ số bài và trạng thái hoàn thành. Giữ `contentVersion` của lượt ghi danh.
5. Áp dụng cùng luật cho tiến độ bài/chương/khóa, dashboard và vị trí học tiếp. Quiz bị thay đổi dùng phiên bản đánh giá mới, giữ điểm và attempt cũ để tra cứu.
6. Thêm mock migration và các ca test gửi lặp, sai quyền/quan hệ, nhiều item cùng transaction, học lại, quiz cũ đến trễ và hai thao tác ghi đồng thời. Cập nhật WORK và báo cáo với ví dụ cho người đọc không chuyên code.

**Kết quả triển khai và xác nhận lại bởi hai agent.** Bộ đầy đủ đạt **56/56 E2E**, có PostgreSQL/RabbitMQ thật; mock API **10/10**. Agent thứ hai tự chạy **32/32 E2E** thuộc ba suite và **10/10 mock**, đọc lại logic và đồng ý chốt. Đã sửa bốn ca biên: quiz phiên bản mới đến trước migration, khóa hoàn thành khi chưa xác nhận bài, video đổi thành quiz bỏ ngưỡng mới, và mất lý do thông báo quiz. **Đóng PRG-01 đến PRG-08 trong phạm vi Learning với provider giả; chuyển sang nhóm tiếp theo.** Lần xác nhận trước đối chiếu 59 request HTTP trực tiếp. [WORK.md](WORK.md#rà-soát-chéo-prg-01-đến-prg-08-ngày-14112026) ghi vị trí code, ví dụ và quy ước policy khi đổi loại item.

**Phần Course cần cung cấp khi ghép.** Contract bổ sung `getCourseItemMigrationContext`, gồm revision đã xuất bản, item đích, các item nguồn và yêu cầu quiz mới. Course cần triển khai endpoint và phục vụ nội dung đã sửa cho người học cũ. Learning hiện kiểm thử bằng provider giả lập.

## Trạng thái các chức năng PRG

**Sửa luồng snapshot.** `CourseClient.structure()` gọi thẳng `getLearningStructure` với `enrollment.contentVersion` và credential service. Bổ sung 11 ca HTTP xác minh đường dẫn, token, khóa, phiên bản và lỗi phụ thuộc. Các API user-scoped khác giữ contract hiện có cho danh sách ghi danh và chủ khóa.

| Thứ tự | Mã và chức năng | Việc tiếp theo | Khi nào báo hoàn thành |
| --- | --- | --- | --- |
| Đã làm | **PRG-01 – Lưu hoàn thành từng bài** | Backend đã đọc và lưu hoàn thành item/lesson theo lượt ghi danh. | Đã kiểm thử thiếu item bắt buộc, chương khóa, sai phiên bản và gửi hai request đồng thời trên PostgreSQL. |
| Đã làm | **PRG-03 – Tiến độ theo chương** | Backend đã trả số lesson hoàn thành, tổng số lesson, phần trăm và trạng thái chương. Frontend dùng các trường này để hiển thị. | Đã kiểm thử trường hợp đủ số bài nhưng quiz chưa đạt, sau đó mở chương khi quiz đạt đúng ngưỡng của phiên bản ghi danh. |
| Đã làm | **PRG-04 – Tổng hợp điểm quiz** | Learning tổng hợp điểm đã đồng bộ theo học viên, khóa, quiz và phiên bản. Có hai route đọc điểm cho học viên và chủ khóa hoặc Admin. | Kiểm thử với PostgreSQL, RabbitMQ và Course/Quiz giả lập. Khi ghép hệ thống, chạy lại ca đúng quyền, sai chủ, khác phiên bản, chưa có điểm và event lặp với service của nhóm. |
| Đã làm | **PRG-02 – Tính phần trăm hoàn thành khóa** | Thêm tỷ lệ theo bài bắt buộc cho dashboard và giữ tỷ lệ theo item của contract hiện tại. | Đã kiểm thử khóa không có bài bắt buộc, phiên bản thay đổi và 100% bài nhưng còn thiếu quiz. Khi ghép, xác nhận Course trả được cấu trúc của bản ghi danh cũ. |
| Đã làm | **PRG-05 – Dashboard tiến độ cá nhân** | Hiển thị tiến độ theo bài, quiz đã chấm gần đây và gợi ý học tiếp. | Đã kiểm thử học viên có nhiều khóa, chưa ghi danh, chưa có quiz, quiz bị gửi lặp và bước học sau khi mở chương. |
| Đã làm theo contract | **PRG-06 – Đồng bộ tiến độ qua event** và **PRG-07 – Chống tính trùng event** | Learning nhận `quiz.attempt.graded.v2`. Học viên ghi nhận hoàn thành bài qua API PRG-01. Course cung cấp trạng thái ghi danh hiện tại khi đọc. | Đã kiểm thử RabbitMQ và PostgreSQL, gồm giao lại, rollback, retry và replay. Khi ghép, xác nhận publisher, quyền tra attempt và token nội bộ của Quiz thật. |
| Đã làm | **PRG-08 – Lưu thời điểm học gần nhất** | Lưu vị trí và thời điểm vào PostgreSQL. Dashboard sắp xếp khóa theo vị trí vừa lưu, nội dung đã hoàn thành và quiz vừa chấm. | Đã kiểm thử đọc lại vị trí, chặn ghi đè từ thiết bị cũ và thứ tự khóa. Khi ghép, kiểm tra lưu và phát tiếp trên giao diện. |

## Việc còn lại khi ghép nhóm PRG

1. Course cung cấp cấu trúc phía server theo `contentVersion` đã ghi danh, kể cả khi có bản phát hành mới. Kiểm tra cấu hình `COURSE_SERVICE_TOKEN` và endpoint `getLearningStructure`.
2. Quiz phát `quiz.attempt.graded.v2` và cung cấp quyền tra lượt làm theo contract. Gửi lại bản tin để đối chiếu điểm và số lượt sau khi ghép.
3. Frontend gọi dashboard để hiển thị tiến độ theo bài, kết quả quiz và điều hướng tới bước học tiếp. Thử dừng video rồi học tiếp, cùng tình huống chương đang khóa.
4. Course cung cấp `getCourseItemMigrationContext` theo contract và chỉ gọi endpoint migration sau khi revision đã được xuất bản. Kiểm tra liên hệ mã item cũ với mã mới, thông tin quiz và credential `LEARNING_SERVICE_TOKEN`.
5. Course chuyển `contentVersion` từ query HTTP sang số, trả được snapshot lịch sử và xác thực credential trên các route internal. Main 0981c48 hiện còn các phần này cần hoàn thiện.

## Vị trí PRG-04

- [Repository kết quả Quiz trong Learning](services/learning-service/src/modules/progress-sync/repositories/assessment-attempts.repository.ts) lưu lượt làm theo `attemptId` và `assessmentVersion`. Đây là dữ liệu đã đồng bộ để xây phần tổng hợp của Learning.
- [Contract API](packages/contracts/src/endpoints.ts) khai báo `listMySyncedQuizScores` và `listCourseSyncedQuizScores` cho điểm đã đồng bộ vào Learning. Quiz sở hữu các API lượt làm, kết quả từng lượt và thống kê Quiz.
- [Contract dữ liệu điểm](packages/contracts/src/internal/integration.ts) có `GradedAssessmentSummary` cho từng lượt làm và `LearnerAssessmentSummary` cho kết quả tổng hợp. Kiểm thử với [fixture Course và Quiz](services/learning-service/test/fixtures/learning-providers.mock.json).

## Cách theo dõi mỗi chức năng

1. Khi bắt đầu, ghi mã, tên và phạm vi đang làm.
2. Sau khi code, chạy test phù hợp. Dùng mock khi phụ thuộc service đồng đội và ghi rõ phần nào đã dùng PostgreSQL, RabbitMQ hoặc service thật.
3. Khi báo kết quả, ghi **hoàn thành** kèm phạm vi đã kiểm tra hoặc ghi **còn thiếu** kèm phần chưa làm và phụ thuộc cụ thể.
4. Cập nhật [WORK.md](WORK.md) với vị trí thư mục và file trước, rồi đến công dụng, cách hoạt động, API hoặc event, ví dụ và kết quả mong đợi. Ghi bằng chứng vào [báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md).
