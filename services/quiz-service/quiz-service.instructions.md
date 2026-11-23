---
applyTo: "apps/quiz-service/**"
---

# Hướng dẫn GitHub Copilot — Quiz Service

## 1. Nguyên tắc bắt buộc

Quiz Service là một Microservice trong dự án LMS Backend.

**Nguồn yêu cầu nghiệp vụ chính là Function List đã được nhóm thống nhất.**

Khi triển khai, phải tuân thủ các nguyên tắc:

0. Quiz service chạy cổng 3003
1. Bám sát ID, tên chức năng, Module, mô tả và mức ưu tiên trong Function List.
2. Không tự bổ sung chức năng ngoài tài liệu.
3. Không tự thay đổi Module đã được phân công.
4. Không tự đổi tên hoặc đánh lại Requirement ID.
5. Không suy diễn nghiệp vụ khi mô tả chưa rõ.
6. Nếu có điểm mâu thuẫn hoặc không đủ thông tin để triển khai chính xác, phải hỏi người phát triển.
7. Những quy tắc có thể xử lý trong Service thì ưu tiên xử lý tại Service, không tự đề xuất thay đổi database hoặc kiến trúc.
8. Không tự ý chỉnh sửa Shared Contract, database schema hoặc code của Microservice khác.
9. Chỉ triển khai chức năng được giao, không tự động triển khai các chức năng liên quan.
10. Tuân thủ kiến trúc Module – Controller – Service của nhóm.

Cần kiểm tra	Vì sao quan trọng với Quiz Service?
1. Internal API contracts	Quiz có thể cần hỏi Course Service xem khóa học, chương học hoặc bài học có tồn tại không
2. Enrollment	Khi sinh viên bắt đầu làm Quiz (ATT-01), phải kiểm tra họ có quyền tham gia khóa học không
3. Instructor ownership	Khi giảng viên tạo Quiz (QUIZ-05), phải xác định họ có quyền quản lý khóa học đó không
4. Authentication context	Cần biết userId, role đến từ JWT, Gateway hay một cơ chế nội bộ đã thống nhất
5. Request/response và lỗi	Quiz Service phải gửi đúng dữ liệu mà service khác chấp nhận và xử lý được các trường hợp lỗi

## 2. Cấu trúc Module đã thống nhất

Quiz Service được chia thành 4 Module nghiệp vụ chính:

- `QuizModule`
- `QuizQuestionModule`
- `QuizAttemptModule`
- `QuizStatisticModule`

Phân chia trách nhiệm theo Function List dưới đây. Không tự chuyển chức năng giữa các Module.

Các chức năng hạ tầng như Swagger, Health Check, kết nối database và messaging không làm thay đổi cách phân chia 4 Module nghiệp vụ.

## 3. QuizModule

### QUIZ-04 — Xử lý trạng thái Quiz
**Ưu tiên: P0**

- Quiz mới tạo ở trạng thái nháp, có thể sửa và xóa.
- Quiz đã công khai không thể sửa.
- Muốn cập nhật thì ẩn thành Archive.
- Quiz đã đăng ký làm rồi vẫn có thể làm nhưng tương lai sẽ không ai thấy.

### QUIZ-05 — Tạo Quiz, giới hạn thời gian, vị trí gắn Quiz, loại Quiz (QuizPolicy)
**Ưu tiên: P0**

- Giảng viên đặt tên, danh sách câu hỏi và thời lượng Quiz.
- Hệ thống validate thời lượng dương và chỉ cho học viên đủ quyền bắt đầu.

### QUIZ-10 — Giới hạn lượt làm
**Ưu tiên: P1**

- Giảng viên đặt số Attempt tối đa.
- Backend đếm lượt đã bắt đầu theo quy tắc.
- Từ chối lượt mới khi vượt giới hạn.

### QUIZ-11 — Cấu hình điểm đạt
**Ưu tiên: P0**

- Giảng viên đặt ngưỡng điểm đạt.
- Kết quả Quiz đánh dấu PASS/FAIL dựa trên điểm server và ngưỡng đã cấu hình.

## 4. QuizQuestionModule

### QUIZ-01 — CRUD câu hỏi trắc nghiệm
**Ưu tiên: P0**

- Giảng viên quản lý câu hỏi của bài thi.
- Tạo, sửa và xóa chỉ cho phép khi Quiz vẫn ở trạng thái nháp.
- Hệ thống bảo toàn câu hỏi đã xuất hiện trong lượt làm cũ.

### QUIZ-02 — Câu hỏi nhiều lựa chọn
**Ưu tiên: P0**

- Giảng viên nhập nội dung câu hỏi và từ hai lựa chọn trở lên.
- Backend kiểm tra cấu trúc và số lựa chọn hợp lệ.

### QUIZ-03 — Thiết lập đáp án và điểm
**Ưu tiên: P0**

- Giảng viên chọn đáp án đúng và điểm tối đa.
- Điểm phải hợp lý, không âm.
- Số lượng đáp án phải phù hợp loại câu hỏi: chọn một hoặc chọn nhiều.

