# INS-03 — Dữ liệu mẫu và phản hồi API

Dữ liệu đã dùng để triển khai danh sách theo tiến độ bài và API chi tiết riêng. [Fixture INS-03](ins-03.mock.json) · [Kiểm thử qua HTTP](../instructor-reports.db.e2e-spec.ts)

## Dữ liệu mẫu

Khóa **NestJS căn bản** do `instructorA` phụ trách. Course đã xuất bản bản 2, có 3 bài bắt buộc. An vẫn ghi danh bản 1, có 2 bài bắt buộc. Các giờ trong ví dụ là UTC.

| Học viên | Tài khoản giả lập | Phiên bản ghi danh | Tiến độ theo bài | Hoạt động gần nhất |
| --- | --- | --- | --- | --- |
| An | `studentB` | 1 | Hoàn thành **Giới thiệu module**, 1/2 bài, **50%**. Trạng thái `IN_PROGRESS`. | Lưu vị trí học lúc `2026-01-15T09:12:00Z`. |
| Bình | `studentA` | 2 | 0/3 bài, **0%**. Trạng thái `NOT_STARTED`. | `null`. Bình mới ghi danh. |

## API danh sách học viên

```http
GET /api/v1/learning/courses/33333333-3333-4333-8333-333333333333/learners?page=1&limit=1
X-Mock-User: instructorA
```

Bảng dưới dùng `L = /api/v1/learning/courses/33333333-3333-4333-8333-333333333333/learners`. `X-Mock-User` là header dùng khi kiểm thử local. Các phản hồi thành công có `data` và `meta.requestId` theo contract chung. Phản hồi lỗi dùng `error.code`.

| Trường hợp | Request dự kiến | Kết quả mong đợi |
| --- | --- | --- |
| Giảng viên sở hữu khóa xem danh sách | `GET L?page=1&limit=20`, `instructorA` | `200`. `total: 2`, theo thứ tự Bình rồi An. Bình là `NOT_STARTED`, `0%`, phiên bản 2. An là `IN_PROGRESS`, `50%`, phiên bản 1. |
| Xem trang đầu | `GET L?page=1&limit=1`, `instructorA` | `200`. `page: 1`, `limit: 1`, `total: 2`, `items` chỉ có Bình. |
| Xem trang thứ hai | `GET L?page=2&limit=1`, `instructorA` | `200`. `page: 2`, `limit: 1`, `total: 2`, `items` chỉ có An. |
| Trang vượt kết quả | `GET L?page=3&limit=1`, `instructorA` | `200`. `items: []`, `page: 3`, `limit: 1`, `total: 2`. |
| Khóa có thật nhưng chưa có học viên | `GET /api/v1/learning/courses/00000000-0000-4000-8000-000000000951/learners`, `instructorA` | `200`. `items: []`, `page: 1`, `limit: 20`, `total: 0`. |
| Admin mở danh sách | `GET L?page=1&limit=20`, `adminA` | Kỳ vọng `200`, cùng dữ liệu với giảng viên sở hữu khóa theo contract Learning. Khi ghép thật cần chốt quyền này với Course. |
| Giảng viên ngoài khóa | `GET L`, `instructorB` | `403 NOT_COURSE_OWNER`. |
| Học viên gọi API giảng viên | `GET L`, `studentB` | `403 FORBIDDEN`. |
| Thiếu xác thực | `GET L`, bỏ `X-Mock-User` | `401 UNAUTHORIZED`. |
| Phân trang sai | `GET L?page=0` hoặc `GET L?limit=101`, `instructorA` | `400 VALIDATION_ERROR`. |
| Khóa không tồn tại | `GET /api/v1/learning/courses/00000000-0000-4000-8000-000000000952/learners`, `instructorA` | `404 NOT_FOUND`. |
| Course trả sai phiên bản ghi danh | `GET L?page=2&limit=1`, `instructorA`. Giả lập Course trả cấu trúc bản 2 khi Learning hỏi bản 1 | `409 CONTENT_VERSION_MISMATCH`. |

Một item đầy đủ của An trong `data.items` theo `LearnerProgressSummary`.

```json
{
  "userId": "00000000-0000-4000-8000-000000000002",
  "progress": {
    "courseId": "33333333-3333-4333-8333-333333333333",
    "contentVersion": 1,
    "status": "IN_PROGRESS",
    "completedRequiredItems": 1,
    "totalRequiredItems": 2,
    "progressPercent": 50,
    "completedRequiredLessons": 1,
    "totalRequiredLessons": 2,
    "lessonProgressPercent": 50,
    "passedRequiredAssessments": 0,
    "totalRequiredAssessments": 1,
    "completedAt": null,
    "updatedAt": "2026-01-15T09:05:00Z"
  }
}
```

`progressPercent` tính theo item, `lessonProgressPercent` tính theo bài đã xác nhận hoàn thành. Màn hình danh sách dùng `lessonProgressPercent` và hai trường số bài bắt buộc.

## API chi tiết học viên

`GET L/{userId}` trả `data` gồm `userId`, `progress` giống item danh sách, thêm `completedLessons` và `lastActivityAt`. `lastActivityAt` lấy thời điểm gần nhất trong dữ liệu hoàn thành bài hoặc item, kết quả quiz và vị trí học tiếp.

| Trường hợp | Request dự kiến | Kết quả mong đợi |
| --- | --- | --- |
| Giảng viên chọn An | `GET L/00000000-0000-4000-8000-000000000002`, `instructorA` | `200`. `completedLessons` có bài **Giới thiệu module**, ID `00000000-0000-4000-8000-000000000211`, hoàn thành `2026-01-15T09:05:00Z`. `lastActivityAt: "2026-01-15T09:12:00Z"`. |
| Giảng viên chọn Bình | `GET L/11111111-1111-4111-8111-111111111111`, `instructorA` | `200`. `completedLessons: []`, `lastActivityAt: null`. |
| Giảng viên chọn An sau khi bài bắt buộc bị yêu cầu học lại | `GET L/00000000-0000-4000-8000-000000000002`, `instructorA`, với biến thể `recompletionScenario` | `200`. `progress.status: "OUTDATED"`, 0/2 bài hợp lệ, `completedLessons: []`. `lastActivityAt` vẫn là `2026-01-15T09:12:00Z` vì việc sửa bài là thao tác của Course. |
| Chọn người chưa ghi danh trong khóa | `GET L/00000000-0000-4000-8000-000000000953`, `instructorA` | `404 NOT_FOUND`. |
| Giảng viên ngoài khóa chọn An | `GET L/00000000-0000-4000-8000-000000000002`, `instructorB` | `403 NOT_COURSE_OWNER`. |

[Cách hoạt động của INS-03](../../../../WORK.md#ins-03--tiến-độ-từng-học-viên)
