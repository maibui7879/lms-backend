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

## Thứ tự nhận task

1. Config validation, upstream URLs, process health và request ID/error envelope.
2. JWT verification cùng Identity: public key/JWKS, RS256/issuer/expiry/claim shape; tách public endpoints khỏi authenticated routes bằng catalog.
3. Forward method/path/query/body đến đúng service, giữ nguyên `/api/v1` prefix; chuyển Bearer token gốc, Idempotency-Key và request ID hợp lệ.
4. Timeout/error mapping, request/body limits, CORS/rate limit/log redaction theo môi trường; không retry mutation tùy tiện.
5. Tích hợp các lát cắt auth → review/enroll → quiz submit → Learning receipt/progress; ghi rõ provider còn fake hay thật.

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
