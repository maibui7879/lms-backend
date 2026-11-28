# Course Service — Hướng dẫn TV2 nhận việc

Owner: chưa chốt tên. Workspace `@lms/course-service`, port mặc định 3002, branch hiện có `feat/course/enrollment`. Nhận task theo [README gốc](../../README.md), đọc [AGENTS.md](AGENTS.md) trước khi sửa.

## Trạng thái và phạm vi

Course ghi sự kiện duyệt course/revision vào transactional outbox; notification-service
xử lý inbox và Socket.IO. Xem [hợp đồng sự kiện Notifications](../../packages/contracts/docs/notifications.md).

Đã có API course/chapter/lesson/item, completion policy, review/revision, enrollment, discussion, patch notice và internal learning structure/migration context. Swagger dùng contract chung tại `/docs`. Các mục lộ trình phía dưới là tài liệu lịch sử; không dùng chúng để suy ra kết quả kiểm thử hay trạng thái triển khai cloud.

### Cập nhật schema và tích hợp

Đợt sửa này bổ sung quiz cuối chapter, lịch sử ghi danh, ánh xạ nguồn revision, change log, notice, outbox và hàng đợi HTTP migration. Với database Course **đã có schema cũ**, sao lưu trước, đặt `DB_SYNC=false`, rồi chạy:

```powershell
npm.cmd run build -w @lms/course-service
npm.cmd run migration:run -w @lms/course-service
```

Các migration hiện tại là bản nâng cấp schema cũ, không phải migration khởi tạo một database trống. Không chạy migration nâng cấp trên database đã được synchronize sang schema mới mà chưa đối chiếu migration history. Không tự suy đoán lineage cho revision được tạo trước bản sửa; cần đối chiếu dữ liệu gốc trước khi dùng chúng để migrate tiến độ.

- `MOCK_AUTH=true` chỉ dành development/test. Khi tắt mock, Course xác minh JWT RS256 với `JWT_PUBLIC_KEY`, issuer `identity-service`, rồi gọi Identity qua `IDENTITY_URL` để kiểm tra trạng thái/role hiện tại. Mỗi request tạo service JWT mới, thời hạn 240 giây, từ `IDENTITY_INTERNAL_JWT_PRIVATE_KEY`, với issuer `lms-internal`, subject `course-service`, audience `identity-service` và scope `getUserAccess`. Không dùng `IDENTITY_SERVICE_TOKEN` cố định nữa. Thiếu cấu hình hoặc Identity không truy cập được thì trả 503, không tự chấp nhận người dùng.

  Cấu hình tích hợp thật: đặt `MOCK_AUTH=false`; đưa public key đăng nhập của Identity vào `JWT_PUBLIC_KEY` của Course; đặt `IDENTITY_URL` trỏ tới Identity. Cấp riêng cặp khóa RSA nội bộ: private key qua secret `IDENTITY_INTERNAL_JWT_PRIVATE_KEY` ở Course, public key tương ứng qua `INTERNAL_JWT_PUBLIC_KEY` ở Identity. Không dùng lại private key đăng nhập của Identity, không commit khóa vào Git. Cặp khóa nội bộ phải do deployment quản lý và chỉ cấp cho caller được tin cậy; đây không phải API cấp token login. Cấu hình này không thay thế cơ chế inbound `COURSE_SERVICE_TOKEN`/`INTERNAL_JWT_PUBLIC_KEY` của Course. Sau khi Admin duyệt Instructor, người dùng cần login/refresh lấy token có role mới; Course vẫn kiểm tra owner/enrollment tại service nghiệp vụ.
- Internal development/test dùng `COURSE_SERVICE_TOKEN`. Staging/production dùng `INTERNAL_JWT_PUBLIC_KEY`, JWT issuer `lms-internal`, audience `course-service`, subject là service được phép, scope theo operationId và TTL không quá 5 phút.
- Enrollment create/cancel ghi outbox cùng transaction. `RABBITMQ_URL` bật publisher confirm trên exchange `lms.events`; sự cố broker giữ nguyên event để retry, cùng eventId.
- Revision CRITICAL với `MIGRATE_AFFECTED_ITEMS` tạo job bền vững cho item thêm/sửa. Dispatcher gọi Learning bằng `LEARNING_URL` và `LEARNING_SERVICE_TOKEN`, giữ nguyên payload/revisionId khi retry. Thiếu cấu hình thì job chưa được gửi. Không tự reset toàn bộ khóa hay đổi contentVersion enrollment.
- Contract migration hiện nhận ID item thuộc revision đích. Xóa item không còn bản đích và thay đổi policy không có endpoint revision-policy riêng; không suy diễn chúng thành yêu cầu học lại một item khác. Policy của revision được kế thừa, ánh xạ ID và kiểm tra lúc xuất bản; không hỗ trợ sửa policy của course PUBLISHED trực tiếp.

