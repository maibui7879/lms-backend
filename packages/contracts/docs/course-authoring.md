# Thông tin khóa học và nội dung bài học

## Thông tin khóa học

CreateCourseRequest, UpdateCourseRequest và CourseData dùng chung CourseMetadata:
subtitle (tóm tắt), category (một danh mục), tags (nhiều nhãn), level
(BEGINNER, INTERMEDIATE, ADVANCED, ALL_LEVELS), language (mã BCP 47),
prerequisites, targetAudience, learningOutcomes (các danh sách chuỗi).
Các field mới là tùy chọn để không làm hỏng dữ liệu cũ. Danh sách rỗng dùng để
xóa các giá trị đã cấu hình. category/tag là nhãn phân loại, không phải skill mastery.
CourseQuery bổ sung category, tag, level, language; các bộ lọc kết hợp theo AND.
tag khớp một phần tử của tags; category/tag khớp giá trị đầy đủ, không tìm chuỗi con.

descriptionFormat mặc định PLAIN_TEXT; HTML là nội dung soạn thảo có định dạng.
Không thêm visibility, bật/tắt chứng chỉ hoặc Q&A trong đợt này.
Không áp đặt tối thiểu 4 mục tiêu hoặc 5 bài học từ thiết kế giao diện.

## Video và bài đọc

Lesson vẫn là phần chứa nội dung. Field dưới đây thuộc learning item:

- VIDEO: attachments tùy chọn, mỗi tệp gồm fileName, fileUrl (HTTP/HTTPS),
  mimeType và sizeBytes (số nguyên dương). Bỏ field hoặc [] nghĩa là không có tệp.
- READING: bodyFormat là PLAIN_TEXT hoặc HTML; bỏ field nghĩa là PLAIN_TEXT.
  body chứa chuỗi nội dung. HTML có thể chèn ảnh giữa văn bản bằng thẻ img với URL.
- QUIZ không nhận attachments hoặc bodyFormat.

Ví dụ tạo video qua POST /api/v1/lessons/{id}/items:

```json
{
  "title": "Video giới thiệu",
  "type": "VIDEO",
  "videoUrl": "https://example.com/intro.mp4",
  "durationSeconds": 600,
  "required": true,
  "attachments": [{
    "fileName": "tai-lieu.pdf",
    "fileUrl": "https://example.com/tai-lieu.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1024
  }]
}
```

Ví dụ bài đọc:

```json
{
  "title": "Bài đọc",
  "type": "READING",
  "bodyFormat": "HTML",
  "body": "<p>Trước ảnh</p><img src=\"https://example.com/image.png\" alt=\"Minh họa\"><p>Sau ảnh</p>",
  "required": true
}
```

## Trách nhiệm triển khai

Đây là thay đổi contract, chưa phải API upload đã hoạt động. Không gửi file nhị phân
hoặc base64 vào body. API upload/storage được triển khai riêng sau; JSON Schema
không xác minh tệp có thật, quyền sở hữu tệp, MIME thực tế hoặc làm sạch HTML.
Course phải kiểm tra các điều đó, lọc HTML theo allowlist (không script, event handler,
URL nguy hiểm); frontend không hiển thị HTML thô chưa làm sạch.

Course phải lưu các field mới trong DB, mapping response và bản sao revision/snapshot;
không ghi đè hoặc xóa tệp còn được snapshot cũ tham chiếu. Field phân loại không
thay đổi completion policy. Tài liệu đính kèm không phải item bắt buộc độc lập.
Learning không đổi thuật toán completion/mastery; cần cập nhật contracts nếu đang
kiểm tra schema nghiêm ngặt và bảo toàn field mới nếu chuyển tiếp nội dung.
