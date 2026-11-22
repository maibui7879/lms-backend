# Tổng quan hệ thống — LMS Backend

## 1. Tổng quan dự án

Đây là dự án backend của hệ thống quản lý học tập (Learning Management System — LMS), được tổ chức theo kiến trúc Microservices trong một monorepo.

Các công nghệ và quy ước đã biết:

- **Ngôn ngữ:** TypeScript.
- **Framework:** NestJS.
- **Quản lý monorepo:** npm workspaces.
- **Cơ sở dữ liệu:** PostgreSQL, sử dụng Supabase.
- **ORM:** TypeORM.
- **Giao tiếp đồng bộ:** REST API , axios 
- **Xác thực:** JWT.
- **Giao tiếp bất đồng bộ:** RabbitMQ.
- **Đảm bảo phát sự kiện:** Transactional Outbox.
- **Kiểm thử:** Jest.
- **Kiểm tra chất lượng code:** ESLint, Prettier.
- **CI:** GitHub Actions.


Đây là ngữ cảnh tổng quan, không có nghĩa mọi Microservice đều đã triển khai đầy đủ tất cả công nghệ trên.

## 2. Nguyên tắc kiểm tra repository trước khi code

Trước khi thực hiện bất kỳ yêu cầu nào, Copilot phải:

1. Kiểm tra cấu trúc thư mục hiện tại.
2. Đọc các file liên quan trực tiếp đến chức năng cần triển khai.
3. Kiểm tra `package.json` ở root và trong service tương ứng.
4. Tìm hiểu cách các service khác đang triển khai chức năng tương tự.
5. Tuân thủ quy ước đặt tên, tổ chức thư mục và import hiện có.
6. Ưu tiên tái sử dụng utility, cấu hình và package dùng chung.
7. Không tự ý thêm dependency hoặc tầng kiến trúc mới khi chưa cần thiết.

**Source code hiện tại là nguồn tham chiếu chính.**

Nếu phát hiện hướng dẫn này mâu thuẫn với code hoặc contract, phải báo cáo để người phát triển xác nhận, không tự ý lựa chọn.

## 3. Quy tắc kiến trúc

- Tôn trọng ranh giới trách nhiệm giữa các Microservice.
- Tuân thủ kiến trúc NestJS theo mô hình Module – Controller – Service.
- Controller chịu trách nhiệm tiếp nhận HTTP request và trả response.
- Service chịu trách nhiệm xử lý nghiệp vụ.
- TypeORM Entity chịu trách nhiệm ánh xạ dữ liệu với PostgreSQL.
- Ưu tiên sử dụng các contract dùng chung khi giao tiếp giữa các service.
- Không mặc định mỗi bảng database phải có một NestJS Module riêng.
- Tránh circular dependency giữa các Module.
- Không tự ý bổ sung tầng Repository tùy chỉnh nếu kiến trúc hiện tại chưa yêu cầu.

## 4. DTO, API Contract và dữ liệu

- Kiểm tra các contract liên quan trong `packages/contracts` trước khi triển khai API hoặc Event.
- Phân biệt DTO với TypeORM Entity.
- Không tự ý sửa DTO, API Contract hoặc Event Schema dùng chung.
- Giữ nhất quán cấu trúc response, tên trường và kiểu dữ liệu.
- Thực hiện validation tại các vị trí phù hợp.
- Không tự suy diễn quy tắc nghiệp vụ khi tài liệu chưa quy định rõ.
- Nếu có mâu thuẫn giữa Function List, DTO và database, phải báo cáo trước khi sửa.

## 5. Quy tắc làm việc với database

- Tuân thủ schema PostgreSQL và các ràng buộc hiện có.
- Không tự ý tạo, xóa hoặc sửa bảng khi chưa được yêu cầu.
- Không bật `synchronize: true` của TypeORM trên database dùng chung hoặc production.
- Sử dụng transaction cho những thao tác cần đảm bảo tính nguyên tử.
- Đảm bảo tính toàn vẹn dữ liệu và kiểm soát cập nhật đồng thời.
- Không tạo khóa ngoại trực tiếp giữa các database thuộc những Microservice độc lập.
- Không đưa thông tin kết nối database hoặc secrets lên GitHub.

## 6. Bảo mật và độ tin cậy

- Tuân thủ cơ chế authentication và authorization của dự án.
- Không bỏ qua Guard chỉ để API chạy thành công.
- Không để lộ mật khẩu, JWT secret, đáp án đúng hoặc dữ liệu riêng tư của học viên.
- Tuân thủ quy ước Idempotency và Messaging của nhóm.
- Tránh xử lý side effect nhiều lần khi request được gửi lại.
- Với Transactional Outbox, phải lưu dữ liệu nghiệp vụ và Outbox Event trong cùng transaction khi nghiệp vụ yêu cầu.
- Chỉ phát sự kiện sau khi transaction tương ứng đã commit thành công.

## 7. Chất lượng code

- Viết TypeScript rõ ràng, dễ đọc và dễ bảo trì.
- Tuân thủ ESLint và Prettier của repository.
- Ưu tiên tái sử dụng code dùng chung thay vì viết trùng lặp.
- Chỉ sửa những file thuộc phạm vi task được giao.
- Không tự ý refactor các Module không liên quan.
- Không bỏ qua lỗi TypeScript hoặc tắt lint rule để vượt CI.
- Không sử dụng logic giả hoặc dữ liệu giả rồi báo cáo chức năng đã hoàn thành.

## 8. Kiểm thử

- Bổ sung hoặc cập nhật test phù hợp với chức năng được thay đổi.
- Tuân thủ cấu trúc Jest và E2E Test hiện có.
- Không để CI phụ thuộc vào database production hoặc các dịch vụ bên ngoài đang hoạt động.
- Chạy các lệnh build, lint, format, typecheck và test tương ứng nếu repository hỗ trợ.
- Nếu không thể chạy một bước kiểm tra, phải báo cáo lý do.
- Không tuyên bố test thành công nếu chưa thực sự chạy.

## 9. Quy tắc phối hợp

- Không tự động commit, push hoặc tạo Pull Request.
- Không sửa Microservice khác nếu chưa được yêu cầu.
- Giải thích các quyết định kiến trúc quan trọng.
- Nêu rõ những giả định và vấn đề chưa được xác nhận.
- Ưu tiên thay đổi nhỏ, dễ review và dễ kiểm thử.

## 10. Ngôn ngữ phản hồi

- Luôn trao đổi và giải thích bằng tiếng Việt.
- Giữ nguyên tên biến, class, method, file và thuật ngữ kỹ thuật cần thiết bằng tiếng Anh.
- Sau khi hoàn thành task, báo cáo:
  1. Những file đã tạo hoặc chỉnh sửa.
  2. Chức năng đã triển khai.
  3. Cách hoạt động của chức năng.
  4. Kết quả các bước kiểm tra.
  5. Những vấn đề còn tồn tại hoặc cần xác nhận.