Migration và kiểm thử ghép với Supabase/Identity/Quiz/Learning thật phải được chạy riêng; test double không chứng minh các kết nối cloud đã hoạt động.

Course sở hữu course/chapter/lesson/learning item, review history, enrollment và immutable requirements snapshots trong PostgreSQL riêng. Quiz sở hữu câu hỏi/điểm; Learning sở hữu tiến độ. Không join DB của hai service này.

## Chạy thử POST tạo khóa học với PostgreSQL/Supabase dev

## Swagger

Course Service phục vụ Swagger UI từ contract OpenAPI dùng chung:

- Swagger UI: `http://127.0.0.1:3002/docs`
- OpenAPI JSON: `http://127.0.0.1:3002/docs-json`

Contract được đọc từ [Course OpenAPI](../../packages/contracts/openapi/course.json), vì vậy các endpoint, schema, role và mô tả trên Swagger luôn lấy từ contract hiện tại. Sau khi sửa contract, chạy lại bước generate rồi khởi động lại Course Service để Swagger nhận phiên bản mới.

Từ root repo: `npm.cmd ci`, `npm.cmd run build -w @lms/contracts`, `npm.cmd run build -w @lms/auth`. Dependency `@lms/auth` đã được khai báo, không cần install lại. Copy [env example](.env.example) sang `.env` trong thư mục service, rồi đặt:

```dotenv
NODE_ENV=development
PORT=3002
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres
DB_SYNC=true
MOCK_AUTH=true
```

Chỉ dùng database Course dev riêng có thể reset; thay URL bằng connection string Supabase của bạn và giữ host/port/TLS parameters do provider cấp. Không thêm `rejectUnauthorized:false`, không commit `.env`. Env được nạp từ thư mục service khi chạy source hoặc dist; process environment ưu tiên hơn env file. `DB_SYNC` mặc định false và chỉ được true khi NODE_ENV=development; staging/production cần migrations ở task sau. Mock auth chỉ cho development/test và không phải fallback JWT.

```powershell
npm.cmd run start:dev -w @lms/course-service
```

Terminal khác gọi API, không cần Identity/Gateway/RabbitMQ:

```powershell
$payload = @{ title='NestJS Fundamentals'; description='Learn NestJS from scratch'; thumbnailUrl=$null } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3002/api/v1/courses -ContentType 'application/json' -Headers @{ 'x-mock-user'='instructorA'; 'x-request-id'='course-local-1' } -Body $payload
```

HTTP 201 trả `{ data: CourseData, meta: { requestId } }`; `instructorId` lấy từ fixture đã xác thực, status=DRAFT, version/contentVersion=1, UUID/timestamps do server/DB tạo. Header X-Request-Id khớp envelope; nếu không gửi hoặc header không hợp lệ, server tạo ID mới. Body không được chứa instructorId/userId/status/version/timestamps. Student/Admin trả 403; thiếu/sai fixture hoặc mock disabled trả 401; payload sai trả 400; storage unavailable trả 503 không lộ SQL/credentials.

Validation dùng `parseContract` qua Nest pipe chuyên biệt, không khai báo lại class-validator rules dễ lệch schema. Title tối đa 200 ký tự theo contracts; thumbnail HTTP(S) hoặc null, bỏ trống thì lưu null. Bảng courses không có foreign key sang Identity DB. Bản mẫu chưa thực hiện optimistic locking cho update vì chỉ có create.

### Seed và kiểm thử database

```powershell
npm.cmd run build -w @lms/course-service
npm.cmd run seed:course -w @lms/course-service
```

Seed chỉ chạy development/test, insert fixture draftCourse thuộc instructorA theo [IDs chung](../../packages/contracts/fixtures/ids.json); gặp ID đã có thì bỏ qua, không ghi đè chỉnh sửa và không ảnh hưởng rows tạo bởi POST. Seed không tạo course PUBLISHED giả thiếu requirements, không tạo user trong Identity DB. Nếu DB_SYNC=false, bảng phải được chuẩn bị trước; seed không tự bỏ rào chắn schema sync.

