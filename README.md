# LMS Backend — Hướng dẫn làm việc nhóm

Backend LMS sử dụng NestJS và npm workspaces: một API Gateway, bốn business services và package contract dùng chung. Frontend được triển khai riêng.

## 1. Đọc gì trước khi bắt đầu?

1. Đọc [tài liệu thiết kế](docs/LMS_PROJECT_DOCUMENTATION.md), đặc biệt mục 4 (business rules), 7 (ownership), 11–15 (contracts và tích hợp), 25–29 (phân công, Git, roadmap).
2. Đọc [entry point của contracts](packages/contracts/src/index.ts) và [fixture IDs](packages/contracts/fixtures/ids.json).
3. Mở service mình phụ trách theo thứ tự: `src/main.ts` → `src/app.module.ts` → controller → service → test.
4. Khi dùng coding agent, đọc `AGENTS.md` trong thư mục service trước khi sửa code tại đó.

**Trạng thái hiện tại:** repo có scaffold NestJS và shared TypeScript contracts. Các endpoint nghiệp vụ, DB connections, migrations, RabbitMQ, MongoDB projections, Docker Compose và OpenAPI trong tài liệu là mục tiêu triển khai, không mặc nhiên đã hoàn thành. README bên trong từng app/service hiện còn là template NestJS; ưu tiên hướng dẫn ở đây và scripts thực tế.

## 2. Bản đồ codebase và phân công

| Thư mục | Owner | Trách nhiệm | Branch hiện có |
|---|---|---|---|
| [apps/api-gateway](apps/api-gateway) | Mạnh | Routing, JWT verification, request ID, timeout; không chứa business logic | Tạo branch task riêng |
| [services/identity-service](services/identity-service) | Chưa chốt | User, credential, đăng ký/đăng nhập, JWT, RBAC | `feat/identity/auth-rbac` |
| [services/course-service](services/course-service) | Chưa chốt | Course, chapter, lesson, publish, enrollment | `feat/course/enrollment` |
| [services/quiz-service](services/quiz-service) | Chưa chốt | Question, quiz, attempt, grading, result, outbox | `feat/quiz/grading` |
| [services/learning-service](services/learning-service) | Chưa chốt | Progress, mastery, consumer, Atlas activity/read model | `feat/learning/progress` |
| [packages/contracts](packages/contracts) | Cả nhóm review | HTTP types, event envelope/payload, routing keys, fixture IDs | `chore/contracts-foundation` |
| [docs](docs) | Cả nhóm | Thiết kế và quy ước tích hợp | Theo PR thay đổi |
| [infrastructure](infrastructure) | Người tích hợp | Cấu hình hạ tầng khi triển khai | Theo task |

Mọi branch đều chứa **toàn bộ monorepo**, không phải chỉ một service. Không xóa thư mục của thành viên khác. Chỉ sửa phần mình phụ trách; thay đổi shared contracts, cấu hình root và lockfile cần thông báo nhóm.

Trong NestJS: `main.ts` khởi động HTTP server; module khai báo dependency injection; controller nhận request; service thực hiện use case; repository/adapter truy cập DB hoặc service khác. Tổ chức feature theo Controller → Application Service → Repository/Integration Adapter. Không import entity/repository nội bộ của service khác.

## 3. Cài đặt và chạy local

Cần Git, Node.js và npm tương thích với dependency trong repo. Nhóm nên thống nhất cùng phiên bản Node/npm và kiểm tra `engines` của dependency khi cài đặt; repo hiện chưa pin phiên bản runtime. Supabase/Atlas credentials chỉ cần khi triển khai integration tương ứng.

```powershell
git clone https://github.com/maibui7879/lms-backend.git
cd lms-backend
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run build
```

Chạy lệnh npm từ **root repo**. Ví dụ dùng `npm.cmd` để tránh lỗi PowerShell chặn `npm.ps1`; trên Linux/macOS thay bằng `npm`.

Chọn service cần chạy, mỗi tiến trình dùng một terminal riêng:

```powershell
npm.cmd run start:dev -w @lms/identity-service
```

