# API Gateway — Hướng dẫn nhận việc tích hợp

Owner theo phân công hiện có: Mạnh. Workspace `@lms/api-gateway`, port mặc định 3000. Tạo branch task từ main theo [README gốc](../../README.md), đọc [AGENTS.md](AGENTS.md) trước khi sửa.

## Trạng thái và phạm vi

Hiện chỉ có scaffold `GET /` → `Hello World!`. Chưa có proxy, JWT verification, timeout middleware, request ID hoặc runtime Swagger. Gateway là HTTP entrypoint: routing, xác thực ban đầu, correlation/error envelope, giới hạn request và bảo vệ public boundary. Không truy cập database nghiệp vụ hoặc chấm quiz/tính progress.

## Contracts và nguồn routing

Đọc [baseline](../../packages/contracts/README.md), [endpoint catalog](../../packages/contracts/src/endpoints.ts), [OpenAPI tổng](../../packages/contracts/openapi.json), [JWT claims](../../packages/contracts/src/http/auth.ts) và [bảng lỗi](../../packages/contracts/src/errors.ts). Catalog ghi service sở hữu từng operation; không route chỉ bằng một prefix thô.

| Loại route                                                                          | Service đích |
| ----------------------------------------------------------------------------------- | ------------ |
| auth/users/admin users                                                              | Identity     |
| courses/chapters/lessons/learning-items/enrollments/discussions/admin course review | Course       |
| quizzes/questions/attempts và course assessment summaries                           | Quiz         |
| learning và certificate verification                                                | Learning     |

Đặc biệt `/api/v1/courses/{id}/assessments` thuộc Quiz, không thuộc Course. Route `/api/v1/internal/...` không public qua Gateway. Đăng ký static paths như `/attempts/me` trước dynamic `/attempts/{id}` hoặc dùng router tránh collision.

## Mục tiêu và cách thực hiện

Cung cấp một cổng HTTP để frontend gọi đúng service, xác thực ban đầu và nhận lỗi thống nhất. Thực hiện năm giai đoạn dưới đây; kiểm thử từng bước trước khi mở rộng. Gateway không cần DB nghiệp vụ, migrations hoặc RabbitMQ consumer trong phạm vi hiện tại.

### Giai đoạn 1 — Cấu hình và nền tảng HTTP

**Mục tiêu:** Gateway khởi động đúng cấu hình và có thể truy vết request/lỗi.

**Công việc cụ thể:**

1. Đọc/validate PORT, upstream URLs và config cần thiết; triển khai process health.
2. Gán/kiểm tra request ID, chuẩn hóa error envelope và logging không chứa secret.
3. Ghi rõ kiểm tra nào chỉ phản ánh process và kiểm tra nào liên quan upstream.

**Giải thích thuật ngữ:** Upstream là service nhận request Gateway chuyển tiếp; request ID giúp đối chiếu cùng yêu cầu trong logs; envelope là cấu trúc response/error thống nhất; health check kiểm tra hoạt động.

**Kết quả cần đạt:** Gateway có config validation và lỗi có request ID; không báo mọi dependency tốt chỉ vì process còn chạy.

**Cách kiểm thử:** Config thiếu/sai URL, request ID thiếu/quá dài và lỗi chưa xử lý. Kiểm tra logs không chứa password/Bearer token và health phản ánh đúng phạm vi đã công bố.

### Giai đoạn 2 — Xác thực và bảo vệ public boundary

**Mục tiêu:** Request đúng loại credentials được đi qua; danh tính giả và API nội bộ bị chặn từ ngoài.

**Công việc cụ thể:**

1. Cùng Identity triển khai JWT verification: key/JWKS, RS256, issuer, expiry và shape claims.
2. Phân loại public/authenticated routes theo catalog, loại bỏ header user/role do client tự khai báo.
3. Không public internal paths; user JWT và service credential không thay thế nhau; không fallback mock auth khi JWT sai.

**Giải thích thuật ngữ:** Authentication xác định danh tính; authorization kiểm tra quyền; claims là thông tin trong JWT; public boundary là ranh giới nhận request từ bên ngoài; JWKS là tập public keys dùng xác minh chữ ký.

**Kết quả cần đạt:** Public login được gọi, route bảo vệ yêu cầu JWT hợp lệ; service đích vẫn tự kiểm tra ownership và quyền nghiệp vụ.

**Cách kiểm thử:** JWT hết hạn/sai signature/issuer/algorithm, thiếu token, user/role header giả, service token dùng ở public route và truy cập internal paths. Dùng verifier test nếu Identity chưa xong và ghi rõ giới hạn đó.

### Giai đoạn 3 — Chuyển tiếp đến đúng service

**Mục tiêu:** Frontend gọi đúng API mà không bị đổi request/response ngoài contracts.

**Công việc cụ thể:**

1. Route theo operation catalog thay vì chỉ đoán từ prefix; xử lý static/dynamic paths không va chạm.
2. Forward method/path/query/body, giữ `/api/v1`, Bearer token gốc, Idempotency-Key và request ID hợp lệ.
3. Giữ status/body upstream, bao gồm 201/204/data:null; không bọc envelope hai lần.

**Giải thích thuật ngữ:** Proxy/forward là chuyển tiếp yêu cầu; static path có tên cố định, dynamic path có tham số; idempotency key nhận biết yêu cầu lặp để service tránh tạo tác động hai lần.

**Kết quả cần đạt:** Mỗi public operation đến đúng service; course assessment summaries đến Quiz, không nhầm Course.