### QUIZ-08 — Gắn kỹ năng
**Ưu tiên: P1**

- Giảng viên gắn kỹ năng cho câu hỏi.
- Dữ liệu được dùng để phân tích kỹ năng sau khi nộp.

### QUIZ-09 — Import câu hỏi CSV
**Ưu tiên: P2**

- Giảng viên tải CSV câu hỏi theo mẫu.
- Hệ thống kiểm tra từng dòng.
- Báo lỗi có vị trí và chỉ import bản ghi hợp lệ theo chính sách.

### RES-04 — Giải thích đáp án
**Ưu tiên: P1**

- Giảng viên nhập giải thích cho từng câu.
- Sau khi nộp, học viên xem giải thích tương ứng tùy theo quyền được phép hiển thị.

## 5. QuizAttemptModule

### QUIZ-06 — Trộn câu hỏi
**Ưu tiên: P1**

- Khi bắt đầu mỗi Attempt, backend tạo thứ tự câu hỏi ngẫu nhiên.
- Lưu thứ tự để khi reload vẫn nhất quán.

### QUIZ-07 — Trộn đáp án
**Ưu tiên: P1**

- Backend xáo trộn lựa chọn cho từng Attempt.
- Lưu ánh xạ ID ổn định.
- Không làm thay đổi đáp án đúng trong dữ liệu gốc.

### ATT-01 — Bắt đầu lượt làm Quiz
**Ưu tiên: P0**

- Học viên nhấn Bắt đầu.
- Server kiểm tra Enrollment, số lượt và điều kiện mở khóa.
- Tạo Attempt với `startedAt` và `expiresAt` do server cấp.

### ATT-02 — Hiển thị câu hỏi và lựa chọn
**Ưu tiên: P0**

- Giao diện hiển thị nội dung và lựa chọn theo thứ tự Attempt.
- Không kèm trường đáp án đúng hoặc dữ liệu chấm điểm nhạy cảm.

### ATT-03 — Đếm ngược thời gian
**Ưu tiên: P0**

- Đồng hồ hiển thị thời gian còn lại của server.
- Khi hết giờ, khóa thao tác và đồng bộ trạng thái với server.

### ATT-04 — Chọn và sửa đáp án
**Ưu tiên: P0**

- Học viên chọn hoặc thay đổi phương án trước hạn.
- Giao diện lưu lựa chọn theo Question ID.
- Chỉ nhận ID đáp án hợp lệ.

### ATT-05 — Điều hướng câu hỏi
**Ưu tiên: P0**

- Học viên chuyển câu trước/sau hoặc chọn từ bảng số câu.
- Lựa chọn đã nhập được giữ khi điều hướng.

### ATT-06 — Đếm câu đã/chưa trả lời
**Ưu tiên: P1**

- Giao diện đếm số câu có lựa chọn hợp lệ và số câu còn bỏ trống.
- Giúp học viên kiểm tra trước khi nộp.

### ATT-07 — Persist bài làm khi reload
**Ưu tiên: P0**

- Zustand/Redux persist lưu lựa chọn và Attempt ID khi tải lại trang.
- Sau reload, đồng bộ hạn/trạng thái thật với backend.
- Persist bằng Zustand/Redux thuộc frontend; backend cung cấp dữ liệu và xử lý đồng bộ theo API hiện có.

### ATT-08 — Nộp bài thủ công
**Ưu tiên: P0**

- Học viên nhấn Nộp và xác nhận.
- Frontend gửi Attempt ID và câu trả lời.
- Backend chấm và trả kết quả sau khi ghi thành công.

### ATT-09 — Server từ chối nộp quá hạn
**Ưu tiên: P0**

- Server kiểm tra thời điểm nhận bài so với hạn.
- Nộp đến quá hạn bị từ chối theo quy tắc.
- Không tin thời gian hiển thị trên frontend.
- Nếu học viên không nộp thì hệ thống tự nộp/tự chấm.

### ATT-10 — Ẩn đáp án đúng trước khi nộp
**Ưu tiên: P0**

- API phát đề chỉ trả câu hỏi và lựa chọn.
- Mọi trường `correctAnswer`, đáp án chuẩn và scoring key chỉ nằm ở server.
- Chỉ được phép xem kết quả sau khi đã nộp theo quy tắc.

### ATT-11 — Chấm điểm tại server
**Ưu tiên: P0**

- Backend đối chiếu câu trả lời với đáp án chuẩn đã lưu.
- Tính điểm và ghi Attempt/Result trong transaction.
- Client không gửi tổng điểm tự tính.

### ATT-12 — Xem kết quả sau nộp
**Ưu tiên: P0**

- Sau khi nộp hợp lệ, học viên xem điểm, trạng thái đạt và thông tin câu đúng/sai theo chính sách công bố đáp án.

### ATT-13 — Idempotency chống nộp trùng
**Ưu tiên: P1**

- Nếu client gửi nộp lại cùng Attempt/Idempotency Key, server không chấm hoặc cộng điểm lần nữa.
- Trả kết quả đã ghi.

### ATT-14 — Khôi phục bài làm từ server
**Ưu tiên: P2**

