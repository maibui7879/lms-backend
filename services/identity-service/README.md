# Identity Service (`@lms/identity-service`)

Microservice quản lý định danh, xác thực (RS256 JWT + Email OTP), quản lý vòng đời phiên đăng nhập (Refresh Token Rotation) và phân quyền (RBAC) cho hệ thống LMS.

* **Workspace:** `@lms/identity-service`
* **Port mặc định:** `3001`
* **Swagger UI:** `http://localhost:3001/docs`
* **Health Check:** `http://localhost:3001/health`

---

## 1. Luồng phân quyền & nâng cấp vai trò (RBAC Workflow)

Hệ thống áp dụng cơ chế kiểm soát vai trò chặt chẽ theo 3 cấp (`STUDENT`, `INSTRUCTOR`, `ADMIN`):

1. **Đăng ký mặc định (`STUDENT`):**
   * Mọi người dùng đăng ký công khai qua `POST /api/v1/auth/register` đều được tạo với vai trò mặc định là **`STUDENT`** và trạng thái `INACTIVE`.
   * Không cho phép tự chọn `INSTRUCTOR` hoặc `ADMIN` khi đăng ký.
   * Người dùng xác thực mã **OTP 6 chữ số** gửi qua email (`POST /api/v1/auth/verify-email`) để kích hoạt tài khoản sang `ACTIVE`.
2. **Yêu cầu nâng cấp lên Giảng viên (`STUDENT` → `INSTRUCTOR`):**
   * Người dùng có vai trò `STUDENT` gửi đơn xin nâng cấp lên giảng viên kèm thông tin chứng minh/mô tả chuyên môn qua `POST /api/v1/users/role-requests`.
   * Người dùng có thể theo dõi trạng thái các yêu cầu của mình qua `GET /api/v1/users/role-requests/me`.
3. **Phê duyệt bởi Quản trị viên (`ADMIN`):**
   * Tài khoản `ADMIN` gốc được khởi tạo qua CLI seed script (`npm run seed:admin`).
   * `ADMIN` xem danh sách yêu cầu đang chờ qua `GET /api/v1/users/role-requests` và phê duyệt/từ chối qua `PATCH /api/v1/users/role-requests/:requestId/review`.
   * Chỉ sau khi `ADMIN` duyệt (`APPROVED`), tài khoản mới chính thức được nâng cấp lên vai trò **`INSTRUCTOR`**.

---

## 2. Danh sách API đã triển khai

### Auth (`/api/v1/auth`)
| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Đăng ký tài khoản `STUDENT` và gửi OTP xác thực qua email |
| `POST` | `/api/v1/auth/verify-email` | Public | Xác thực OTP 6 chữ số và kích hoạt tài khoản |
| `POST` | `/api/v1/auth/resend-otp` | Public | Gửi lại mã OTP mới (vô hiệu hóa mã cũ) |
| `POST` | `/api/v1/auth/login` | Public | Đăng nhập, cấp cặp `accessToken` (RS256) + `refreshToken` |
| `POST` | `/api/v1/auth/refresh` | Public | Xoay vòng `refreshToken` (Rotation + Reuse Detection) |
| `POST` | `/api/v1/auth/logout` | Public | Thu hồi `refreshToken` hiện tại |
| `POST` | `/api/v1/auth/logout-all` | Bearer | Thu hồi toàn bộ phiên đăng nhập trên mọi thiết bị |
| `GET` | `/api/v1/auth/public-key` | Public | Cung cấp RS256 Public Key cho Gateway và các microservices |

### Users & Role Requests (`/api/v1/users`)
| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users/me` | Bearer | Lấy thông tin hồ sơ người dùng hiện tại |
| `PATCH` | `/api/v1/users/me` | Bearer | Cập nhật `displayName`, `bio`, `avatarUrl` |
| `PATCH` | `/api/v1/users/me/password` | Bearer | Đổi mật khẩu (xác thực mật khẩu cũ bằng Argon2) |
| `POST` | `/api/v1/users/role-requests` | `STUDENT` | Gửi yêu cầu nâng cấp từ `STUDENT` lên `INSTRUCTOR` |
| `GET` | `/api/v1/users/role-requests/me` | Bearer | Xem lịch sử yêu cầu nâng cấp vai trò của bản thân |
| `GET` | `/api/v1/users/role-requests` | `ADMIN` | Danh sách yêu cầu nâng cấp vai trò toàn hệ thống |
| `PATCH` | `/api/v1/users/role-requests/:requestId/review` | `ADMIN` | Duyệt (`APPROVED`) hoặc từ chối (`REJECTED`) lên `INSTRUCTOR` |
| `PATCH` | `/api/v1/users/:id/role` | `ADMIN` | Cập nhật trực tiếp vai trò người dùng |

---

## 3. Hướng dẫn chạy Local & Khởi tạo dữ liệu

Chạy từ thư mục gốc của monorepo (`lms-backend`):

### Bước 1: Cấu hình biến môi trường
Copy file `.env.example` thành `.env` bên trong `services/identity-service/` và điền thông tin kết nối PostgreSQL (Supabase), cặp khóa RS256 và SMTP:
```powershell
Copy-Item services\identity-service\.env.example services\identity-service\.env