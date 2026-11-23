# Metadata khóa học và bài học có định dạng

## Triển khai DB

Sau khi build, chạy `npm run migration:run -w @lms/course-service` trên đúng
DATABASE_URL trước khi khởi động phiên bản mới. Migration CourseAuthoring1795132803000
thêm courses.metadata (jsonb), learning_items.bodyFormat và attachments.
Không cần bật DB_SYNC. Dữ liệu cũ mặc định metadata {}, attachments [], PLAIN_TEXT.
Migration down xóa các cột mới và làm mất dữ liệu của chúng; chỉ rollback sau khi sao lưu.

## API

Metadata khóa học được trả phẳng theo contract, không có field metadata trong HTTP.
PATCH bỏ field nghĩa là giữ nguyên; mảng [] xóa danh sách. Bộ lọc category/tag/level/
language kết hợp AND, vẫn giới hạn khóa công khai hoặc khóa thuộc Instructor.
Category/tag khớp chính xác; tag thuộc mảng tags, không liên quan skill mastery.

READING nhận bodyFormat HTML hoặc PLAIN_TEXT (mặc định). HTML lọc theo allowlist,
giữ ảnh HTTP/HTTPS, loại script/iframe/style/event handler và URL nguy hiểm.
description khóa học dùng descriptionFormat tương tự. Frontend phải hiển thị
PLAIN_TEXT như văn bản, không diễn giải thành HTML.

VIDEO nhận attachments gồm fileName, fileUrl, mimeType, sizeBytes.
Hiện đây là liên kết tệp ngoài: server chỉ kiểm tra hình dạng metadata/URL,
không tải tệp về, không xác minh MIME thực tế/quyền sở hữu storage.
Không gửi base64 hoặc multipart vào API JSON hiện có. API upload chưa triển khai.

Learning item lưu attachments và bodyFormat trong từng bản sao revision;
các trường này được so sánh để ghi nhận thay đổi khi xuất bản. Không thay đổi
snapshot cũ hay tự động reset tiến độ khi sửa nội dung nháp.
Metadata khóa học vẫn là thông tin cấp Course, không phải cấu hình cấp chứng chỉ.
