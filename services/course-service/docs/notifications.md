# Course phát thông báo qua sự kiện

Ghi danh thành công cũng phát course.enrollment.created.v2 qua outbox hiện có.
Notification bind queue riêng vào routing key này để gửi học viên, chống trùng theo
enrollmentId. Metadata courseTitle tùy chọn nằm ngoài payload enrollment, không đổi
snapshot mà Learning sử dụng. Request ghi danh trùng bị chặn trước khi tạo sự kiện.

Inbox/API/socket đã được tách sang [Notification service](../../notification-service/README.md),
không còn trong Course. Patch notice khóa học hiện có vẫn là chức năng riêng.

Khi Admin duyệt hoặc từ chối course/revision, Course lưu CourseReviewNotificationEvent
vào course_event_outbox trong cùng transaction với quyết định duyệt. Nếu transaction
rollback thì sự kiện không được phát. Notification nhận qua RabbitMQ, ghi inbox rồi
đẩy Socket.IO tới Instructor sở hữu khóa học.

- Exchange: lms.events (topic, durable).
- Routing key: course.review.decided.v1.
- Queue: notification.course-review.v1; hai service phải dùng cùng virtual host.
- Publisher xác nhận broker trước khi đánh dấu sentAt; khi mất kết nối sẽ thử lại.
- Queue/binding được khai báo trước khi publish để giữ sự kiện ngay cả khi Notification
  chưa khởi động lần đầu. Broker không hoạt động không làm mất quyết định duyệt:
  sự kiện còn pending trong outbox.

Course không đọc/ghi schema notification và không còn migration course_notifications.
Migration module thông báo cũ chưa từng chạy; không cần xóa bảng trên DB hiện tại.
Nếu đã tự triển khai bản cũ ở môi trường khác, cần migrate inbox riêng trước khi bỏ nó.

Xem [contract notification](../../../packages/contracts/docs/notifications.md).
Frontend dùng HTTP và Socket.IO ở port 3005; chưa có Gateway proxy.
Chưa có thông báo gửi Admin khi nộp duyệt, email hoặc sự kiện Learning/Identity.
