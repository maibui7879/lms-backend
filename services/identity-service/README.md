# Identity Service — Hướng dẫn TV1 nhận việc

Owner: chưa chốt tên. Workspace `@lms/identity-service`, port mặc định 3001, branch hiện có `feat/identity/auth-rbac`. Nhận task và mở PR theo [hướng dẫn chung](../../README.md); đọc [AGENTS.md](AGENTS.md) trước khi sửa.

## Trạng thái và phạm vi

Hiện chỉ có scaffold `GET /` → `Hello World!`. Chưa có đăng ký, JWT verification/issuance, session store, config loader hoặc kết nối DB. Các phần dưới đây là việc cần triển khai theo baseline đã viết, không phải tính năng đang chạy.

Identity sở hữu user, password hash, role/status, refresh sessions và audit quản trị trong PostgreSQL riêng. Không quản lý enrollment, course, quiz hoặc progress. Dùng Supabase PostgreSQL không đồng nghĩa dùng Supabase Auth.

## Contracts phải đọc

| Nguồn                                                                        | Mục đích                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [Auth DTO](../../packages/contracts/src/http/auth.ts)                        | Register/Login, AuthUser, JwtClaims                           |
| [Identity DTO](../../packages/contracts/src/http/identity.ts)                | Profile, sessions, admin user/audit, permissions              |
| [Internal integration](../../packages/contracts/src/internal/integration.ts) | UserAccessStatus cho Gateway/services                         |
| [Identity OpenAPI](../../packages/contracts/openapi/identity.json)           | Toàn bộ method/path/request/response và security              |
| [Contract baseline](../../packages/contracts/README.md)                      | Authorization, session rotation, error codes và review policy |

Nhóm API: register/login/refresh/logout; users/me; admin list/status/role/audit; internal user summary/access. Danh sách operationId đầy đủ ở [endpoint catalog](../../packages/contracts/src/endpoints.ts). Login mới trả SessionData có refresh token; không tự dùng kiểu LoginResponse cũ để bỏ trường session.

## Thứ tự nhận task

1. Config validation, PostgreSQL connection/migrations và health. Thiết kế unique email, sessions và audit; không bật synchronize ở DB dùng chung.
2. Register/login: normalize email, hash password bằng argon2, public signup chỉ STUDENT, chặn account INACTIVE.
3. JWT RS256 theo JwtClaims, expiry/issuer/algorithm allowlist; chốt key distribution/JWKS với Gateway. Không tự thêm audience vào user JWT contract mà không review.
4. Refresh rotation/reuse detection và logout idempotent; lưu hash refresh token, không lưu token thô.
5. Profile, internal UserAccess/UserSummary để các service tích hợp sớm.
6. Admin role/status/audit; thu hồi session khi khóa account/đổi role; cập nhật test và tài liệu.

Mỗi mục có thể tách thành một PR. Thống nhất policy còn mở với owner Gateway/consumer trước task phụ thuộc; không tự đánh dấu ADR đã được duyệt.

## Quy tắc và bàn giao tích hợp

Public register chỉ nhận role bỏ trống hoặc STUDENT; ADMIN/INSTRUCTOR bị từ chối. Instructor do Admin cấp quyền. userId, role quản trị, actor/time audit lấy từ identity context/server. Không trả passwordHash hoặc token session trong profile/summary.

Refresh token rotate mỗi lần dùng; reuse thu hồi family. Logout token đã thu hồi vẫn 204. Không cho tự khóa/hạ quyền Admin cuối cùng còn hoạt động. Chi tiết TTL, hash và lỗi theo baseline; service phải thực thi runtime chứ không chỉ khai báo TypeScript.

Provider cho Gateway và cả nhóm: user JWT, public key/JWKS, internal summary/access và mã lỗi chuẩn. Service JWT nội bộ là credential riêng; triển khai issuer/audience/scope và key provisioning cùng người tích hợp. Identity chưa cần RabbitMQ business event trong catalog hiện tại.

## Chạy local và cấu hình

Chạy từ root repo, cài dependency một lần bằng `npm.cmd ci`, sau đó:

```powershell
npm.cmd run build -w @lms/contracts
$env:NODE_ENV='development'
$env:PORT='3001'
npm.cmd run start:dev -w @lms/identity-service
```

Terminal khác: `Invoke-RestMethod http://127.0.0.1:3001/`. Đây chỉ là smoke check scaffold.

[Env example](.env.example) hiện có NODE_ENV, PORT, MOCK_AUTH, DATABASE_URL, JWT_ISSUER, JWT_PUBLIC_KEY và JWT_PRIVATE_KEY. Chỉ PORT đang được đọc; phải triển khai config loader trước khi dùng `.env`. Thêm config refresh TTL/service credentials khi triển khai, cập nhật env example bằng placeholder, không commit secret. Mock auth chỉ dùng dev/test theo [hướng dẫn package](../../packages/auth/README.md), chưa tự nối vào service.

## Kiểm tra và nghiệm thu task

```powershell
npm.cmd run build -w @lms/identity-service
npm.cmd run lint -w @lms/identity-service
npm.cmd run test -w @lms/identity-service -- --runInBand
npm.cmd run test:e2e -w @lms/identity-service -- --runInBand
```

Tests cần có theo phần triển khai: email trùng; password/role sai; login INACTIVE; JWT sai signature/issuer/expiry; profile không lộ hash; refresh reuse/rotation/logout lặp; non-Admin đổi role bị chặn; audit dùng actor server. Internal access từ chối user JWT thay service credential. Các tests scaffold hiện tại chưa kiểm tra các điều này.

PR kèm migration, env example, API lỗi 4xx, test results và cách Gateway lấy key/status. Chỉ tạo seed/mock records sau khi nhóm review contracts; dùng [IDs chung](../../packages/contracts/fixtures/ids.json), seed idempotent và từ chối production.
