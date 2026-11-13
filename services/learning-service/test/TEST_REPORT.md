# Báo cáo kiểm thử luồng Learning

Ngày kiểm thử **13/11/2026**. Phạm vi gồm `ProgressModule` và `ProgressSyncModule` trong bản làm việc Learning hiện tại. Luồng chính bắt đầu trước khi học viên ghi danh và kết thúc khi Learning xác nhận hoàn thành khóa.

Sau bản sửa PRG-01, **17/17 test NestJS E2E** qua, gồm 3 test tích hợp với PostgreSQL và RabbitMQ. Bộ mock API qua **4/4** ca, unit test qua **1/1** ca. TypeScript và lint đều qua.

## Môi trường và bộ test

| Bộ test | Phần chạy thật | Dữ liệu và dịch vụ giả lập |
| --- | --- | --- |
| [learning-workflow.db.e2e-spec.ts](learning-workflow.db.e2e-spec.ts) | NestJS, các HTTP client của Learning, PostgreSQL 17.12, RabbitMQ 4.4.0 và migration Learning | Course và Quiz là HTTP server cục bộ trả dữ liệu từ fixture. Danh tính dùng `MockAuthGuard`. Event quiz được gửi qua RabbitMQ bằng test publisher. |
| [progress.e2e-spec.ts](progress.e2e-spec.ts) | NestJS, API Progress và API Progress Sync | Course client, broker và repository giả lập. Quiz được giả lập ở tầng HTTP. |
| [mock-server.test.cjs](mock-server.test.cjs) | Mock HTTP server của Learning | Dữ liệu trong bộ nhớ. Các ca lesson và resume ở đây chỉ chứng minh hành vi của mock server. |
| [app.controller.spec.ts](../src/app.controller.spec.ts) và [app.e2e-spec.ts](app.e2e-spec.ts) | Unit và HTTP smoke test của NestJS | Route gốc của Learning. |

Chạy trên Node.js 24.21.0. Suite tích hợp được chạy trên database và vhost Docker mới dành riêng cho test, với cả bốn migration hiện có. Dữ liệu mẫu lấy từ [fixture Course và Quiz](fixtures/learning-providers.mock.json).

## Kịch bản và kết quả

| Mã | Bước kiểm thử | Kết quả quan sát |
| --- | --- | --- |
| PRG-01 | Gửi hai request hoàn thành video cùng lúc sau khi học viên có ghi danh. | Cả hai trả `200`, cùng dữ liệu hoàn thành. PostgreSQL có đúng một dòng cho item trong lượt ghi danh. |
| PRG-02 | Đọc tiến độ trước và sau ghi danh, sau video, sau item bắt buộc cuối và sau bài đánh giá cuối. | Trước ghi danh trả `403`. Sau ghi danh là `NOT_STARTED` và `0%`, sau video là `50%`. Khi xong item cuối, tiến độ lên `100%` nhưng khóa vẫn `IN_PROGRESS`. Điểm cuối đạt thì khóa chuyển `COMPLETED`. |
| PRG-03 | Thử hoàn thành item của chương 2 khi chương 1 còn thiếu điều kiện. Gửi lượt quiz `79%` rồi `80%` với policy mẫu yêu cầu `80%`. | Request vào chương 2 trả `403 PREREQUISITE_NOT_COMPLETED`. Điểm `79%` được đồng bộ và chương 2 vẫn `LOCKED`. Điểm `80%` mở chương 2 sau khi video bắt buộc đã hoàn thành. |
| PRG-01, PRG-02, PRG-03 | Gửi `contentVersion` sai khi ghi item và mô phỏng Course trả outline khác phiên bản ghi danh. | API trả `409 CONTENT_VERSION_MISMATCH`. |
| PRG-06 | Tra trạng thái trước và sau khi RabbitMQ giao kết quả. Đổi sang tài khoản khác. | Chủ lượt làm thấy `PENDING → SYNCED`. Tài khoản khác nhận `403 NOT_ATTEMPT_OWNER`. |
| PRG-06 | Cố ý chặn ghi receipt `SYNCED` ở PostgreSQL. Chờ hết retry rồi gửi lại JSON gốc sau khi gỡ lỗi. | Transaction thất bại để lại **0 dòng điểm và 0 receipt** ở lần ghi trực tiếp. Khi consumer hết retry, DLQ giữ đúng JSON gốc, API trả `FAILED` và điểm vẫn chưa được ghi. Gửi lại cùng event thì API trả `SYNCED` và PostgreSQL có đúng một dòng điểm. |
| PRG-07 | Gửi lại cùng event rồi gửi cùng kết quả với `eventId` khác. | Receipt cũ giữ nguyên thời điểm đồng bộ, mã mới đọc được `SYNCED` và lượt làm chỉ có một dòng điểm. Test NestJS cũng xác minh event mâu thuẫn được chuyển vào DLQ. |

