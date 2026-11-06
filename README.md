# LMS Backend — Hướng dẫn nhận việc

Monorepo NestJS sử dụng npm workspaces, gồm API Gateway, bốn business services và hai package dùng chung. Frontend phát triển riêng. Thành viên nhận một phạm vi nghiệp vụ, đọc contracts tương ứng, triển khai và mở PR về `main`.

## 1. Trạng thái bàn giao

| Đã có                                                                     | Chưa triển khai                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Scaffold NestJS, scripts build/lint/test, CI workflow                     | API nghiệp vụ đầy đủ, JWT verification và routing Gateway     |
| Baseline contracts: 146 schemas, 88 operations, runtime parser và OpenAPI | Migrations, DB các service khác, RabbitMQ/outbox/consumer     |
| Fixture IDs và package mock authentication cho dev/test                   | Mock dataset liên service, MongoDB projection, Docker Compose |
| Env example; Course có env loader, POST tạo course và seed draft          | Env loader các app khác, health checks, runtime Swagger       |

Course đã có bản mẫu [POST tạo course](services/course-service/README.md) ghi PostgreSQL, mock auth và seed draft có giới hạn môi trường; các app khác vẫn là scaffold. `GET /` của mỗi app vẫn trả `Hello World!`. Chưa có luồng liên service hoàn chỉnh. OpenAPI là đặc tả mục tiêu, không phải mọi API đều đang chạy. Các policy trong [baseline contracts](packages/contracts/README.md) cần producer/consumer review; chưa đối chiếu đầy đủ Function List bên ngoài. Không tự đánh dấu ADR đã được duyệt.

## 2. Chọn phần việc và đọc hướng dẫn riêng

| Phần việc                           | Người nhận                    | README nhận việc                                | Branch hiện có                                    | Port |
| ----------------------------------- | ----------------------------- | ----------------------------------------------- | ------------------------------------------------- | ---: |
| Gateway và tích hợp                 | Mạnh                          | [API Gateway](apps/api-gateway/README.md)       | Tạo branch task từ main                           | 3000 |
| TV1: tài khoản, session, RBAC       | Chưa chốt tên                 | [Identity](services/identity-service/README.md) | `feat/identity/auth-rbac`                         | 3001 |
| TV2: nội dung, review, enrollment   | Chưa chốt tên                 | [Course](services/course-service/README.md)     | `feat/course/enrollment`                          | 3002 |
| TV3: câu hỏi, attempt, grading      | Chưa chốt tên                 | [Quiz](services/quiz-service/README.md)         | `feat/quiz/grading`                               | 3003 |
| TV4: progress, completion, consumer | Chưa chốt tên                 | [Learning](services/learning-service/README.md) | `feat/learning/progress`                          | 3004 |
| Contracts và thay đổi chung         | Producer + consumer liên quan | [Contracts](packages/contracts/README.md)       | `chore/contracts-foundation` hoặc branch task mới |    — |

TV1–TV4 là nhãn phân công, không phải tên người đã xác nhận. Cập nhật tên owner trong bảng khi nhận việc. Mọi nhánh chứa toàn bộ monorepo; không xóa thư mục service khác, không giới hạn checkout chỉ còn phần mình làm.

README bốn business services chia thành sáu giai đoạn, Gateway có năm giai đoạn phù hợp phạm vi. Mỗi giai đoạn dùng cùng cấu trúc: **Mục tiêu → Công việc cụ thể → Giải thích thuật ngữ → Kết quả cần đạt → Cách kiểm thử**. Đây là lộ trình cần thực hiện, không phải báo cáo các tính năng đã chạy.

Trước khi code, đọc [baseline contracts](packages/contracts/README.md), [handoff](docs/HANDOFF.md), rồi README của service mình nhận. [Tài liệu thiết kế](docs/LMS_PROJECT_DOCUMENTATION.md) bổ sung kiến trúc và business rules; các đề xuất lịch sử khác baseline phải được nhóm thống nhất trước khi triển khai. Khi dùng coding agent, đọc AGENTS.md trong workspace tương ứng.

## 3. Quy trình nhận một task

1. Chốt tên người nhận, service và người review; chọn một lát cắt đủ nhỏ để hoàn thành trong một PR.
2. Ghi task trên issue hoặc kênh quản lý của nhóm: mục tiêu, operationId trong [endpoint catalog](packages/contracts/src/endpoints.ts), input/output, quyền truy cập, mã lỗi, migration và acceptance tests.
3. Liệt kê dependency: provider nào đã sẵn sàng, dependency nào cần adapter giả trong test; trao đổi với owner provider trước khi đổi contract.
4. Ghi phần được sửa và phần dùng chung cần review. Không import entity/repository của service khác hoặc join database xuyên service.
5. Tạo/checkout branch, chạy baseline checks, thực hiện task rồi mở PR về main.

