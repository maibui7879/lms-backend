# API Gateway

Cổng HTTP cho frontend, mặc định port 3000. Không chứa luật nghiệp vụ và không truy cập DB.

## Đã triển khai

- Định tuyến theo [endpoint catalog](../../packages/contracts/src/endpoints.ts), bổ sung route OTP, OAuth và yêu cầu cấp role hiện có của Identity.
- Course assessments đi đến Quiz. Chặn `/api/v1/internal/...`; method hoặc đường dẫn ngoài danh sách trả 404.
- Kiểm tra JWT RS256, issuer `identity-service`, thời gian và cấu trúc claims ở route cần đăng nhập. Không mock auth. Service đích vẫn kiểm tra role, trạng thái tài khoản và quyền sở hữu.
- Giữ nguyên method, query, body, Authorization, Idempotency-Key, status và response upstream, bao gồm PDF và 204. Không bọc envelope hai lần.
- Xóa header giả danh user/role và header nội bộ do client gửi; tạo hoặc chuyển tiếp X-Request-Id hợp lệ.
- Lỗi kết nối trả 503; timeout trước khi gửi response trả 504. Giữ nguyên lỗi nghiệp vụ 4xx. Nếu stream đã bắt đầu mà lỗi thì đóng stream, không thể đổi status nữa.
- Chỉ retry GET/HEAD không body khi lỗi mạng hoặc upstream 5xx; không retry timeout, Socket.IO hay thao tác ghi. `PROXY_RETRIES` là số lần thử thêm, tối đa 2; timeout áp dụng mỗi lần thử.
- CORS theo danh sách origin; `GET /health` chỉ phản ánh process Gateway, không kiểm tra các dependency.
- Swagger tổng `/docs`, JSON `/docs-json`, đã loại API internal.

## Chạy local

Tạo `.env` tại thư mục Gateway theo [env mẫu](.env.example). Chép public key của Identity vào `JWT_PUBLIC_KEY`, không cần private key hoặc database URL. PEM có thể dùng xuống dòng escape `\n`.

```powershell
npm.cmd run build -w @lms/contracts
npm.cmd run build -w @lms/api-gateway
npm.cmd run start -w @lms/api-gateway
```

Frontend gọi `http://localhost:3000/api/v1/...`. URL service lấy từ env; development mặc định localhost 3001–3005. Production phải khai báo URL các upstream được dùng. OAuth callback URI tại nhà cung cấp và cấu hình Identity cần thống nhất với URL Gateway nếu callback cũng đi qua Gateway.

## Socket.IO thông báo

Gateway chuyển tiếp `/socket.io/` tới Notification, gồm HTTP polling và WebSocket upgrade. Namespace vẫn là `/notifications`.

```typescript
const socket = io('http://localhost:3000/notifications', {
  auth: { accessToken }, // JWT thuần, không thêm Bearer
});
```

Notification kiểm tra JWT trong handshake; Gateway không đọc packet auth của Socket.IO. Origin phải được cho phép ở cả Gateway và Notification. Polling có timeout riêng 65 giây.

## Kiểm thử và giới hạn

```powershell
npm.cmd run build -w @lms/api-gateway
npm.cmd run lint -w @lms/api-gateway
npm.cmd test -w @lms/api-gateway -- --runInBand
npm.cmd run test:e2e -w @lms/api-gateway -- --runInBand
```

E2E sử dụng upstream HTTP và Socket.IO chạy thật trong test nhưng dữ liệu/luật nghiệp vụ là fixture. Đây chưa phải kiểm thử toàn hệ thống với DB và Identity thật. Cần kiểm thử đăng nhập, RBAC, enroll và nhận notification với provider thật trước khi chốt tích hợp.

Chưa triển khai rate limit, giới hạn dung lượng request và circuit breaker. Production cần bổ sung các chính sách này, HTTPS và chỉ public port Gateway; không expose service nội bộ ra Internet.

## Source layout

- `src/bootstrap/`: application composition and public Swagger setup.
- `src/modules/proxy/`: proxy providers and Nest module. The coordinator resolves routes and authorizes requests; HTTP and WebSocket services own transport.
- `src/common/http/`: header filtering and gateway error envelopes.
- `src/common/auth/`: JWT verification and its unit tests.
- `src/config/`: upstream, timeout, retry, origin and environment configuration.
- `src/routing/`: contract route matching and its unit tests.

Environment paths resolve from both source and compiled configuration to the gateway and repository roots. Swagger loads the repository contract from both source and compiled bootstrap directories.