## Lỗi phát hiện và bản sửa

**PRG-01 · API hoàn thành item trả `503` sau khi đã ghi PostgreSQL.** TypeORM gắn `completedAt` từ kết quả INSERT vào object khóa mà repository dùng tiếp cho SELECT. PostgreSQL lưu timestamp với độ chính xác cao hơn JavaScript `Date`, khiến truy vấn thêm điều kiện thời gian có thể tìm sai. Đã dùng `.updateEntity(false)` để truy vấn lại chỉ dựa trên khóa ghép gồm enrollment, phiên bản và item. Kịch bản gửi đồng thời xác minh cả hai response và đếm số dòng thực tế. [Bản sửa](../src/modules/progress/repositories/item-completions.repository.ts)

## Chạy lại

Tại thư mục gốc repo, chạy các lệnh sau trong PowerShell. Hai container dùng port localhost do Docker cấp và dữ liệu test riêng.

```powershell
docker run --rm -d --name lms-workflow-test-pg --publish 127.0.0.1::5432 --env POSTGRES_USER=learning_test --env POSTGRES_PASSWORD=learning_test --env POSTGRES_DB=learning_test postgres:17-alpine
docker run --rm -d --name lms-workflow-test-rabbit --publish 127.0.0.1::5672 --env RABBITMQ_DEFAULT_USER=learning_test --env RABBITMQ_DEFAULT_PASS=learning_test --env RABBITMQ_DEFAULT_VHOST=learning_test rabbitmq:4-alpine
```

Sau khi `pg_isready` và `rabbitmq-diagnostics -q ping` trong hai container báo sẵn sàng, chạy bộ test. Suite tự áp dụng migration.

```powershell
$pgPort = (docker port lms-workflow-test-pg 5432/tcp).Split(':')[-1]
$brokerPort = (docker port lms-workflow-test-rabbit 5672/tcp).Split(':')[-1]
$env:TEST_DATABASE_URL = "postgresql://learning_test:learning_test@127.0.0.1:${pgPort}/learning_test"
$env:TEST_RABBITMQ_URL = "amqp://learning_test:learning_test@127.0.0.1:${brokerPort}/learning_test"
npm.cmd run test:e2e -w @lms/learning-service -- --runInBand --verbose
npm.cmd run test:mock -w @lms/learning-service
npm.cmd test -w @lms/learning-service -- --runInBand
```

Suite PostgreSQL và RabbitMQ tự skip nếu thiếu một trong hai biến `TEST_*`. Dọn môi trường test sau khi chạy.

```powershell
Remove-Item Env:TEST_DATABASE_URL, Env:TEST_RABBITMQ_URL
docker stop lms-workflow-test-pg lms-workflow-test-rabbit
```

## Phần cần kiểm thử khi ghép service

- Thay Course và Quiz giả lập bằng service của nhóm để xác minh HTTP contract, service token và publisher Quiz. Kịch bản ghi danh hiện thay đổi dữ liệu ở Course giả lập, còn RabbitMQ chạy sự kiện quiz đã chấm.
- PRG-01 trong Function List có yêu cầu hoàn thành theo `lessonId`. Suite với DB đang kiểm tra API hoàn thành `learningItemId`. API hoàn thành lesson còn nằm trong mock server.
- PRG-03 đã kiểm thử trạng thái mở, khóa và hoàn thành chương. API chapter access hiện trả trạng thái và lý do khóa. Số bài hoàn thành trên tổng số bài theo từng chương chưa nằm trong response này.
- PRG-06 và PRG-07 trong report được kiểm thử cho `quiz.attempt.graded.v2`. Luồng đồng bộ các loại event khác thuộc phạm vi kiểm thử riêng khi có consumer tương ứng.