Mẫu nội dung task:

```text
Owner / reviewer:
Service / branch:
Mục tiêu và operationId:
Contract và business rules áp dụng:
Provider / consumer bị ảnh hưởng:
Phạm vi file, migration và cấu hình:
Acceptance: thành công + sai quyền + dữ liệu sai + retry/conflict:
Dependency giả trong test / phần chưa kiểm chứng:
```

Đừng nhận task “làm toàn bộ service” mà không chia milestone. README từng service có thứ tự triển khai và ca nghiệm thu để tách thành các task nhỏ.

### Ghi kết quả sau mỗi giai đoạn

Chạy test phù hợp và cập nhật issue/PR trước khi chuyển bước. Nếu còn dependency giả hoặc lỗi chặn nghiệm thu, ghi rõ thay vì đánh dấu integration đã xong. Các fake adapters và dữ liệu do test tạo được dùng để kiểm thử độc lập; dataset demo/seed vẫn theo bước review contracts của nhóm.

```text
Service / giai đoạn / người thực hiện:
Chức năng và operationId đã hoàn thành:
Lệnh test và kết quả (kèm bằng chứng):
Provider thật / fake adapter đang dùng:
Chức năng còn thiếu và lỗi chưa xử lý:
Điều kiện còn phải đạt trước khi chuyển bước:
PR / người review:
```

Mỗi chức năng tuân thủ contracts, không tự đổi payload/route, không truy cập DB service khác và phải kiểm tra quyền ở service sở hữu dữ liệu. Các phần của giai đoạn phụ thuộc provider được kiểm thử độc lập trước; chỉ công bố tích hợp thật khi đã chạy với provider thật.

## 4. Chuẩn bị máy và chạy local

CI dùng Node.js 24; lần xác minh bàn giao dùng Node 24.21.0/npm 11.21.0. Repo chưa pin runtime bằng engines; nhóm nên dùng cùng major Node/npm và cài bằng lockfile.

```powershell
git clone https://github.com/maibui7879/lms-backend.git
cd lms-backend
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
```

Tất cả lệnh npm trong tài liệu chạy từ thư mục chứa [package.json gốc](package.json). Trên Linux/macOS thay `npm.cmd` bằng `npm`. Không chạy install riêng trong service; dependency dùng npm workspace và [lockfile chung](package-lock.json).

Ví dụ chạy Quiz trong terminal riêng:

```powershell
$env:NODE_ENV='development'
$env:PORT='3003'
npm.cmd run start:dev -w @lms/quiz-service
```

Terminal khác kiểm tra scaffold:

```powershell
Invoke-RestMethod http://127.0.0.1:3003/
```

Kết quả hiện tại là `Hello World!`. Nếu chạy nhiều service, dùng terminal riêng hoặc đặt PORT đúng workspace; biến PORT trong cùng terminal được giữ lại cho lệnh tiếp theo.

Course đã nạp env/config cho bản mẫu tạo khóa học; xem README service trước khi chạy và chỉ bật DB_SYNC trên database dev có thể reset. Các app còn lại mới đọc PORT từ process environment, chưa tự load `.env`. Các integration placeholders chưa đồng nghĩa đã có kết nối. Không commit `.env`, khóa JWT, token hoặc database credentials.

## 5. Thứ tự triển khai để làm song song

| Giai đoạn                | Việc cần hoàn thành                                                                                     | Điều kiện chuyển bước                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1. Review contracts      | Chốt policy còn mở, ownership, service authentication và mapping Function ID → operation/task           | Producer và consumer thống nhất contract dùng cho task          |
| 2. Nền tảng từng service | Config, DB/migration, health, error envelope, request ID, auth boundary                                 | Service khởi động và test dependency failure rõ ràng            |
| 3. API provider          | Identity auth/access; Course reference, snapshot, enrollment/access; Quiz graded summary/attempt access | Consumer có provider contract để kiểm thử độc lập               |
| 4. Use case              | Course author/review/enroll; Quiz start/save/submit; Learning progress/resume/completion                | Business rules và negative tests pass                           |
| 5. Events và đồng bộ     | Outbox Course/Quiz, Learning consumer/receipt, retry/DLQ/replay                                         | Duplicate và failure/recovery không mất hoặc cộng trùng dữ liệu |
| 6. Mock/seed và tích hợp | Dataset theo IDs chung sau review contracts; Gateway → service → event → Learning                       | Có scenario manifest, quan hệ/version hợp lệ và E2E thật        |

Trong khi chờ provider, consumer được dùng fake adapter trong test theo DTO/schema đã chốt. Đó không phải dataset demo hoặc bằng chứng integration thật đã xong. Không cần chờ service khác làm xong toàn bộ mới viết logic của mình.