| Workspace | Lệnh chạy | Port dự kiến |
|---|---|---:|
| Gateway | `npm.cmd run start:dev -w @lms/api-gateway` | 3000 |
| Identity | `npm.cmd run start:dev -w @lms/identity-service` | 3001 |
| Course | `npm.cmd run start:dev -w @lms/course-service` | 3002 |
| Quiz | `npm.cmd run start:dev -w @lms/quiz-service` | 3003 |
| Learning | `npm.cmd run start:dev -w @lms/learning-service` | 3004 |

Kiểm tra `main.ts` và biến `PORT` của service để biết port thực tế. Không coi HTTP server khởi động được là đã kết nối DB hoặc đã có API nghiệp vụ.

### Cấu hình môi trường và dữ liệu

- Mỗi business service sở hữu một PostgreSQL database trên Supabase. Dùng TypeORM migrations, không bật `synchronize: true` cho môi trường dùng chung.
- Learning dùng thêm MongoDB Atlas cho activity/projection. PostgreSQL giữ progress chính thức; Atlas không quyết định enrollment hoặc điểm quiz.
- Identity phát JWT theo thiết kế hiện tại; dùng Supabase PostgreSQL **không đồng nghĩa** đã dùng Supabase Auth.
- Khi triển khai config cho service, tạo `.env.example` với placeholder và hướng dẫn vị trí `.env`/cách load config trong README service. Hiện chưa có bộ `.env.example` hoàn chỉnh; chỉ tạo `.env` chưa đảm bảo NestJS tự load nó.
- Không commit connection string, password, JWT private key, token hoặc `.env`. Không gửi secrets qua PR/log.

Danh sách biến cần triển khai nằm ở mục 10 của [tài liệu thiết kế](docs/LMS_PROJECT_DOCUMENTATION.md).

## 4. Shared contracts và fixture IDs

Mock authentication cho local/test nằm tại [packages/auth](packages/auth/README.md). Package cung cấp `MockAuthGuard`, `CurrentUser` và fixture identity; chưa được tự động gắn vào service. Chỉ bật với `MOCK_AUTH=true` và `NODE_ENV=development` hoặc `test`; không dùng làm fallback cho JWT trên production. Root build biên dịch contracts → auth → các app.

| File | Nội dung |
|---|---|
| [http/common.ts](packages/contracts/src/http/common.ts) | UUID alias, success/error envelope |
| [http/auth.ts](packages/contracts/src/http/auth.ts) | Role, auth user, JWT claims, register/login |
| [http/enrollment.ts](packages/contracts/src/http/enrollment.ts) | Enrollment và internal enrollment check |
| [http/quiz-result.ts](packages/contracts/src/http/quiz-result.ts) | Quiz result |
| [events/envelope.ts](packages/contracts/src/events/envelope.ts) | Event metadata dùng chung |
| [events/enrollment-created.v1.ts](packages/contracts/src/events/enrollment-created.v1.ts) | Event Course → Learning |
| [events/attempt-graded.v1.ts](packages/contracts/src/events/attempt-graded.v1.ts) | Event Quiz → Learning |
| [fixtures/ids.json](packages/contracts/fixtures/ids.json) | UUID demo thống nhất giữa các DB |

Types là hợp đồng **compile-time**, không phải runtime validation, JWT signature verification hoặc OpenAPI. `Uuid = string` không tự kiểm tra UUID. Mỗi service vẫn phải validate HTTP/event đầu vào, kiểm tra role và ownership.

Package đã khai báo `main`/`types`, các app khai báo dependency `@lms/contracts`; root build biên dịch contracts trước consumer. Chạy build contracts trước khi phát triển consumer nếu chưa có output. Dùng `import type` cho các interface; event constants là runtime exports.

### Thư viện đã cài theo workspace

| Workspace | Dependency bổ sung | Mục đích |
|---|---|---|
| Tất cả app | `class-validator`, `class-transformer`, `@nestjs/swagger`, `helmet`, `nestjs-pino`, `pino-http`, `@nestjs/passport`, `passport`, `passport-jwt`, `@lms/contracts` | Validation, OpenAPI, HTTP security, logging, JWT verification, contracts |
| Identity | `@nestjs/jwt`, `argon2` | Phát JWT, hash mật khẩu |
| Gateway | `@nestjs/config`, `@nestjs/axios`, `axios`, `@nestjs/throttler` | Config, HTTP forwarding, rate limit |
| Course, Quiz, Learning | `@nestjs/axios`, `axios`, `amqplib` | HTTP nội bộ và RabbitMQ client |
| Learning | `mongodb` | MongoDB Atlas native driver |

