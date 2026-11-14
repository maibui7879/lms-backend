# Kế hoạch công việc Learning Service

Cập nhật ngày **14/11/2026** cho nhánh `feat/learning/progress`. Mã và phạm vi nghiệp vụ bám Function List. Đặc tả kỹ thuật lấy từ [contract chung](packages/contracts/README.md) và [lộ trình Learning](services/learning-service/README.md#mục-tiêu-và-cách-thực-hiện). Xem [WORK.md](WORK.md) để tra file, API và chức năng đang chạy.

**Phạm vi mới.** Sau lần chốt nhóm PRG, main bổ sung quy tắc invalidation và yêu cầu học lại. Phần Learning cho quy tắc mới đã được triển khai và kiểm thử với Course giả lập.

## Cập nhật theo main 0981c48 — học lại mục bị ảnh hưởng

Nguồn là `packages/contracts/docs/learning-migration-guide.md` trên main, đã đọc ngày 14/11/2026. Phạm vi gồm PRG-01/02/03/05/06/07/08 và ảnh hưởng hiển thị lịch sử điểm PRG-04.

1. Đồng bộ kiểu `OUTDATED`, `RESET`, thông tin invalidation và API internal migration. Giữ các trường dashboard và tiến độ theo bài đang dùng.
2. Thêm trạng thái cho completion cũ, đặt mặc định `COMPLETED`. Thêm sổ migration để xử lý lại an toàn và giữ bản ghi lịch sử.
3. Xác minh revision đã xuất bản, đúng khóa và đúng item qua Course. Bổ sung contract API nội bộ trả liên hệ item trước và sau revision vì main hiện chỉ có API metadata dành cho chủ khóa, còn revision có thể tạo mã item mới.
4. Với `REQUIRE_RECOMPLETION`, chỉ loại bằng chứng hoàn thành của mục bị ảnh hưởng. Với `NOTIFY_ONLY`, giữ số bài và trạng thái hoàn thành. Giữ `contentVersion` của lượt ghi danh.
5. Áp dụng cùng luật cho tiến độ bài/chương/khóa, dashboard và vị trí học tiếp. Quiz bị thay đổi dùng phiên bản đánh giá mới, giữ điểm và attempt cũ để tra cứu.
6. Thêm mock migration và các ca test gửi lặp, sai quyền/quan hệ, nhiều item cùng transaction, học lại, quiz cũ đến trễ và hai thao tác ghi đồng thời. Cập nhật WORK và báo cáo với ví dụ cho người đọc không chuyên code.

**Kết quả triển khai và xác nhận lại.** E2E đạt 40/40 ca, mock API đạt 9/9 ca và 59 request HTTP trực tiếp đúng kết quả mong đợi. Đã sửa checkpoint trong mock và metadata thông báo cũ sau khi học lại. Chốt phần phát triển và kiểm thử với dữ liệu mẫu. [WORK.md](WORK.md#học-lại-sau-khi-course-sửa-nội-dung) ghi vị trí code, ví dụ và request Postman.

**Phần Course cần cung cấp khi ghép.** Contract bổ sung `getCourseItemMigrationContext`, gồm revision đã xuất bản, item đích, các item nguồn và yêu cầu quiz mới. Course cần triển khai endpoint và phục vụ nội dung đã sửa cho người học cũ. Learning hiện kiểm thử bằng provider giả lập.

## Trạng thái các chức năng PRG

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

## Vị trí PRG-04

- [Repository kết quả Quiz trong Learning](services/learning-service/src/modules/progress-sync/repositories/assessment-attempts.repository.ts) lưu lượt làm theo `attemptId` và `assessmentVersion`. Đây là dữ liệu đã đồng bộ để xây phần tổng hợp của Learning.
- [Contract API](packages/contracts/src/endpoints.ts) khai báo `listMySyncedQuizScores` và `listCourseSyncedQuizScores` cho điểm đã đồng bộ vào Learning. Quiz sở hữu các API lượt làm, kết quả từng lượt và thống kê Quiz.
- [Contract dữ liệu điểm](packages/contracts/src/internal/integration.ts) có `GradedAssessmentSummary` cho từng lượt làm và `LearnerAssessmentSummary` cho kết quả tổng hợp. Kiểm thử với [fixture Course và Quiz](services/learning-service/test/fixtures/learning-providers.mock.json).

## Cách theo dõi mỗi chức năng

1. Khi bắt đầu, ghi mã, tên và phạm vi đang làm.
2. Sau khi code, chạy test phù hợp. Dùng mock khi phụ thuộc service đồng đội và ghi rõ phần nào đã dùng PostgreSQL, RabbitMQ hoặc service thật.
3. Khi báo kết quả, ghi **hoàn thành** kèm phạm vi đã kiểm tra hoặc ghi **còn thiếu** kèm phần chưa làm và phụ thuộc cụ thể.
4. Cập nhật [WORK.md](WORK.md) với vị trí thư mục và file trước, rồi đến công dụng, cách hoạt động, API hoặc event, ví dụ và kết quả mong đợi. Ghi bằng chứng vào [báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md).