## 6. Làm việc với contracts và dữ liệu

Imports từ `@lms/contracts`; dùng `import type` cho interface. [Runtime parser](packages/contracts/src/validation.ts) kiểm tra shape và một số quan hệ trong payload; service vẫn phải xác minh JWT, ownership, DB relationships, deadlines và transaction. Không sửa [schema sinh](packages/contracts/src/schemas.json) hoặc [OpenAPI sinh](packages/contracts/openapi.json) trực tiếp.

```powershell
# Sau khi sửa DTO hoặc endpoint catalog.
npm.cmd run generate -w @lms/contracts
npm.cmd test -w @lms/contracts
```

Giữ v1 cho consumer cũ; luồng mới dùng enrollment.created.v2 và attempt.graded.v2 theo [migration policy](packages/contracts/README.md). Không để consumer áp dụng cả v1 lẫn v2 cho cùng một nghiệp vụ.

[Fixture IDs](packages/contracts/fixtures/ids.json) chỉ là ID thống nhất, chưa phải record đã seed. Mỗi service sở hữu một PostgreSQL database; dùng TypeORM migrations, không bật synchronize ở môi trường dùng chung. Learning dùng thêm MongoDB Atlas cho activity/read model; PostgreSQL giữ progress chính thức. Supabase PostgreSQL không tự cung cấp quy trình Identity của repo.

[Mock auth](packages/auth/README.md) chỉ dành dev/test, chưa tự gắn vào scaffold. Không dùng làm fallback khi JWT sai. Các dependency đã khai báo chưa đồng nghĩa integration đã được cấu hình; kiểm tra package.json, không cài lại thư viện tùy tiện. Khi thêm dependency dùng `npm.cmd install <package> -w <workspace>` từ root và commit lockfile cùng thay đổi.

## 7. Git: nhận nhánh, đồng bộ và bàn giao

Kiểm tra `git status` trước switch/pull. Commit công việc đang làm hoặc chủ động stash; không dùng reset hard để bỏ thay đổi. Ví dụ nhận branch Identity có sẵn:

```powershell
git fetch origin
git switch feat/identity/auth-rbac
git pull --ff-only origin feat/identity/auth-rbac
git merge origin/main
```

Nếu clone chưa có local branch, dùng `git switch --track origin/feat/identity/auth-rbac`. Với task mới, ưu tiên nhánh mới từ main đã cập nhật:

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/identity/registration
```

Trong branch task đã chia sẻ, lấy thay đổi chung bằng `git fetch origin` rồi `git merge origin/main`. Không force-push; xử lý conflict theo ownership và chạy lại checks. Có thể dùng `git merge --abort` khi cần hủy merge chưa hoàn tất. Không cherry-pick lại contracts baseline đã được đồng bộ.

```powershell
git diff
git add services/identity-service/src services/identity-service/test
git diff --cached
git commit -m "feat(identity): implement registration"
git push -u origin feat/identity/registration
```

Stage thêm migration, env example, README và lockfile khi task có thay đổi các phần đó. PR: base `main`, compare branch task. Thông thường không push trực tiếp main hoặc đồng bộ toàn nhánh; lần đồng bộ baseline trước đó không thay thế quy trình PR cho việc mới.

## 8. Kiểm tra và Definition of Done

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd test
# Thay workspace theo phần mình nhận.
npm.cmd run test:e2e -w @lms/identity-service -- --runInBand
git diff --check
```

Root typecheck hiện chỉ có ở contracts/auth; build mới kiểm tra compile các Nest apps. Scaffold unit/e2e hiện chỉ kiểm tra hello endpoint; thêm test nghiệp vụ thực tế cho use case đã triển khai. Thay đổi tài liệu đơn thuần chỉ cần kiểm tra format, links và diff, không cần chạy lại toàn bộ business tests.

Một task hoàn thành khi:

- API/event đúng contracts; success, validation, sai quyền và state conflict được kiểm thử.
- DB thay đổi có migration; mutation cần atomicity/idempotency có test concurrency hoặc retry phù hợp.
- Integration có timeout/failure path; event consumer không ACK trước commit và không áp dụng duplicate hai lần.
- README service, env example và contract/OpenAPI được cập nhật khi liên quan; không chứa secrets.
- PR nêu vấn đề, kết quả, lệnh test, cách chạy và giới hạn chưa kiểm chứng; producer/consumer review nếu đổi contract.
- CI và kiểm tra bắt buộc pass trước merge. Không gọi fake adapter/scaffold test là E2E liên service thật.

Checklist nghiệp vụ chi tiết nằm trong từng README service; các quy tắc chung và quyết định cần review nằm trong [contracts baseline](packages/contracts/README.md).