### Type definitions và công cụ phát triển đã cài

Các type packages dưới đây thuộc **devDependencies**, không phải runtime dependencies:

| Workspace | Type definitions |
|---|---|
| Gateway, Identity, Course, Quiz, Learning | `@types/passport-jwt@4.0.1`, `@types/express`, `@types/jest`, `@types/node`, `@types/supertest` |
| Course, Quiz, Learning | `@types/amqplib@0.10.8` |

Cả 5 app có `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`, TypeScript, `ts-node`, `ts-loader`, `tsconfig-paths`, `source-map-support`, Jest, `ts-jest`, Supertest, Prettier, `oxlint` và `oxlint-tsgolint`. `@nestjs/mau` có sẵn từ scaffold; việc có package này không có nghĩa dự án đã deploy bằng Mau.

Package [@lms/contracts](packages/contracts/package.json) có TypeScript trong devDependencies, scripts `build`/`typecheck` và entry points `dist/index.js`/`dist/index.d.ts`; không chứa dependency truy cập DB hoặc HTTP framework.

Phiên bản chính xác nằm trong `package.json` từng workspace; [package-lock.json](package-lock.json) khóa dependency tree để cài lại bằng `npm.cmd ci`. Không cài lại type packages chỉ vì không thấy chúng trong mục runtime dependencies. Nếu API của thư viện thay đổi, vẫn cần kiểm tra declarations có tương thích với code thực tế.

Không cài Mongoose/`@nestjs/mongoose` vì Learning dùng MongoDB Node.js Driver trực tiếp. Không cài `@nestjs/microservices` vì publisher/consumer RabbitMQ dự kiến dùng `amqplib` trực tiếp. Jest và Supertest hiện kiểm tra scaffold; chưa có integration tests cho PostgreSQL, Atlas hoặc RabbitMQ. Dockerfile và Docker Compose là cấu hình triển khai còn cần làm, không phải thư viện npm.

Các business service đã có TypeORM, `pg`, Config và Terminus. Không cần Supabase SDK khi dùng PostgreSQL connection string với TypeORM. Các type packages Passport JWT/AMQP được cài ở devDependencies tương ứng. Dependency đã cài chưa có nghĩa module, guard, interceptor, timeout/retry, consumer hoặc database đã được cấu hình. RabbitMQ dùng `amqplib` trực tiếp theo event routing contract, không mặc định dùng Nest RPC transport.

```powershell
npm.cmd run typecheck -w @lms/contracts
npm.cmd run build -w @lms/contracts
```

Fixture IDs dùng cho seed, mock, Postman và integration tests; không dùng làm ID cố định cho user thật. Mỗi service chỉ seed bảng/collection mình sở hữu và seed phải idempotent. Không đổi UUID đã chia sẻ mà chưa thông báo nhóm; không tạo foreign key xuyên database.

Khi thay đổi contract: thống nhất producer/consumer → sửa type/schema và fixture → cập nhật tests/docs → PR cho bên sử dụng review. Không đưa ORM entity, secret hoặc logic nghiệp vụ vào package. Breaking event changes cần version mới; event không chứa password, JWT hay đáp án đúng.

## 5. Làm việc trên các branch

`main` là nhánh tích hợp. Các branch service hiện có dùng cho đợt triển khai đầu tiên; không cần tạo lại. `chore/contracts-foundation` là branch nền tảng, không phải nhánh để mọi người cùng push code nghiệp vụ. Bảo vệ `main` và yêu cầu review là quy ước nhóm; không mặc định GitHub đã bật branch protection.

### Nhận branch được phân công

Ví dụ TV1 sau khi clone:

```powershell
git fetch origin
git switch --track origin/feat/identity/auth-rbac
```

Nếu branch local đã tồn tại:

```powershell
git switch feat/identity/auth-rbac
git pull --ff-only origin feat/identity/auth-rbac
```

