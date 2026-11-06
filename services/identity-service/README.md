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

## Mục tiêu và cách thực hiện

Xây dựng backend quản lý tài khoản, đăng nhập, phiên truy cập và phân quyền. Thực hiện sáu giai đoạn; mỗi bước phải chạy được và có kiểm thử trước khi chuyển bước. Policy chưa chốt cần review với Gateway/consumer, không tự coi ADR đã được duyệt.

### Giai đoạn 1 — Chuẩn bị hệ thống và cơ sở dữ liệu

**Mục tiêu:** Có nơi lưu tài khoản/phiên đăng nhập và cách vận hành service an toàn.

**Công việc cụ thể:**

1. Đọc/kiểm tra config, kết nối PostgreSQL, triển khai migrations và API health.
2. Thiết kế bảng user, password hash, refresh session và audit; ràng buộc email không trùng.
3. Chuẩn bị transaction và version cho cập nhật tài khoản; không bật synchronize ở DB dùng chung.

**Giải thích thuật ngữ:** Config là cấu hình; migration là thay đổi cấu trúc bảng; health check kiểm tra service; transaction đảm bảo nhóm thao tác cùng thành công hoặc cùng hủy; audit là lịch sử thao tác quản trị.

**Kết quả cần đạt:** Service khởi động với config hợp lệ, tạo được DB schema và phát hiện lỗi kết nối/cấu hình.

**Cách kiểm thử:** Chạy migrations trên DB test mới, thử thiếu DATABASE_URL, DB ngừng hoạt động và insert hai user cùng email. Health phải phản ánh đúng trạng thái đã định nghĩa.

### Giai đoạn 2 — Đăng ký và kiểm tra thông tin đăng nhập

**Mục tiêu:** Người dùng tạo tài khoản Student và được kiểm tra credentials đúng quy tắc.

**Công việc cụ thể:**

1. Viết register theo RegisterRequest: chuẩn hóa email, kiểm tra password và chỉ cho role STUDENT/bỏ trống.
2. Hash password bằng argon2 trước khi lưu; không trả hash ra response/log.
3. Kiểm tra email/password khi login, từ chối tài khoản INACTIVE và dùng mã lỗi contracts.

**Giải thích thuật ngữ:** Credentials là thông tin đăng nhập; hash là giá trị một chiều để kiểm tra password; normalize email là chuẩn hóa cách lưu để phát hiện trùng. INACTIVE là tài khoản không được phép đăng nhập.

**Kết quả cần đạt:** Đăng ký và kiểm tra credentials hoạt động; HTTP login hoàn chỉnh trả SessionData sau khi ghép phát token và session ở giai đoạn 3–4, không tạo response tạm trái contract.

**Cách kiểm thử:** Register thành công, email trùng/khác hoa thường, password sai định dạng, tự chọn ADMIN/INSTRUCTOR và đăng nhập sai mật khẩu/INACTIVE. Kiểm tra DB không lưu password thô và response không có hash.

### Giai đoạn 3 — Phát và xác minh JWT

**Mục tiêu:** Gateway/services nhận biết người dùng từ token có chữ ký hợp lệ.

**Công việc cụ thể:**

1. Phát user JWT RS256 với JwtClaims và thời hạn theo cấu hình.
2. Kiểm tra signature, issuer, expiry, algorithm và shape claims; không tự thêm claim bắt buộc ngoài contracts.
3. Thống nhất cách phân phối public key/JWKS và rotation với Gateway; giữ private key trong cấu hình bí mật.

**Giải thích thuật ngữ:** JWT là token chứa claims; signature là chữ ký để phát hiện token giả; issuer là bên phát token; expiry là thời điểm hết hạn; JWKS là tập public keys cho bên xác minh; rotation là thay khóa có kế hoạch.

**Kết quả cần đạt:** Có token hợp lệ dùng được trong test Gateway/service và token giả/hết hạn bị từ chối.