- Client đăng nhập trên thiết bị khác có thể lấy Attempt còn hiệu lực và lựa chọn đã lưu trên server.
- Dữ liệu đồng bộ theo thời hạn.

### RES-01 — Tính tổng điểm
**Ưu tiên: P0**

- Hệ thống cộng điểm các câu đúng theo trọng số đã cấu hình.
- Xử lý câu bỏ trống và điểm tối đa bằng không theo quy tắc đã xác định.

### RES-02 — Tính tỷ lệ câu đúng
**Ưu tiên: P0**

- Hệ thống tính số câu đúng chia số câu hợp lệ.
- Hiển thị phần trăm.
- Tránh chia cho 0 với Quiz rỗng.

### RES-03 — Kết quả từng câu
**Ưu tiên: P1**

- Sau khi nộp, học viên xem từng câu đã chọn, đáp án đúng và điểm nhận được nếu giảng viên cho phép công bố.

### RES-07 — Phát event quiz.attempt.graded.v1
**Ưu tiên: P1**

- Backend lưu kết quả chấm điểm và Outbox Event trong cùng một transaction.
- Sau khi transaction commit thành công, Outbox Publisher phát sự kiện `quiz.attempt.graded.v1` qua RabbitMQ.
- Learning Service cập nhật dữ liệu học tập dựa trên sự kiện đã nhận.

## 6. QuizStatisticModule

### ATT-15 — Lịch sử lượt làm
**Ưu tiên: P1**

- Học viên xem danh sách Attempt trước đây theo Quiz.
- Bao gồm ngày làm, điểm, trạng thái và liên kết kết quả được phép xem.

### RES-05 — Thống kê lượt làm và điểm trung bình
**Ưu tiên: P1**

- Giảng viên xem tổng lượt làm và điểm trung bình theo Quiz.
- Có bộ lọc khóa học và thời gian.
- Chỉ trên khóa mình sở hữu.
- Không chủ trương đo phần không thuộc phạm vi Quiz Service.

### RES-06 — Câu hỏi có tỷ lệ sai cao
**Ưu tiên: P1**

- Hệ thống tổng hợp tỷ lệ sai của từng câu từ các Attempt hợp lệ.
- Sắp xếp câu có tỷ lệ sai cao để giảng viên rà soát.

### INS-04 — Xem kết quả Quiz từng học viên
**Ưu tiên: P0**

- Giảng viên xem lịch sử điểm, lượt làm và trạng thái đạt Quiz của học viên trong khóa mình phụ trách.

### INS-05 — Xuất bảng điểm CSV
**Ưu tiên: P0**

- Giảng viên xuất CSV bảng điểm theo khóa.
- Gồm học viên, Quiz, điểm và trạng thái.
- Backend xác thực quyền và mã hóa CSV đúng định dạng.

### INS-08 — Phân tích độ khó câu hỏi
**Ưu tiên: P1**

- Thống kê tỷ lệ đúng/sai từng câu.
- Chỉ ra câu quá khó hoặc quá dễ theo ngưỡng và số lượng Attempt đủ lớn.

## 7. Quy trình triển khai chức năng

Khi được yêu cầu triển khai một Requirement ID:

1. Xác định Module từ danh sách đã chốt.
2. Đọc mô tả của Requirement ID tương ứng.
3. Kiểm tra source code và Contract liên quan.
4. Xác định phần nào thuộc backend và phần nào thuộc frontend.
5. Chỉ triển khai phần thuộc phạm vi Quiz Service backend.
6. Ưu tiên xử lý nghiệp vụ trong Service.
7. Tái sử dụng Entity, DTO và các thành phần đã có.
8. Viết test cho hành vi được triển khai.
9. Báo cáo những điểm chưa rõ, không tự suy diễn.

Không bắt buộc mỗi Requirement ID phải tương ứng với một API riêng.

Các yêu cầu frontend như điều hướng câu hỏi, đếm ngược hiển thị hoặc Zustand/Redux persist không được tự triển khai trong backend.

## 8. Những việc không được tự ý thực hiện

- Không thêm Requirement ID mới.
- Không chuyển chức năng sang Module khác.
- Không tự tạo thêm Module nghiệp vụ.
- Không tự bổ sung bảng database.
- Không tự sửa Shared Contract.
- Không tự thiết kế thêm cơ chế nghiệp vụ chưa có trong Function List.
- Không tự thay đổi quy tắc tính điểm hoặc xử lý hết hạn.
- Không refactor ngoài phạm vi được giao.
- Không tự động commit hoặc push.

Nếu một chức năng cần quyết định nghiệp vụ chưa được mô tả rõ, hãy hỏi trước khi triển khai phần đó.

## 9. Báo cáo sau khi hoàn thành

Luôn báo cáo bằng tiếng Việt:

1. Requirement ID đã triển khai.
2. Module chịu trách nhiệm.
3. Các file đã thay đổi.
4. Chức năng backend đã hoàn thành.
5. Các kiểm tra và test đã chạy.
6. Những vấn đề cần xác nhận hoặc chưa hoàn thành.