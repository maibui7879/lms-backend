# Mở rộng hồ sơ Identity

UserProfile bổ sung emailVerified, firstName/lastName, phoneNumber, dateOfBirth,
gender (MALE/FEMALE/OTHER), githubUrl/linkedinUrl, updatedAt và security
(activeSessionsCount, passwordChangedAt). Trường cá nhân chưa có dữ liệu trả null.
UpdateProfileRequest nhận các field cá nhân mới và vẫn bắt buộc expectedVersion.
Không cho người dùng tự sửa role/status/security. Không truyền field nghĩa là giữ nguyên.

- GET/PATCH /api/v1/users/me/profile là alias của GET/PATCH /api/v1/users/me.
- DELETE /api/v1/users/me/profile xóa các field tùy chọn (không xóa họ/tên,
  email hay tài khoản), trả profile mới HTTP 200; hiện không kiểm tra expectedVersion.
- DELETE /api/v1/users/me vô hiệu hóa tài khoản, thu hồi refresh token, ghi audit
  và trả 204 không có body; không cho vô hiệu hóa admin ACTIVE cuối cùng.
- POST /api/v1/users/me/password nhận currentPassword/newPassword, trả 204.
  Mật khẩu mới tối thiểu 12 ký tự, tối đa 128; mật khẩu hiện tại tối thiểu 8 ký tự.

Các response JSON thành công dùng envelope data/meta. HTTP 204 không có envelope.
Các endpoint alias/xóa profile là phần mở rộng, không thay thế API hiện có.
JSON schema không thay thế validation nghiệp vụ tại Identity.

Lưu ý triển khai: nhánh Identity mới thêm cột entity nhưng chưa có migration
cho profile; cần migration DB trước khi chạy trên schema chưa có các cột đó.
Thay đổi này không sửa lỗi refresh-token reuse rollback đã được ghi nhận.