TV2/TV3/TV4 thay tên branch theo bảng phân công. Trước khi switch/pull, chạy `git status`; commit công việc dở dang hoặc chủ động stash trước, không dùng lệnh reset để bỏ thay đổi.

### Chu trình hằng ngày

```powershell
git status
git branch --show-current
git pull --ff-only

# Sửa code và chạy kiểm tra phù hợp, rồi xem diff.
git diff
git add services/identity-service/src
git diff --cached
git commit -m "feat(identity): implement registration"
git push -u origin feat/identity/auth-rbac
```

Stage thêm test, migration, env example hoặc lockfile nếu task có thay đổi các phần đó. Ưu tiên stage đúng file thay vì gom thay đổi không liên quan. Không push trực tiếp vào branch của người khác, không force-push branch dùng chung.

### Lấy thay đổi mới từ main

Khi working tree sạch, đang ở branch feature:

```powershell
git fetch origin
git merge origin/main
# Chạy kiểm tra sau merge.
git push
```

Dùng merge cho branch đã chia sẻ để giữ lịch sử. Nếu conflict: đọc hai phía, trao đổi owner khi cần, sửa marker conflict, `git add` đúng file rồi `git commit`. Muốn hủy merge đang làm, dùng `git merge --abort`; không dùng `git reset --hard`. Nếu `pull --ff-only` bị từ chối vì diverged, kiểm tra `git log --oneline --graph --all` và phối hợp trước khi merge.

### Tạo task mới sau khi task cũ đã merge

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/identity/profile
git push -u origin feat/identity/profile
```

Branch mới nên bắt đầu từ `main` đã cập nhật. Không tiếp tục dùng mãi một branch task đã merge. Các commit nền tảng ban đầu đã được đồng bộ sang các branch; không cherry-pick lại chúng. Từ đây tích hợp qua PR và lấy thay đổi chung bằng merge `origin/main`.

## 6. Kiểm tra và Pull Request

Các lệnh có trong scripts hiện tại:

```powershell
# Build toàn monorepo.
npm.cmd run build

# Kiểm tra contracts.
npm.cmd run typecheck -w @lms/contracts

# Ví dụ kiểm tra riêng service (thay workspace theo phần mình làm).
npm.cmd run lint -w @lms/identity-service
npm.cmd run test -w @lms/identity-service -- --runInBand
npm.cmd run test:e2e -w @lms/identity-service -- --runInBand
```

Root `typecheck` dùng `--if-present`: hiện chỉ contracts có script này, nên lệnh root không chứng minh tất cả service đã được typecheck riêng. Build/test cũng không chứng minh luồng liên service đã chạy. Nếu Jest lỗi đường dẫn `./node_modules/jest/bin/jest.js` sau clean install do workspace hoisting, cần sửa script test trong PR tooling và báo nhóm; không bỏ qua test hoặc coi đó là business test đã pass.

Push branch rồi mở PR trên GitHub: **base = main**, **compare = branch task**. PR cần nêu:

- Chức năng và phạm vi file/service thay đổi.
- API/event contract thay đổi và consumer bị ảnh hưởng.
- Migration/seed và biến môi trường mới (không kèm giá trị secret).
- Lệnh kiểm tra đã chạy, kết quả và phần chưa kiểm chứng.
- Cách chạy thử, ví dụ request và business rule trả 4xx.

Cần ít nhất một thành viên review trước khi merge; thay đổi contract cần producer/consumer liên quan review. Không merge khi còn conflict hoặc kiểm tra bắt buộc thất bại.

## 7. Việc đầu tiên của mỗi thành viên

1. Checkout đúng branch, cài dependency từ root và đọc contract liên quan.
2. Chốt endpoint/request/response với người dùng service của mình.
3. Triển khai config, DB connection và health; viết `.env.example` khi thêm config.
4. Viết migration/seed bằng fixture IDs, business rule và test trước khi tích hợp thật.
5. Bổ sung OpenAPI, Dockerfile và README service theo chức năng đã làm.
6. Mở PR sớm, ghi rõ dependency chưa hoàn thành và mock đang dùng; thay mock bằng integration thật trước demo.

Checklist nghiệm thu chi tiết nằm ở mục 28 và phụ lục B của [tài liệu dự án](docs/LMS_PROJECT_DOCUMENTATION.md).
