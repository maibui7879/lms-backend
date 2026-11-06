# @lms/auth — mock authentication cho local/test

Guard này không verify JWT, không thay thế RBAC/ownership và không được public ra Internet. Chưa tự động gắn vào service nào.

## Cài vào service

Từ root, ví dụ Course:

```powershell
npm.cmd install -w @lms/course-service @lms/auth@0.1.0
npm.cmd run build -w @lms/contracts
npm.cmd run build -w @lms/auth
$env:NODE_ENV='development'
$env:MOCK_AUTH='true'
npm.cmd run start:dev -w @lms/course-service
```

Khai báo `MockAuthGuard` trong `providers` của module sử dụng, rồi áp dụng cho controller/route:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser, MockAuthGuard } from '@lms/auth';
import type { AuthUser } from '@lms/contracts';

@Controller('demo')
@UseGuards(MockAuthGuard)
export class DemoController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) { return user; }
}
```

Gửi header `x-mock-user: studentA` (hoặc `studentB`, `studentC`, `studentD`, `instructorA`, `instructorB`, `adminA`). Identity lấy từ [fixture IDs](../contracts/fixtures/ids.json); request có `user: AuthUser` với `id`, `email`, `role`, `status`. Không nhận role/userId tự do và không có user mặc định khi thiếu header. Đây là AuthUser, không phải JwtClaims có `sub`.

Nếu `MOCK_AUTH` không đúng chuỗi `true`, hoặc `NODE_ENV` không phải `development`/`test`, guard trả 401. Header không hợp lệ cũng trả 401. Client có thể chọn fixture Admin trong môi trường mock; không dùng cơ chế này trên staging/production. Guard không tự định dạng error envelope chuẩn; việc đó thuộc exception filter của app.

Khi chuyển sang auth thật, thay mock guard bằng JWT guard, giữ `request.user` cùng shape và tiếp tục kiểm tra RBAC/ownership trong service. Không để mock là fallback khi JWT verify lỗi.

## Kiểm tra

```powershell
npm.cmd run typecheck -w @lms/auth
npm.cmd run test -w @lms/auth
```