**Cách kiểm thử:** Token đúng, sai signature/issuer/algorithm, hết hạn, thiếu claims và key cũ/mới theo kế hoạch rotation. Kiểm tra client tự gửi header role/userId không tạo được danh tính tin cậy.

### Giai đoạn 4 — Quản lý phiên, refresh và đăng xuất

**Mục tiêu:** Hoàn chỉnh login response và khả năng tiếp tục/thu hồi phiên đăng nhập.

**Công việc cụ thể:**

1. Login trả đầy đủ SessionData; chỉ lưu hash refresh token và thông tin session cần quản lý.
2. Refresh hợp lệ tạo token mới và vô hiệu token cũ trong transaction.
3. Phát hiện token cũ bị dùng lại, thu hồi cả family; logout thu hồi idempotent.

**Giải thích thuật ngữ:** Access token dùng gọi API; refresh token xin token mới; token family là chuỗi phiên nối tiếp sau các lần refresh; reuse detection phát hiện refresh token đã dùng bị gửi lại; idempotency tránh tác động phụ khi thao tác lặp.

**Kết quả cần đạt:** Register/login/refresh/logout khép kín theo contracts, không tồn tại hai kết quả refresh cạnh tranh làm bỏ qua thu hồi.

**Cách kiểm thử:** Login rồi refresh; dùng lại token cũ; refresh hết hạn; hai refresh đồng thời; logout hai lần. Xác nhận token thô không được lưu/log và session family bị thu hồi đúng quy tắc.

### Giai đoạn 5 — Profile và API nội bộ cho các service

**Mục tiêu:** Người dùng quản lý profile và các service kiểm tra được user/role/status.

**Công việc cụ thể:**

1. Viết đọc/cập nhật users/me theo version; không cho cập nhật role/status qua profile.
2. Cung cấp internal UserSummary/UserAccessStatus với thông tin tối thiểu.
3. Cùng người tích hợp triển khai service credential, issuer/audience/scope riêng và giới hạn caller.

**Giải thích thuật ngữ:** Profile là hồ sơ người dùng; internal API dành các service gọi nhau; audience chỉ service đích được dùng token; scope giới hạn thao tác; version phát hiện cập nhật cũ.

**Kết quả cần đạt:** User chỉ sửa hồ sơ của mình; Gateway/services đọc được trạng thái mà không nhận password/hash/session token.

**Cách kiểm thử:** Không có user token, cố sửa role qua profile, version cũ và response lộ dữ liệu. Gọi internal API bằng user JWT hoặc service token sai audience/scope phải bị chặn; kiểm tra Gateway xử lý provider unavailable.

### Giai đoạn 6 — Quản trị tài khoản và hoàn thiện bàn giao

**Mục tiêu:** Admin quản lý role/status có lịch sử và không bỏ qua thu hồi phiên.

**Công việc cụ thể:**

1. Viết admin list/status/role/audit có phân trang và authorization.
2. Ghi actor/time/reason từ server; khóa account/đổi role thu hồi refresh sessions.
3. Bảo vệ Admin cuối cùng theo baseline; phối hợp Gateway/service cho status check trên thao tác nhạy cảm.
4. Hoàn thiện migrations, test, cấu hình key/session và tài liệu tích hợp.

**Giải thích thuật ngữ:** RBAC là kiểm tra quyền theo role; revoke là thu hồi quyền dùng phiên; pagination chia danh sách thành trang; acceptance test chứng minh yêu cầu nghiệp vụ đã được đáp ứng.

**Kết quả cần đạt:** Chức năng quản trị đúng quyền, có audit và consumer biết cách xác minh token/trạng thái tài khoản.

**Cách kiểm thử:** Student/Instructor gọi admin API; đổi role/khóa user; actor giả trong body; thu hồi phiên; thao tác đồng thời với Admin cuối cùng. Kiểm tra không lộ dữ liệu trong list/audit và các luồng chính qua Gateway dùng provider thật.

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
