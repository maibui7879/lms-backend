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

## Mục tiêu và cách thực hiện

Xây dựng backend để giảng viên tổ chức nội dung, gửi khóa học cho Admin phê duyệt và cho học viên đăng ký. Thực hiện sáu giai đoạn dưới đây; mỗi giai đoạn phải có chức năng chạy được và kiểm thử tương ứng trước khi chuyển bước. Giai đoạn 3 có thể kiểm thử bằng dữ liệu do test tạo trong DB riêng; enrollment thực tế được hoàn thiện ở giai đoạn 5.

### Giai đoạn 1 — Chuẩn bị hệ thống và cơ sở dữ liệu

**Mục tiêu:** Service khởi động ổn định, lưu dữ liệu và có nền tảng kiểm tra quyền.

**Công việc cụ thể:**

1. Đọc và kiểm tra biến môi trường; kết nối PostgreSQL, tạo migrations và API health.
2. Thiết kế bảng và quan hệ Course → Chapter → Lesson → Learning Item; lưu người sở hữu khóa học.
3. Kiểm tra giảng viên chỉ sửa khóa học của mình; thêm version để phát hiện cập nhật đồng thời.
4. Tạo ràng buộc một enrollment cho mỗi học viên/khóa học; chuẩn bị review history và outbox trong DB.

**Giải thích thuật ngữ:** Config là cấu hình ứng dụng; migration là tệp thay đổi cấu trúc bảng; health check kiểm tra hoạt động; authorization kiểm tra quyền. Transaction là nhóm thao tác cùng thành công hoặc cùng hủy. Outbox lưu sự kiện cùng dữ liệu nghiệp vụ trước khi gửi sang service khác.

**Kết quả cần đạt:** Kết nối DB được, migrations chạy được, có cấu trúc dữ liệu, kiểm tra quyền và cơ chế version.

**Cách kiểm thử:** Chạy migration trên DB test mới; thử config thiếu/sai, DB mất kết nối, giảng viên khác sửa course và hai cập nhật cùng version. Kiểm tra DB từ chối enrollment trùng ngay cả khi hai request chạy đồng thời.

### Giai đoạn 2 — Tạo và chỉnh sửa nội dung khóa học

**Mục tiêu:** Giảng viên tạo và tổ chức đầy đủ một khóa học bản nháp.

**Công việc cụ thể:**

1. Tạo course DRAFT; thêm, sửa, xóa chương, bài học và learning item dạng video/bài đọc/tham chiếu quiz.
2. Cho phép đổi thứ tự chương, bài học và item trong cùng cấp quản lý.
3. Kiểm tra tài nguyên thuộc đúng parent và course của người đang thao tác.
4. Kiểm tra expectedVersion trong transaction; không cho request cũ ghi đè nội dung mới.

**Giải thích thuật ngữ:** DRAFT là bản nháp; learning item là một đơn vị học tập; parent là tài nguyên cha; optimistic locking là kiểm tra version trước khi cập nhật để phát hiện xung đột.

**Kết quả cần đạt:** Course draft có cấu trúc hoàn chỉnh và có thể sắp xếp lại mà không làm sai quan hệ dữ liệu.

**Cách kiểm thử:** Tạo một course với nhiều chương/bài/item, đổi thứ tự và đọc lại. Thử parent không tồn tại, parent thuộc course khác, ID trùng trong danh sách reorder và version cũ; xác nhận transaction lỗi không để lại dữ liệu dở dang.

### Giai đoạn 3 — Cung cấp dữ liệu cho Quiz và Learning

**Mục tiêu:** Thành viên Quiz/Learning phát triển phần phụ thuộc mà không phải chờ toàn bộ Course hoàn thành.

**Công việc cụ thể:**

1. Viết internal API xác minh quiz thuộc đúng course/lesson/item và assessment version.
2. Cung cấp cấu trúc khóa học cùng các điều kiện hoàn thành theo contentVersion.
3. Viết API kiểm tra enrollment và quyền truy cập item; phân biệt không đủ quyền với provider mất kết nối.
4. Thống nhất DTO và credential gọi nội bộ với Quiz/Learning; kiểm thử hợp đồng bằng adapter độc lập.

**Giải thích thuật ngữ:** Internal API chỉ dành các service gọi nhau; adapter là phần mã kết nối provider và chuyển dữ liệu về dạng consumer cần; provider cung cấp dữ liệu, consumer sử dụng dữ liệu đó.

**Kết quả cần đạt:** Các internal API trả đúng contracts, bảo vệ bằng service credential và có test để consumer tích hợp. Chưa cần discussion/thống kê ở bước này.