Nếu seed lỗi, build lại service trước khi thử tiếp vì lệnh seed chạy file trong dist. Thông báo mới chỉ in mã lỗi/hướng xử lý, không in credentials hoặc SQL:

| Lỗi                          | Cách xử lý                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HOST placeholder / ENOTFOUND | DATABASE_URL từ env example chưa phải địa chỉ DB thật hoặc DNS lỗi. Copy URL từ nút Connect của đúng Supabase project; không chỉ sửa password rồi giữ HOST                            |
| ENETUNREACH                  | Kiểm tra IPv6; nếu máy chỉ có IPv4, dùng session pooler URL do Supabase cấp, giữ nguyên user/host/port của pooler                                                                     |
| 28P01                        | Kiểm tra database password, username và URL-encode ký tự đặc biệt trong credentials; không phải mật khẩu tài khoản đăng nhập Dashboard                                                |
| 42P01                        | Chưa có bảng courses. Với database dev riêng có thể reset, đặt NODE_ENV=development và chủ động bật DB_SYNC=true; môi trường dùng chung phải chuẩn bị schema bằng quy trình migration |
| ECONNREFUSED / timeout       | Kiểm tra host/port, DB đang hoạt động và kết nối mạng/firewall                                                                                                                        |
| TLS certificate              | Cấu hình CA phù hợp; không tắt kiểm tra chứng chỉ                                                                                                                                     |

Kiểm tra cả biến môi trường PowerShell đang giữ vì chúng ưu tiên hơn `.env`; không in DATABASE_URL ra terminal/log khi chia sẻ lỗi. Xem [hướng dẫn kết nối Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres) để chọn direct/session pooler đúng mạng. Không tự bật DB_SYNC cho staging/production để chữa lỗi seed.

HTTP tests mặc định dùng repository test double và được ghi tên rõ; test ghi PostgreSQL thật chạy riêng bằng database **disposable có tên kết thúc `_test`**:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
npm.cmd run test:db -w @lms/course-service
Remove-Item Env:TEST_DATABASE_URL
```

Suite DB chủ động bật synchronize trên database test đã chọn, kiểm tra row sau POST và seed hai lần, chỉ dọn IDs do suite tạo. Không dùng Supabase chứa dữ liệu thật cho lệnh này. Khi không có TEST_DATABASE_URL, suite DB được skip trong test:e2e thông thường; không gọi đó là persistence test đã pass. Để xác minh Supabase phải chạy với database dev dành riêng và kiểm tra TLS/connectivity thực tế, không chỉ dựa kết quả PostgreSQL local.

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

[Env example](.env.example) mô tả cấu hình DB, auth và tích hợp service. `IDENTITY_URL`, `JWT_PUBLIC_KEY` và `IDENTITY_INTERNAL_JWT_PRIVATE_KEY` được dùng cho xác thực thật như hướng dẫn phía trên; issuer access token được kiểm tra cố định là `identity-service`. Config loader nạp env của service; mock auth xem [package auth](../../packages/auth/README.md).

## Kiểm tra và bàn giao

```powershell
npm.cmd run build -w @lms/course-service
npm.cmd run lint -w @lms/course-service
npm.cmd run test -w @lms/course-service -- --runInBand
npm.cmd run test:e2e -w @lms/course-service -- --runInBand
```

Acceptance tests cần bổ sung: Instructor khác không sửa course; Student không review; reject thiếu lý do; published content không sửa; stale version/reorder sai parent; enrollment trùng và course draft; snapshot/version đúng; outbox không mất khi crash; access dependency unavailable; canceled enrollment bị chặn; discussion parent/author đúng course.

PR bàn giao cho Quiz/Learning phải nêu provider routes đã chạy, policy snapshot, event sample đã validate và failure paths. Dataset/seed chỉ làm sau review contracts, theo [IDs chung](../../packages/contracts/fixtures/ids.json), idempotent và không tạo foreign key xuyên DB. Scaffold test pass chưa đáp ứng các acceptance trên.

## Revision và critical update

Course IN_REVIEW bị khóa chỉnh sửa. Instructor phải chờ Admin REJECT để sửa lại. Course PUBLISHED chỉ được thay đổi qua CourseRevision; enrollment cũ tiếp tục dùng contentVersion đã pin.

Revision NORMAL chỉ áp dụng cho learner mới. Revision CRITICAL có thể tạo patch notice và gọi Learning migration theo item. Item không thay đổi giữ COMPLETED; item bị ảnh hưởng có thể thành OUTDATED hoặc RESET. Không tự động reset toàn bộ course và không xóa attempt quiz cũ.
## Chạy Course bằng Compose từ root repository

Compose chung tại [docker-compose.yml](../../docker-compose.yml), Dockerfile riêng tại [Dockerfile](./Dockerfile). Hiện Compose chỉ khai báo Course; chưa container hóa Identity, Learning, Quiz, Gateway hay DB. PostgreSQL/Supabase tiếp tục dùng `DATABASE_URL` trong env Course, không tạo container DB và không tự chạy migration trên DB ngoài.

Chuẩn bị Docker Desktop với Linux containers và env Course hợp lệ. Identity phải chạy trên máy host cổng 3001; cấu hình cặp khóa nội bộ như phần xác thực phía trên. Không copy private key đăng nhập sang Course. Compose đọc env theo cú pháp env-file: giá trị chứa `$` cần đặt trong dấu nháy đơn để không bị nội suy; PEM có thể dùng dấu nháy kép với `\n`. Env chỉ được đưa vào container lúc chạy, không copy vào image. Người có quyền Docker vẫn có thể đọc env container, nên cấu hình này dành cho local; deployment thật nên dùng secret manager.

Từ root repository:

```sh
docker compose up --build -d course
docker compose ps
docker compose logs --tail=100 course
```

Sau build đầu, `docker compose up -d` khởi động các service hiện có trong Compose. Truy cập Course tại `http://localhost:3002`, Swagger tại `/docs`, JSON tại `/docs-json`. Chỉ bind cổng loopback trong bản thử này. Dừng Course chạy bằng npm trước để tránh trùng cổng, hoặc đặt `COURSE_HOST_PORT=3102` trong môi trường shell để dùng cổng 3102. Không dùng `docker compose config` không có `--quiet` khi chia sẻ log vì có thể lộ secrets sau khi resolve env.