**Cách kiểm thử:** Dùng upstream giả ghi lại request để so method/path/query/body/headers. Thử `/attempts/me` và `/attempts/{id}`, route assessments, 204 không body, data:null và error envelope; sau đó kiểm tra các provider thật đã sẵn sàng.

### Giai đoạn 4 — Timeout, giới hạn và xử lý lỗi

**Mục tiêu:** Gateway xử lý được upstream chậm/lỗi và không tạo mutation trùng khi retry.

**Công việc cụ thể:**

1. Ánh xạ dependency unavailable thành 503, timeout thành 504; giữ các mã lỗi nghiệp vụ 4xx.
2. Cấu hình request/body limits, CORS, rate limit và log redaction theo môi trường.
3. Không retry mutation thiếu idempotency; khi được retry phải giữ nguyên key/body và timeout budget.

**Giải thích thuật ngữ:** Timeout budget là tổng thời gian chờ cho phép; CORS quy định nguồn frontend được trình duyệt cho gọi; rate limit giới hạn tần suất; redaction che thông tin nhạy cảm trong logs.

**Kết quả cần đạt:** Upstream lỗi không làm lộ stack/secrets hoặc biến thành 500 cho mọi trường hợp; request lặp không tự tạo thêm attempt/certificate.

**Cách kiểm thử:** Upstream dừng/chậm, body quá giới hạn, origin không được phép, vượt rate limit và retry submit/start/certificate. Kiểm tra giữ code/message công khai đúng contract và không log credentials.

### Giai đoạn 5 — Tích hợp luồng nghiệp vụ và bàn giao

**Mục tiêu:** Chứng minh frontend đi qua Gateway tới các service thật cho luồng chính.

**Công việc cụ thể:**

1. Tích hợp register/login, course review/enroll, quiz start/save/submit và Learning progress/receipt.
2. Tách result GRADED với progress sync; không chặn trả điểm khi Learning còn pending.
3. Ghi cấu hình chạy nhiều service, các route đã kiểm thử, dependency còn giả và lỗi còn thiếu xử lý.

**Giải thích thuật ngữ:** E2E là kiểm thử từ đầu đến cuối qua các thành phần của luồng; eventual consistency nghĩa là dữ liệu liên service có thể cần thời gian để đồng bộ; receipt là trạng thái Learning đã xử lý event.

**Kết quả cần đạt:** Có E2E thật cho phạm vi đã bàn giao, không gọi test hello/mock upstream là toàn hệ thống đã hoàn thành.

**Cách kiểm thử:** Chạy luồng với Identity/Course/Quiz/Learning thật, thử sai role/owner, submit trùng và dừng Learning/broker. Kết quả Quiz vẫn đọc được; sync API trả pending hoặc trạng thái bền vững đúng dữ liệu sau recovery.

## Quy tắc triển khai

JWT sai không được fallback mock auth. Loại bỏ header user/role do client tự gửi; mỗi service vẫn xác minh JWT và ownership, không giao toàn bộ authorization cho Gateway. Service JWT riêng không được dùng làm user credential public.

Forward nguyên success status/body, kể cả 201/204 và data:null; không bọc envelope hai lần. Giữ lỗi nghiệp vụ 400/401/403/404/409/422, dependency unavailable 503 và timeout 504; không đổi mọi lỗi thành 500. Error message/log không được lộ token, password, connection string hoặc stack upstream.

Không retry start/submit/certificate mà thiếu Idempotency-Key; nếu retry phải giữ nguyên key/body. Luồng result và progress sync là hai API: GRADED không đồng nghĩa SYNCED. Không chặn trả kết quả chấm chỉ vì Learning chưa xử lý event.

Gateway không consume RabbitMQ trong baseline, không join DB, không gộp quyền instructor vào quyền xem kết quả attempt riêng của Student. Chỉ expose public operations, không expose toàn bộ internal OpenAPI bằng proxy catch-all.

## Chạy local và cấu hình

Từ root sau `npm.cmd ci`:

```powershell
npm.cmd run build -w @lms/contracts
$env:NODE_ENV='development'
$env:PORT='3000'
npm.cmd run start:dev -w @lms/api-gateway
```

Terminal khác: `Invoke-RestMethod http://127.0.0.1:3000/` chỉ kiểm tra hello scaffold; chưa chứng minh request đã được route đến service.

[Env example](.env.example) có NODE_ENV, PORT, MOCK_AUTH, JWT_PUBLIC_KEY/JWT_ISSUER, IDENTITY_URL/COURSE_URL/QUIZ_URL/LEARNING_URL. Chỉ PORT đang được đọc. Triển khai config loader/validation trước integration; thêm config CORS/timeout/limits hoặc service credentials khi có task và cập nhật env example. Không commit key hoặc bật mock auth production; xem [package auth](../../packages/auth/README.md).

## Kiểm tra và bàn giao

```powershell
npm.cmd run build -w @lms/api-gateway
npm.cmd run lint -w @lms/api-gateway
npm.cmd run test -w @lms/api-gateway -- --runInBand
npm.cmd run test:e2e -w @lms/api-gateway -- --runInBand
```

Acceptance tests: public login đi qua đúng route; JWT invalid/expired bị chặn; spoofed identity headers không được tin; internal paths không public; static/dynamic route collision; preserve 201/204/data:null/error envelope; upstream unavailable/timeout; Idempotency-Key và request ID giữ nguyên; course assessment route đến Quiz; log không chứa secret.

PR ghi route nào đã tích hợp thật, upstream nào còn fake, cấu hình chạy các tiến trình và kết quả E2E. Không coi tests hello hoặc mock upstream là bằng chứng toàn bộ hệ thống đã hoạt động.