**Cách kiểm thử:** Gọi API bằng credential hợp lệ/sai, quiz reference sai và contentVersion không có. Dùng record do test tạo để kiểm tra enrollment/access; mô phỏng dependency timeout. Với học tuần tự, chốt cách đọc Learning state trước khi khẳng định đã hỗ trợ đầy đủ, tránh gọi vòng giữa hai service.

### Giai đoạn 4 — Phê duyệt và xuất bản khóa học

**Mục tiêu:** Course chỉ công khai sau khi Admin xét duyệt và đóng băng nội dung hợp lệ.

**Công việc cụ thể:**

1. Cho owner gửi course DRAFT/REJECTED sang IN_REVIEW sau khi kiểm tra nội dung bắt buộc và quiz references.
2. Cho Admin xem danh sách chờ duyệt, approve hoặc reject; reject bắt buộc có lý do.
3. Lưu lịch sử với người duyệt/thời gian từ server; approve chuyển PUBLISHED.
4. Lưu snapshot nội dung và completion requirements; chặn sửa trực tiếp nội dung đã xuất bản.

**Giải thích thuật ngữ:** Submit review là gửi xét duyệt; approve/reject là phê duyệt/từ chối; snapshot là bản dữ liệu cố định tại thời điểm xuất bản.

**Kết quả cần đạt:** Có luồng DRAFT/REJECTED → IN_REVIEW → PUBLISHED hoặc REJECTED, giữ được lịch sử và published snapshot.

**Cách kiểm thử:** Thử Student/Instructor tự approve, reject thiếu lý do, submit thiếu required content, review hai lần và review version cũ. Xác nhận owner xem được lý do từ chối, resubmit giữ lịch sử và published content không sửa được.

### Giai đoạn 5 — Đăng ký khóa học và thông báo Learning

**Mục tiêu:** Học viên đăng ký đúng phiên bản nội dung và Learning nhận đủ thông tin để khởi tạo progress.

**Công việc cụ thể:**

1. Cho Student đăng ký course PUBLISHED; lấy userId từ identity đã xác minh, không lấy từ body.
2. Kiểm tra trùng đăng ký và lưu enrollment cùng contentVersion được pin tại thời điểm đăng ký.
3. Hoàn thiện access theo trạng thái enrollment và sequence policy cùng Learning owner.
4. Ghi outbox enrollment.created.v2 trong cùng transaction; publisher gửi sự kiện và xử lý retry sau commit.

**Giải thích thuật ngữ:** Enrollment là bản đăng ký; pin version là giữ phiên bản nội dung gắn với enrollment; event thông báo việc đã xảy ra; sequence policy quy định học tự do hay theo thứ tự. Retry là thực hiện lại thao tác lỗi tạm thời.

**Kết quả cần đạt:** Enrollment không trùng, có snapshot version đúng; sự kiện có thể được gửi lại an toàn và Learning khởi tạo tiến độ qua integration đã kiểm thử.

**Cách kiểm thử:** Đăng ký draft course, đăng ký trùng/đồng thời, gửi userId giả và truy cập bài bị khóa thứ tự. Dừng broker rồi khởi động lại để kiểm tra outbox không mất sự kiện; gửi trùng event và phối hợp Learning xác nhận progress không bị tạo hai lần.

### Giai đoạn 6 — Hoàn thiện quản lý và thảo luận

**Mục tiêu:** Hoàn thành phần chức năng Course còn lại trong contracts đã thống nhất.

**Công việc cụ thể:**

1. Viết catalog công khai có tìm kiếm/phân trang; danh sách khóa giảng viên và danh sách học viên theo quyền.
2. Viết discussion: tạo bài/trả lời, sửa theo tác giả, ghim và xóa theo quyền moderation.
3. Hủy enrollment theo baseline, giữ lịch sử và thông báo cho Learning khi cần.
4. Hoàn thiện event có consumer thực tế, test lỗi/retry và tài liệu bàn giao.

**Giải thích thuật ngữ:** Pagination là chia danh sách thành trang; moderation là quản lý nội dung thảo luận; idempotency là thực hiện lại cùng thao tác mà không tạo thêm tác động nghiệp vụ.

**Kết quả cần đạt:** API đúng phạm vi, không lộ course draft/học viên cho người sai quyền, có integration và bằng chứng kiểm thử.

**Cách kiểm thử:** Tìm kiếm/phân trang, course draft không public, giảng viên khác xem learner list, reply khác course, sửa bài người khác, ghim sai quyền và hủy enrollment lặp. Kiểm tra cancellation chặn access nhưng không xóa progress lịch sử; chưa hỗ trợ re-enroll nếu chưa có policy được duyệt.

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