Identity/Learning trên host được gọi qua `host.docker.internal`; có thể override bằng `COURSE_IDENTITY_URL` và `COURSE_LEARNING_URL`. Khi bổ sung container Identity/Learning vào Compose, đổi sang tên service tương ứng. Nếu DB hoặc RabbitMQ nằm trên máy host thì URL bên trong container cũng phải dùng `host.docker.internal`, không phải `localhost`; Supabase remote giữ nguyên URL. Compose không override `RABBITMQ_URL`.

Container luôn dùng `MOCK_AUTH=false`, `DB_SYNC=false`, `NODE_ENV=production`. API internal của Course vì vậy yêu cầu JWT nội bộ đúng scope, không nhận token tĩnh development. Healthcheck dùng `GET /health` để kiểm tra HTTP và khả năng truy vấn DB. Để dừng container Course: `docker compose stop course`.

## Authoring reads and safe content mutations

- `GET /api/v1/instructor/courses/{id}` returns an owned course in any status; requires an active instructor. It does not make drafts public.
- `GET /api/v1/course-revisions/{id}/outline` returns only the requested revision's chapters, lessons and items with their versions. Access is restricted to the active owner or admin. For unpublished revisions, `contentVersion` is the base version; `revisionId` identifies the editable snapshot.
- Keep using `GET /api/v1/courses/{id}/outline` for current published/original content; it does not select an authoring revision.
- Delete and reorder payloads accept optional `revisionId`. Delete uses the target entity's `expectedVersion`; reorder uses the course/revision's `expectedVersion` and a complete, duplicate-free `orderedIds` list.
- Deleting a chapter with lessons or a lesson with items returns HTTP 409. Delete children explicitly first; the backend never silently cascades their removal.
- Content writes serialize on the course row, including child creation. Delete/reorder and parent-version updates commit or roll back together on conflicts.
- Lesson reorder continues to return `{ data: LessonData[], meta }`; OpenAPI now documents that existing response correctly.

## Health checks

- `GET /health/live`: process liveness, no authentication or dependency checks.
- `GET /health`: readiness; queries the `courses` table and returns HTTP 503 if the database/table is unavailable. Course broker delivery is not checked by this endpoint.
- Both endpoints are direct service URLs (default port 3002), not Gateway business routes. Compose uses `/health` for container readiness.
