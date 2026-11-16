# Hướng dẫn Learning: migration nội dung course

Tài liệu này hướng dẫn người phát triển `learning-service` cập nhật service để xử lý khi một course đã public được sửa qua `CourseRevision`.

## Mục tiêu nghiệp vụ

Course public không được sửa trực tiếp. Instructor tạo revision mới, submit để Admin review, sau đó revision được publish thành `contentVersion` mới.

- Learner cũ tiếp tục dùng `contentVersion` đã được pin trong enrollment.
- Learner mới nhận content version mới.
- Revision `NORMAL` không tự migrate learner cũ.
- Revision `CRITICAL` có thể yêu cầu learner học lại đúng các learning item bị ảnh hưởng.
- Không xóa completion, attempt hoặc lịch sử quiz cũ.

## Contract cần đồng bộ

Sau khi cập nhật branch, chạy build `@lms/contracts` để nhận các kiểu trong [learning.ts](../src/http/learning.ts) và [course.ts](../src/http/course.ts):

- `LearningStatus`: thêm `OUTDATED` và `RESET`.
- `ItemProgressData`: thêm `invalidatedAt` và `invalidationReason`.
- `MigrateCourseItemsRequest`.
- `CourseRevisionData.updateType`.
- `CourseRevisionData.migrationPolicy`.

Endpoint Learning cần triển khai:

```text
POST /api/v1/internal/courses/{id}/migrations
```

Đây là endpoint internal, chỉ nhận internal service credential; không expose qua API Gateway cho learner hoặc frontend.

## Request migration

Ví dụ:

```json
{
  "revisionId": "revision-uuid",
  "itemIds": [
    "learning-item-uuid-1",
    "learning-item-uuid-2"
  ],
  "reason": "Lesson chứa thông tin sai cần học viên xem lại",
  "policy": "REQUIRE_RECOMPLETION"
}
```

`policy` có hai giá trị:

- `REQUIRE_RECOMPLETION`: completion của item bị ảnh hưởng không còn được tính cho progress/chapter/course; learner phải hoàn thành lại.
- `NOTIFY_ONLY`: giữ completion hiện tại, chỉ ghi nhận lý do để hiển thị thông báo.

Request phải kiểm tra:

1. `courseId` trong URL khớp với các item được migrate.
2. `revisionId` thuộc course đó.
3. `itemIds` không trùng.
4. Item tồn tại trong revision và thuộc đúng course.
5. Migration là idempotent; gửi lại cùng revision/item/policy không tạo thêm completion record.

## Thay đổi dữ liệu

Bảng completion hiện đang dùng sự tồn tại của record để biểu diễn hoàn thành. Cần bổ sung trạng thái rõ ràng:

```text
status              NOT_STARTED | IN_PROGRESS | COMPLETED | OUTDATED | RESET
invalidatedAt       timestamptz nullable
invalidationReason  text nullable
```

Dữ liệu cũ phải được migrate như sau:

```text
completion record cũ → status = COMPLETED
invalidatedAt = null
invalidationReason = null
```

Không tạo một completion record mới cho mỗi lần migration. Giữ khóa nghiệp vụ hiện tại theo `enrollmentId + contentVersion + learningItemId` và cập nhật trạng thái trong transaction.

## Quy tắc tính progress

Chỉ `COMPLETED` mới được tính là đã hoàn thành:

- `OUTDATED` không được tính vào `completedRequiredItems`.
- `RESET` không được tính vào `completedRequiredItems`.
- Chapter không được chuyển sang `COMPLETED` nếu required item đang `OUTDATED` hoặc `RESET`.
- Course không được chuyển sang `COMPLETED` nếu còn required item bị invalidated.
- Item không nằm trong `itemIds` vẫn giữ nguyên tiến độ.

Khi learner hoàn thành lại item hợp lệ:

```text
OUTDATED/RESET → COMPLETED
invalidatedAt = null
invalidationReason = null
completedAt = thời điểm hoàn thành mới
```

`contentVersion` của enrollment không tự đổi khi migration item. Migration chỉ thay đổi bằng chứng hoàn thành của item bị ảnh hưởng.

## Quiz và assessment

Learning không chấm lại quiz. Quiz vẫn là service sở hữu attempt và kết quả.

- Quiz thay đổi nội dung phải có `assessmentVersion` mới.
- Attempt cũ giữ nguyên để audit.
- Kết quả cũ không tự biến mất.
- Nếu quiz là required assessment và bị đánh dấu cần học lại, Learning chỉ sử dụng kết quả đạt của `assessmentVersion` mới.

## Response mẫu

```json
{
  "learningItemId": "learning-item-uuid-1",
  "contentVersion": 3,
  "status": "OUTDATED",
  "completedAt": "2026-11-13T10:00:00.000Z",
  "invalidatedAt": "2026-11-14T08:00:00.000Z",
  "invalidationReason": "Lesson chứa thông tin sai cần học lại"
}
```

## Test bắt buộc

- Migration một item sang `OUTDATED`.
- Migration nhiều item trong cùng transaction.
- `NOTIFY_ONLY` không làm mất trạng thái `COMPLETED`.
- Item bị `OUTDATED` hoàn thành lại thành `COMPLETED`.
- Item không bị ảnh hưởng vẫn giữ nguyên progress.
- Chapter bị khóa nếu required item đã bị invalidated.
- Course không hoàn thành khi còn required item ở `OUTDATED` hoặc `RESET`.
- Sai `courseId`, `revisionId` hoặc `itemId` bị từ chối.
- Gửi lại cùng migration không tạo dữ liệu trùng.
- Internal request không có credential hợp lệ bị từ chối.

## Thứ tự triển khai

1. Đồng bộ branch với `main` và build contracts.
2. Tạo database migration cho status và invalidation fields.
3. Cập nhật entity, repository và mapper `ItemProgressData`.
4. Cập nhật logic tính progress/chapter access.
5. Thêm internal migration controller/service.
6. Thêm test unit, integration và E2E.
7. Chạy build, lint và toàn bộ test Learning.
8. Chỉ bật Course gọi migration endpoint sau khi Learning đã deploy endpoint tương ứng.

Các API progress hiện có và phạm vi đã hoàn thành được ghi trong [services/learning-service/README.md](../../../services/learning-service/README.md).
