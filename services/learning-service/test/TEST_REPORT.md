# Báo cáo kiểm thử luồng Learning

Ngày kiểm thử **14/11/2026**. Phạm vi gồm `ProgressModule` và `ProgressSyncModule` trong bản làm việc Learning hiện tại. Luồng chính bắt đầu trước khi học viên ghi danh và kết thúc khi Learning xác nhận hoàn thành khóa.

Sau rà soát chéo ngày **14/11/2026**, bộ đầy đủ đạt **56/56 E2E**, gồm 11 ca HTTP cho snapshot, các ca PostgreSQL/RabbitMQ và năm ca hồi quy bổ sung. Mock API đạt **10/10**. Agent thứ hai tự chạy **32/32 E2E** trong `course-snapshot`, `progress-audit`, `progress`, cùng **10/10 mock**, rồi kiểm tra diff. 32 ca này thuộc bộ 56 ca. Build Learning, TypeScript và lint đều qua; unit **1/1** đạt. Bộ contract **8/8** đã đạt trước các sửa nghiệp vụ lần này; lần này không đổi schema. Luồng học lại dựa trên contract main **0981c48**.

## MST-03 và MST-07 — Số câu Quiz và snapshot

Ba agent kiểm thử độc lập MST-01 đến MST-07 sau khi bổ sung số câu và snapshot. API Learning chạy với PostgreSQL và RabbitMQ thật trên máy kiểm thử. Course và Quiz dùng dữ liệu giả lập.

| Lượt kiểm thử | Kết quả trên bản sửa `updatedAt` |
| --- | --- |
| Agent chính | 68/68 E2E Learning, 14/14 mock HTTP, 29/29 unit, 8/8 contract. Build, lint và TypeScript đạt. |
| Agent kiểm thử số câu | 14/14 mock HTTP và 11 request HTTP độc lập. Trước bản sửa cũng đạt 12/12 E2E MST. |
| Agent kiểm thử snapshot | 12/12 E2E MST và 14/14 mock HTTP. Trước bản sửa đã gọi thêm 22 request NestJS để kiểm tra quyền, ghi danh lại và đọc đồng thời. |

Lần chạy cả bộ ngay sau bản sửa vượt timeout 5 giây ở ca MST chạy qua broker và làm hai ca Progress tiếp theo thất bại khi dùng chung fixture. Đặt riêng timeout cho ca MST theo các ca broker cùng bộ rồi chạy lại. Lượt cuối đạt 68/68.

| Kịch bản | Kết quả |
| --- | --- |
| Gọi `getAssessmentSummary` của Quiz giả lập với mã lượt thứ hai. | Trả `200` và `skillScores[].questionCount: 5`. Thiếu token trả 401. Sau khi đọc, mastery vẫn rỗng cho đến khi Learning nhận event. |
| Phát hai kết quả qua RabbitMQ với điểm 4/10 và 18/20, số câu 3 và 5. | API trả 73,33%, 2 lượt và 8 câu. PostgreSQL có cùng kết quả trong `learning_mastery_current`. Giao lặp cùng lượt giữ nguyên cả hai số đếm. |
| Có lượt hợp lệ có số câu và lượt cũ thiếu số câu trong cùng kỹ năng. | Điểm vẫn được tính trên cả hai lượt. `questionCount` là `null`. Contract từ chối số câu bằng 0, âm, thập phân, chuỗi hoặc `null` trong event. |
| Đọc mastery hoặc history sau khi có điểm, đọc lại đồng thời, đổi tên kỹ năng và nhận thêm event đến muộn. | PostgreSQL lưu một snapshot cho mỗi lượt và phiên bản. Hai lượt đọc trả cùng mốc đã lưu. Snapshot cũ giữ điểm, mức, tên, số câu và `recordedAt`. Điểm hiện tại phản ánh dữ liệu mới. |
| MST-05/06 nhận điểm cũ đến muộn sau khi đã đọc bảng điểm. | Trước khi sửa, điểm và số câu thay đổi nhưng `updatedAt` giữ nguyên. Sau khi sửa, lần đọc lưu bảng điểm mới làm `updatedAt` tăng. Gửi trùng event và đọc lại giữ nguyên toàn bộ bảng điểm. |
| Migration đổi phiên bản quiz. | Kết quả cũ vẫn tra được trong lịch sử. Điểm hiện tại dùng phiên bản hợp lệ sau migration. |
| Hủy và ghi danh lại cùng khóa. | API từ chối đọc sau khi hủy, giữ snapshot cũ và đọc bảng điểm riêng cho lần ghi danh mới. |

Hai bảng mới được tạo bằng migration `1794528000008`. Mốc lưu vào lần đọc đầu tiên, nên `recordedAt` có thể sau `gradedAt`. Replay giữ payload gốc. Cần một bước bổ sung dữ liệu riêng nếu muốn điền số câu vào lượt cũ. Khi ghép, Quiz cần phát `questionCount` và xác nhận cách nhận diện lượt làm từ lần ghi danh trước nếu chấm sau khi học viên ghi danh lại. [Ví dụ Postman](../../../WORK.md#mst-07--lịch-sử-mastery)

**Kết luận.** Có thể chốt MST-01 đến MST-07 phía Learning với Course và Quiz giả lập. Kiểm thử tích hợp với hai service thật được theo dõi trong kế hoạch. [Kế hoạch](../../../PLAN.md#mastery-mst-01-đến-mst-07)

## Rà soát MST-01 đến MST-07 trước bản bổ sung số câu và snapshot

Ba agent trực tiếp chạy test code và gọi API. PostgreSQL và RabbitMQ chạy trên môi trường test riêng. Course/Quiz được giả lập, bộ tính sử dụng công thức MST-03 đã chốt.

| Người kiểm thử | Kết quả |
| --- | --- |
| Agent chính | 68/68 E2E sau khi sửa sai số, cấu hình và query. Sau khi bổ sung ca sát biên, chạy lại 12/12 E2E MST, 29/29 unit và 14/14 mock HTTP. Build, lint, TypeScript và 8/8 contract đạt. |
| Agent rà catalog và quyền | 25/25 unit ở bản sửa đầu, 10/10 E2E catalog với PostgreSQL riêng và 14/14 mock HTTP. Gọi trực tiếp API để kiểm tra tên ở lịch sử và query ngoài contract. |
| Agent rà điểm và lịch sử | 29/29 unit, 12/12 E2E MST với PostgreSQL/RabbitMQ riêng và 14/14 mock HTTP. Gọi trực tiếp cả hai API mastery với bốn ca số thập phân sát biên trên bản sửa cuối. |

Các bộ test có phần trùng nhau. Kết quả của từng người là các lượt chạy độc lập.

| Phạm vi | Kết luận |
| --- | --- |
| MST-01/02 | Catalog, quyền theo khóa, sửa đồng thời, tra mã bằng token và kiểm tra các mã kỹ năng gắn mới đều đạt. Luồng tạo/sửa câu hỏi và lưu mapping phía Quiz cần ghép QUIZ-08 thật. |
| MST-03 | Ca 4/10 và 18/20 trả 73,33%. Lượt trùng, practice, khóa/học viên hoặc phiên bản sai không góp điểm. Function List dòng 127 còn yêu cầu lưu kết quả cùng số lượng câu. Hệ thống đang lưu từng attempt và tính khi đọc. Event chỉ có điểm đạt/tối đa, `evidenceCount` là số lượt. |
| MST-04 | Phát hiện điểm thập phân đúng 40% hoặc 70% có thể bị xếp thấp vì sai số cộng và chia. Đã sửa và bổ sung hồi quy ở unit lẫn API. Hai ngưỡng cấu hình cấp instance được áp dụng trên current/history. Ngưỡng 45/75 xếp điểm 70% vào `DEVELOPING`. |
| MST-05/06 | API phục vụ dữ liệu biểu đồ và đọc điểm sau khi event đã commit. Không cộng trùng khi đổi ID event của cùng lượt. API current và danh sách kỹ năng trả 400 cho query ngoài contract giống mock. |
| MST-07 | Phân trang, quyền và thứ tự lượt đạt. Hai agent gọi HTTP xác nhận mốc cũ có thể đổi tên khi sửa danh mục và đổi điểm khi nhận lượt cũ muộn. Function List dòng 131 yêu cầu lưu snapshot theo thời điểm nên phần này còn mở. |

**Kết luận.** Có thể chốt phần backend đã kiểm thử của MST-01, MST-02, MST-04, MST-05 và MST-06. Chưa đóng toàn bộ MST theo Function List. Cần hoàn thiện MST-03 về lưu kết quả và số câu, MST-07 về snapshot, rồi kiểm tra tích hợp thật.

Tham chiếu `origin/main` tại máy là `0e63d67`. Course đã có truy vấn revision xuất bản theo phiên bản yêu cầu. Controller còn chuyển query `contentVersion` dạng chuỗi vào parser yêu cầu số. Cần xác minh luồng HTTP ghép. Quiz trong tham chiếu này còn scaffold. Kiểm tra hợp đồng ghi danh lại và lượt quiz đang làm trước khi kết luận chính sách về kết quả đến muộn giữa hai lần ghi danh. Kết luận này dựa trên code tham chiếu tại máy và test provider giả lập.

## MST-03 – Tính điểm mastery

**67/67 E2E, 14/14 mock API và 21/21 unit đạt** sau khi nối công thức tổng điểm đạt chia tổng điểm tối đa. Ca RabbitMQ/PostgreSQL dùng bộ tính điểm Learning, với Course/Quiz giả lập.

| Kịch bản | Kết quả |
| --- | --- |
| Hai lượt của cùng một kỹ năng đạt 4/10 và 18/20. Lượt thứ hai đến trước. | Khi có một lượt 18/20, API trả 90%. Khi cả hai đã lưu, API trả khoảng 73,33%, `PROFICIENT`, 2 lượt và `weighted-score-v1`. Mốc đầu của lịch sử là 40%. |
| Gửi lại cùng attempt bằng ID event mới, gửi practice, sai phiên bản, khác học viên hoặc kỹ năng thiếu dữ liệu. | Hai lượt hợp lệ vẫn là toàn bộ mẫu được tính. |
| Học viên đã ghi danh nhưng chưa có dữ liệu. | Hai API thật trả 200 với danh sách rỗng. Học viên chưa ghi danh bị từ chối. |

Mẫu Postman trả cùng kết quả 22/30. `evidenceCount` đếm số lượt đánh giá hợp lệ. Việc có số câu theo kỹ năng phụ thuộc bổ sung dữ liệu từ Quiz. [Luồng RabbitMQ](learning-workflow.db.e2e-spec.ts) · [Mock HTTP](mock-server.test.cjs)

## MST-05 đến MST-07 — Lần kiểm thử trước khi nối MST-03

**67/67 E2E, 14/14 mock API, 21/21 unit và 8/8 contract đạt**. Build, TypeScript và lint đạt. Ba ca E2E mới dùng PostgreSQL thật. Ca đồng bộ dùng RabbitMQ thật. Course, Quiz và công thức tính mastery dùng giả lập.

| Chức năng | Đã xác minh |
| --- | --- |
| MST-05 — Biểu đồ năng lực | Học viên đã ghi danh nhận đúng tên kỹ năng, điểm, mức, số lượt và phiên bản bộ tính. Chưa có bằng chứng trả danh sách rỗng khi đã cấu hình bộ tính. Người khác bị từ chối. Khi chưa cài bộ tính, endpoint NestJS trả 503. |
| MST-06 — Cập nhật sau quiz | API thấy dữ liệu sau commit. Event gửi lại bằng ID mới của cùng lượt không tăng số mẫu. Bỏ qua quiz luyện tập, sai phiên bản, khác học viên và lượt không có điểm kỹ năng. |
| MST-07 — Lịch sử mastery | Hai mốc theo thời gian chấm, dù event cũ đến sau. Trang 2 với limit=1 trả đúng mốc đầu. Cấm truyền userId để đọc của người khác. |
| MST-06/07 — Migration quiz | Grade đúng phiên bản mới được dùng khi migration có hiệu lực, kể cả đã đến trước migration. Kết quả phiên bản cũ vẫn có trong lịch sử nếu đã hợp lệ ở thời điểm chấm. Grade bản cũ chấm sau khi bị thay không ảnh hưởng kết quả. |

Ca dùng dữ liệu sự kiện Mastery và PRG từng dùng chung khóa mẫu, khiến hai ca PRG đọc dư điểm trong lượt chạy đầu. Đã dọn bản ghi của ca Mastery sau mỗi lần chạy và xác nhận lại toàn bộ 67 ca.

Lần chạy này dùng bộ tính giả lập. Phần MST-03 ở trên ghi kết quả sau khi nối công thức đã chốt. Lịch sử vẫn dựng lại từ attempt đã commit theo công thức và danh mục hiện hành. [Ca migration](course-items-migration.db.e2e-spec.ts)

## MST-04 — Phân loại mức độ thành thạo

**20/20 ca MST-04 đạt**, tổng bộ unit Learning **21/21**. Build, lint và TypeScript đều đạt.

| Kịch bản | Kết quả |
| --- | --- |
| Điểm ngay dưới, đúng và trên 40% hoặc 70%. | Xếp đúng mức theo ngưỡng. 69,999% vẫn là `DEVELOPING`. |
| Điểm 0% có căn cứ và kỹ năng thiếu dữ liệu. | Điểm 0% có dữ liệu là `BEGINNER`. Thiếu bằng chứng trả `null`. |
| Cùng điểm 70% với hai bộ ngưỡng. | Ngưỡng mặc định xếp `PROFICIENT`. Đổi ngưỡng trên thành 80% thì xếp `DEVELOPING`. |
| Ngưỡng trùng, đảo thứ tự, vượt giới hạn hoặc điểm/số mẫu sai. | Từ chối bằng `RangeError`. |

[Suite MST-04](../src/modules/mastery/rules/mastery-level.spec.ts) gọi trực tiếp hàm bằng điểm và số mẫu xác định sẵn. Phần MST-03 ở trên xác nhận thêm mức trên dữ liệu API.

## MST-02 — Liên kết câu hỏi với kỹ năng

Bộ Learning đạt **64/64 E2E** và **13/13 mock API**. Contract đạt **8/8**. Build, lint và TypeScript đều đạt.

| Kịch bản | Kết quả |
| --- | --- |
| Gửi hai mã đang dùng, cùng khóa, trong một request. | `204`, body rỗng và giữ request ID. UUID viết hoa được nhận. |
| Gửi cùng lúc mã đúng, mã khác khóa, mã đã ngừng dùng và mã không tồn tại. | `422 INVALID_SKILL_REFERENCE`, trả đúng danh sách ba mã bị từ chối. |
| Dùng token migration, thiếu token, UUID sai, danh sách rỗng, trùng mã khác chữ hoa/thường hoặc vượt 100 mã. | Sai credential trả 401. Sai dữ liệu trả 400. |
| Quiz giả lập tạo hai phiên bản câu hỏi. Kỹ năng ở bản đầu ngừng dùng trước khi thêm kỹ năng thứ hai. | Xác minh các mã mới trước khi lưu. Lần lưu có mã lỗi bị từ chối. Payload chấm thử của phiên bản đầu vẫn dùng kỹ năng và điểm từ câu hỏi của phiên bản đó. |

[Ca kiểm thử MST-02](course-skills.db.e2e-spec.ts) gọi NestJS thật và truy vấn PostgreSQL thật. Course và thao tác lưu phiên bản câu hỏi của Quiz dùng giả lập. RabbitMQ thật dùng trong bộ hồi quy PRG. [Mock HTTP](mock-server.test.cjs) xác nhận cùng mã trả về khi thử Postman. Khi ghép, cần xác nhận QUIZ-08 gọi API từ luồng tạo/sửa và chấm câu hỏi thật.

## MST-01 — Danh sách kỹ năng khóa học

Kiểm thử ngày **14/11/2026**. Bộ Learning đạt **61/61 E2E**, gồm năm ca MST-01 và 56 ca hồi quy PRG và smoke test. Bộ mock đạt **12/12**, gồm hai ca danh mục kỹ năng. Contract đạt **8/8**, unit đạt **1/1**. Build, lint và TypeScript đều đạt.

| Kịch bản MST-01 | Kết quả thực tế |
| --- | --- |
| Chủ khóa tạo, sửa và ngừng sử dụng kỹ năng | Mã giữ nguyên, version tăng. Học viên đã ghi danh chỉ thấy kỹ năng hoạt động. Chủ khóa và API nội bộ vẫn tra được mục cũ. PostgreSQL có một dòng. |
| Khóa nháp và quyền theo khóa | Chủ khóa thao tác trên khóa nháp. Admin được quản lý. Giảng viên khác, học viên chưa ghi danh hoặc đã hủy ghi danh bị từ chối. Đưa mã kỹ năng khóa khác vào request sửa trả 404. |
| API lỗi dữ liệu hoặc Course không sẵn sàng | Thiếu danh tính trả 401, UUID sai, tên trống, dữ liệu chứa ký tự không hợp lệ hoặc thêm trường ngoài contract trả 400. Course lỗi trả 503. Không ghi bản ghi mới. |
| Hai yêu cầu cùng `expectedVersion` | Một trả 200, một trả `409 VERSION_CONFLICT`. PostgreSQL giữ đúng nội dung của lần sửa thành công. |
| Tra mã bằng credential đọc riêng | Không có token hoặc dùng token migration trả 401. Đúng token nhưng sai khóa trả 404. Token đọc không gọi được API migration. |

[Suite MST-01](course-skills.db.e2e-spec.ts) gọi NestJS qua HTTP, dùng PostgreSQL thật và Course HTTP giả lập theo contract. RabbitMQ thật chạy trong suite hồi quy PRG. [Mock API](mock-server.test.cjs) dùng fixture trong bộ nhớ để kiểm tra luồng Postman. Ghép hệ thống sẽ kiểm tra quyền Course thật và phía gọi của Quiz thuộc MST-02.

## Rà soát và kiểm thử bởi hai agent

Trước bản sửa bổ sung, bộ 51 E2E và 9 mock đều đạt nhưng chưa bao phủ bốn trường hợp bên dưới. Agent thứ hai đọc code độc lập, chạy các suite riêng và tái hiện các lỗi; agent chính cũng tái hiện, sửa và chạy lại bộ đầy đủ. Hai bên đọc lại bản sửa và thống nhất không còn lỗi chặn được phát hiện trong phạm vi Learning với provider giả.

| Chức năng | Trường hợp và lỗi trước sửa | Kết quả API sau sửa |
| --- | --- | --- |
| PRG-01/02/05 | Đủ item/quiz nhưng chưa xác nhận bài, khóa đã báo hoàn thành. | `GET .../courses/{id}/progress` giữ `IN_PROGRESS`, `completedAt: null`, tiến độ bài 0%; dashboard trả `COMPLETE_LESSON`. Xác nhận hai bài lần lượt 50%, 100%, cuối cùng `COMPLETED`. Mốc hoàn thành bao gồm xác nhận bài cuối. |
| PRG-03/06/07 | Kết quả đúng quiz phiên bản mới bị loại khi được chấm trước lúc Learning nhận migration. | Kết quả mới vẫn được tính qua API tiến độ khóa và bài. Kết quả phiên bản cũ đến trễ không thay thế được kết quả mới. Không dùng thời điểm giao migration làm điều kiện đạt quiz. |
| PRG-01/03 | Video đổi thành quiz yêu cầu 90%, kết quả practice hoặc đạt theo ngưỡng 70% vẫn hoàn thành item. | API tiến độ bài giữ `OUTDATED`, xác nhận bài trả 409. Kết quả GRADED đạt đúng ngưỡng context 90% mới cho phép xác nhận với 200. Test có hai trường hợp riêng cho ngưỡng sai và practice. |
| PRG-01/05 | Quiz đã đạt bị mất `invalidationReason` khi nhận NOTIFY_ONLY. | API tiến độ bài giữ completion và lý do thông báo. Kết quả cũ đến trễ giữ thông báo; kết quả hợp lệ sau thông báo xóa lý do. REQUIRE_RECOMPLETION mới hơn thay thế notice cũ. |

Các ca bổ sung nằm trong [course-items-migration.db.e2e-spec.ts](course-items-migration.db.e2e-spec.ts), [progress-audit.e2e-spec.ts](progress-audit.e2e-spec.ts) và [mock-server.test.cjs](mock-server.test.cjs). Chúng gọi API HTTP của NestJS hoặc mock, kiểm tra mã HTTP và dữ liệu trả về. Test migration dùng PostgreSQL thật; suite workflow đầy đủ có RabbitMQ thật. Course/Quiz và danh tính vẫn giả lập.

**Quy ước cần giữ khi đổi loại:** QUIZ → READING không tự xóa assessment đã pin trong policy chương/khóa. Context hiện chưa khai báo scope thay đổi requirement; muốn đổi policy phải thống nhất với Course. VIDEO/READING → QUIZ phải thỏa requirement của chính item mới từ context, không tự tạo scope policy mới.

**Kết luận sau đối chiếu:** hoàn thành PRG-01 đến PRG-08 trong phạm vi standalone Learning và mock/provider giả; có thể chuyển sang nhóm tiếp theo. Việc ghép Course/Quiz thật được theo dõi riêng cuối báo cáo. Các sửa của lần rà soát này chưa push.

## Kiểm tra nguồn snapshot

Learning đã đổi `CourseClient.structure()` sang gọi trực tiếp `getLearningStructure` theo `enrollment.contentVersion`. Bộ [course-snapshot.e2e-spec.ts](course-snapshot.e2e-spec.ts) dùng HTTP server cục bộ để kiểm tra 11 trường hợp. Request phải dùng đúng query phiên bản, Bearer credential và request ID. Client kiểm tra khóa và phiên bản của cả outline lẫn policy, xử lý việc thiếu token hoặc snapshot, và lỗi quyền hoặc phụ thuộc.

Suite PostgreSQL và RabbitMQ dùng fake Course chỉ cung cấp API internal cho cấu trúc. Kịch bản Course có bản mới vẫn trả đúng tiến độ của snapshot ghi danh cũ.

Các điểm còn ở Course main 0981c48 khi ghép đã được xác minh từ code:

- `InternalController.parseQuery()` đang chuyển nguyên query vào parser. Giá trị HTTP `contentVersion=1` là chuỗi, còn parser yêu cầu số. Đã chạy thử parser với `"1"` và `1` để xác nhận chuỗi bị từ chối. [Controller trên main](https://github.com/maibui7879/lms-backend/blob/0981c48/services/course-service/src/modules/internal/internal.controller.ts)
- `InternalService.getLearningStructure()` đang kiểm tra phiên bản được yêu cầu bằng phiên bản hiện tại, nên bản cũ có thể bị từ chối với 409. Course cần lưu và đọc đúng snapshot lịch sử. [Service trên main](https://github.com/maibui7879/lms-backend/blob/0981c48/services/course-service/src/modules/internal/internal.service.ts)
- Controller internal của Course hiện chưa gắn guard credential và app module chưa có global guard tương ứng. Learning gửi credential theo contract. Course cần kiểm tra credential ở phía nhận.

## Xác nhận trực tiếp kết quả HTTP

Đã khởi động mock server từ lệnh chạy Node của service trên một cổng localhost riêng, dùng dữ liệu mới hoàn toàn và gọi **59 request HTTP**. Mỗi request được đối chiếu mã HTTP. Các bước thay đổi trạng thái được đối chiếu thêm nội dung trả về. Cả 59 request đạt kết quả mong đợi.

| Luồng API | Kết quả mong đợi | Kết quả thực tế |
| --- | --- | --- |
| Bắt đầu, đọc bài, lưu vị trí và quyền truy cập | Chưa học là `NOT_STARTED`, vị trí ban đầu rỗng. Thiếu danh tính trả 401, chưa ghi danh hoặc vào chương khóa trả 403, xác nhận bài thiếu mục bắt buộc trả 409. | Đạt. Lưu giây 60 rồi đọc lại đúng vị trí, gửi revision cũ bị từ chối. |
| Xác nhận hoàn thành video và bài | Gửi lặp giữ cùng kết quả. Xong bài 1 trả 1/2 bài và 50%. | Đạt. Hai request hoàn thành video đồng thời trả cùng thời điểm hoàn thành. |
| Quiz 79%, 80% và event giao lại | 79% giữ chương sau khóa. 80% mở chương. Giao lại event giữ đúng hai lượt đã chấm. | Đạt. Dashboard gợi ý quiz khi còn thiếu điều kiện. |
| Bảng điểm theo quyền | Học viên xem điểm của mình, chủ khóa xem bảng điểm khóa. Giảng viên khác bị từ chối. | Đạt. Query phân trang lặp bị từ chối với 400. |
| Xong nội dung và quiz cuối khóa | 100% bài nhưng còn thiếu quiz thì `IN_PROGRESS`. Sau quiz cuối, khóa `COMPLETED`, sync `SYNCED`, dashboard hết bước bắt buộc. | Đạt. |
| Chỉ thông báo rồi yêu cầu học lại video | `NOTIFY_ONLY` giữ tiến độ. `REQUIRE_RECOMPLETION` trả 204 và đưa mục sang `OUTDATED`. Bài khác giữ kết quả. | Đạt. Tỷ lệ giảm từ 100% xuống 50%, chương sau khóa lại. |
| Vị trí video đã sửa | Checkpoint cũ về giây 0 và giữ revision. Giây 60 vượt thời lượng mới bị từ chối, giây 15 được lưu. | Đạt. Dashboard đưa về đúng giây 15 sau lần lưu mới. |
| Hoàn thành lại và gửi lại migration | Khóa trở lại 100% và `COMPLETED`, metadata invalidation rỗng. Migration gửi lại giữ kết quả này. | Đạt. |
| Migration sai quyền hoặc dữ liệu | Thiếu credential trả 401, item rỗng trả 400, item sai trả 422, payload mâu thuẫn trả 409. | Đạt. Tiến độ cuối vẫn giữ kết quả đã học lại. |

**Hai lỗi bổ sung đã được sửa trong lần xác nhận này.** Mock trước đó xóa checkpoint sau migration. Nay mock giữ revision, đưa video bị sửa về giây 0 và tiếp tục kiểm tra quyền vào chương. Backend trước đó có thể hiển thị lại lý do của thông báo cũ sau khi học lại xong. Nay lý do thông báo chỉ được áp dụng khi completion còn thuộc trước lần thông báo, nên metadata được xóa đúng khi hoàn thành lại. Hai tình huống đều có test hồi quy.

**Kết luận trong phạm vi hiện tại.** PRG-01 đến PRG-08 và migration học lại đáp ứng các kết quả mong đợi trong bộ kiểm thử. Luồng tiến độ, khóa chương, điểm quiz và học lại nhất quán. Có thể đóng phần phát triển và kiểm thử với mock API, dữ liệu mẫu và provider giả lập. Các bước ghép Course/Quiz thật được theo dõi riêng ở cuối báo cáo.

Lần chốt PRG trước thay đổi contract đạt 27/27 E2E và sửa hai lỗi ở PRG-01/03. Bản cập nhật hiện tại thêm trạng thái invalidation, API migration và các ca học lại. Course và Quiz tiếp tục dùng dữ liệu giả lập.

## Kiểm thử cập nhật nội dung theo revision

Nguồn nghiệp vụ là [hướng dẫn trên main](../../../packages/contracts/docs/learning-migration-guide.md). Bộ [course-items-migration.db.e2e-spec.ts](course-items-migration.db.e2e-spec.ts) gọi API NestJS, dùng PostgreSQL thật và giả lập context revision từ Course.

| Tình huống | Kết quả quan sát |
| --- | --- |
| Nâng dữ liệu completion cũ qua migration schema mới. | Trạng thái là `COMPLETED`, `invalidatedAt` và `invalidationReason` rỗng. Dữ liệu cũ giữ kết quả đã học. |
| Yêu cầu học lại video của bài 1. | Video và bài bị đánh dấu cần học lại, tỷ lệ theo bài giảm, chương tiếp theo khóa theo policy. Mục khác giữ kết quả. |
| Học lại video rồi xác nhận lại bài. | Trạng thái trở về `COMPLETED`, metadata invalidation đang áp dụng được xóa, tỷ lệ tăng trở lại. |
| Gửi lại migration sau khi học viên đã học lại. | Giữ kết quả mới và giữ đúng một completion theo khóa nghiệp vụ. |
| Gửi `NOTIFY_ONLY`. | Điểm và số bài đã hoàn thành giữ nguyên. Item có lý do để hiển thị thông báo. |
| Migration nhiều mục, mục sau mâu thuẫn với yêu cầu đã lưu. | Cả transaction bị rollback. Mục trước trong batch giữ nguyên trạng thái. |
| Xác nhận hoàn thành sau khi đã đọc luật cũ, trong lúc migration vừa áp dụng. | Trả `409 REVISION_CONFLICT`, yêu cầu đọc lại dữ liệu. |
| Revision cũ đến sau revision mới và sau khi học viên đã học lại. | Dùng nội dung và kết quả của revision mới. |
| Gửi sai course, revision, item, item lặp, revision draft hoặc NORMAL với yêu cầu học lại. | Bị từ chối trước khi ghi thay đổi. |
| Gửi tài khoản Admin bằng `X-Mock-User` hoặc credential nội bộ sai. | Trả `401`. Credential nội bộ hợp lệ mới gọi được endpoint. |
| Ghi lại trạng thái `RESET`, `NOT_STARTED` hoặc `IN_PROGRESS` rồi hoàn thành hợp lệ. | Completion chuyển sang `COMPLETED` và xóa metadata invalidation. |
| Video đổi thời lượng từ 180 xuống 30 giây. | Vị trí 60 giây bị từ chối. Checkpoint cũ được đọc ở giây 0, giữ revision để cập nhật sang vị trí mới hợp lệ. |
| Quiz đổi sang assessmentVersion mới, event cũ đến trễ rồi event phiên bản mới đến. | Điểm và attempt cũ được giữ để tra cứu. Điều kiện hoàn thành chỉ sử dụng lượt đạt của phiên bản mới. |

Contract bổ sung `getCourseItemMigrationContext` để Course cung cấp revision, các item nguồn–đích và yêu cầu quiz mới. Việc triển khai endpoint này và phục vụ nội dung sửa trên Course thật thuộc bước ghép. Suite migration hiện giả lập phần cung cấp context.

## Kết quả rà soát theo chức năng

| Mã | Phạm vi đã xác minh | Kết quả |
| --- | --- | --- |
| PRG-01 | Đúng học viên, đúng bài và phiên bản, đủ mục bắt buộc, gửi lặp và gửi đồng thời. UUID viết hoa vẫn tìm đúng bài. | Đạt sau bản sửa UUID và kiểm tra ngưỡng điểm quiz. |
| PRG-02 | Tỷ lệ theo bài bắt buộc, loại bài chỉ có mục tùy chọn, xử lý tổng bằng 0 và cấu trúc theo phiên bản ghi danh. | Đạt. |
| PRG-03 | Số bài và trạng thái chương, quiz dưới ngưỡng hoặc sai phiên bản, yêu cầu học tuần tự từ policy cấp chương. | Đạt. |
| PRG-04 | Học viên xem điểm của mình, giảng viên đúng khóa, Admin, phân trang, tách phiên bản và số lượt không tăng khi giao lại event. | Đạt. |
| PRG-05 | Nhiều khóa, thứ tự hoạt động, tài khoản chưa ghi danh, bước học hợp lệ, tối đa 10 quiz gần đây và bỏ kết quả sai phiên bản. | Đạt. |
| PRG-06 | Nhận kết quả quiz đã chấm, trạng thái đồng bộ, lỗi phụ thuộc, rollback, retry, DLQ và xử lý lại. | Đạt trong luồng contract hiện tại. |
| PRG-07 | Hai event cùng lượt làm đến đồng thời, event lặp, event mâu thuẫn và dữ liệu điểm sai. | Đạt. Điểm gốc được giữ nguyên. |
| PRG-08 | Lưu và đọc vị trí, đúng lượt ghi danh, chặn ghi đè từ revision cũ, video và bài đọc, khóa chương và hủy ghi danh. | Đạt. |

## Môi trường và bộ test

| Bộ test | Phần chạy thật | Dữ liệu và dịch vụ giả lập |
| --- | --- | --- |
| [learning-workflow.db.e2e-spec.ts](learning-workflow.db.e2e-spec.ts) | NestJS, các HTTP client của Learning, PostgreSQL 17.12, RabbitMQ 4.4.0 và migration Learning | Course và Quiz là HTTP server cục bộ trả dữ liệu từ fixture. Danh tính dùng `MockAuthGuard`. Event quiz được gửi qua RabbitMQ bằng test publisher. |
| [progress.e2e-spec.ts](progress.e2e-spec.ts) | NestJS, API Progress và API Progress Sync | Course client, broker và repository giả lập. Quiz được giả lập ở tầng HTTP. |
| [progress-audit.e2e-spec.ts](progress-audit.e2e-spec.ts) | NestJS, các API Progress, Dashboard và Resume, luật nghiệp vụ Learning | Course và repository giả lập để tạo các ca biên riêng, gồm UUID viết hoa, sai ngưỡng quiz, bài tùy chọn, quiz luyện tập và giới hạn điểm gần đây. |
| [course-snapshot.e2e-spec.ts](course-snapshot.e2e-spec.ts) | HTTP client Course của Learning, kiểm tra snapshot và ánh xạ lỗi | Fake Course HTTP server nhận credential và query version, có các kịch bản trả sai khóa, sai phiên bản hoặc lỗi. |
| [course-items-migration.db.e2e-spec.ts](course-items-migration.db.e2e-spec.ts) | API NestJS, PostgreSQL, migration schema, khóa transaction và repository thực | Course cung cấp metadata revision và liên hệ item bằng provider giả lập. RabbitMQ được tắt trong suite này. |
| [mock-server.test.cjs](mock-server.test.cjs) | Mock HTTP server của Learning | Dữ liệu trong bộ nhớ, gồm cả kịch bản resume mẫu. |
| [app.controller.spec.ts](../src/app.controller.spec.ts) và [app.e2e-spec.ts](app.e2e-spec.ts) | Unit và HTTP smoke test của NestJS | Route gốc của Learning. |

Chạy trên Node.js 24.21.0. Suite tích hợp được chạy trên database và vhost Docker dành riêng cho test, với cả bảy migration hiện có. Dữ liệu mẫu lấy từ [fixture Course và Quiz](fixtures/learning-providers.mock.json).

## Kịch bản và kết quả

| Mã | Bước kiểm thử | Kết quả quan sát |
| --- | --- | --- |
| PRG-01 | Gửi hai request hoàn thành video cùng lúc sau khi học viên có ghi danh. | Cả hai trả `200`, cùng dữ liệu hoàn thành. PostgreSQL có đúng một dòng cho item trong lượt ghi danh. |
| PRG-01 | Đọc tiến độ lesson, thử hoàn thành khi thiếu item, sau đó ghi hoàn thành hai lần đồng thời. | `NOT_STARTED → IN_PROGRESS → COMPLETED`. Thiếu item trả `409 COURSE_REQUIREMENTS_NOT_MET`. Item tùy chọn vẫn có thể là `NOT_STARTED`. Hai request hợp lệ trả cùng `completedAt` và PostgreSQL có một dòng cho lesson. |
| PRG-01 | Thử hoàn thành lesson trong chương bị khóa, gửi body `completed: false`, đọc tiến độ từ tài khoản chưa ghi danh. | Trả lần lượt `403 PREREQUISITE_NOT_COMPLETED`, `400 VALIDATION_ERROR` và `403 ENROLLMENT_REQUIRED`. |
| PRG-02 | Đọc tiến độ trước và sau ghi danh, sau video, sau item bắt buộc cuối và sau bài đánh giá cuối. | Trước ghi danh trả `403`. Sau ghi danh là `NOT_STARTED` và `0%`, sau video là `50%`. Khi xong item cuối, tiến độ lên `100%` nhưng khóa vẫn `IN_PROGRESS`. Điểm cuối đạt thì khóa chuyển `COMPLETED`. |
| PRG-02 | So sánh phần trăm theo item và theo bài. Mở khóa chỉ có bài đánh giá. | Xong video đầu tiên trả `progressPercent: 50` và `lessonProgressPercent: 0`. Xác nhận bài đầu tiên trả `lessonProgressPercent: 50`. Khóa không có bài bắt buộc trả 0%. |
| PRG-03 | Thử hoàn thành item của chương 2 khi chương 1 còn thiếu điều kiện. Gửi lượt quiz `79%` rồi `80%` với policy mẫu yêu cầu `80%`. | Request vào chương 2 trả `403 PREREQUISITE_NOT_COMPLETED`. Điểm `79%` được đồng bộ và chương 2 vẫn `LOCKED`. Điểm `80%` mở chương 2 sau khi video bắt buộc đã hoàn thành. |
| PRG-03 | Hoàn thành video rồi xác nhận hoàn thành lesson của chương 1. Kiểm tra số bài trước và sau khi nhận điểm quiz. | Video đã xong nhưng chưa ghi hoàn thành lesson thì chương báo `0/1` bài. Sau khi xác nhận lesson, chương báo `1/1` và `100%`. Chương 2 vẫn khóa với điểm `79%` và mở với điểm `80%`. Sau khi xác nhận lesson của chương 2, cả hai chương báo `1/1`. |
| PRG-01/02/03/05 | Gửi `contentVersion` sai khi ghi và mô phỏng Course phát hành bản mới. Sau đó bật API giả lập cung cấp lại bản ghi danh. | API trả `409 CONTENT_VERSION_MISMATCH` khi bản cũ chưa có. Khi Course trả bản cũ qua API nội bộ, tiến độ và dashboard dùng đúng số bài của phiên bản đã ghi danh. |
| PRG-04 | Đọc trước khi đồng bộ, gửi hai lượt quiz có điểm 79% và 8/10, rồi giao lại lượt thứ hai với mã event mới. | Ban đầu trả danh sách rỗng. Sau lượt đầu thấy 79% và `passed: false`. Sau lượt thứ hai thấy điểm cao nhất 80%, `passed: true` và đúng hai lượt đã chấm. |
| PRG-04 | Gửi thêm quiz phiên bản khác, quiz luyện tập, điểm trước khi ghi danh và kết quả của học viên khác. | Hai phiên bản có dòng tổng hợp riêng. Quiz luyện tập bị loại. Học viên chỉ thấy điểm của mình từ lượt ghi danh hiện tại. Chủ khóa và Admin thấy các kết quả đã đồng bộ trong khóa, gồm điểm lịch sử. |
| PRG-04 | Đổi danh tính, gửi query lặp hoặc vượt giới hạn, rồi đọc trang 2 và 3 với `limit=1`. | Sai quyền trả `403`, query sai trả `400`. Trang 2 có đúng nhóm thứ hai, trang 3 rỗng và vẫn trả `total: 2`. |
| PRG-05/08 | Đọc dashboard khi có hai khóa rồi lưu vị trí video. Thử tài khoản chưa ghi danh và hủy một lượt ghi danh. | Khóa vừa lưu lên đầu, thời điểm hoạt động và gợi ý khớp vị trí vừa lưu. Tài khoản chưa ghi danh nhận danh sách rỗng và khóa đã hủy biến mất. |
| PRG-05 | Xác nhận bài đầu, gửi quiz 79% rồi 80%, gửi lặp lượt đạt và hoàn thành khóa. | Dashboard gợi ý làm quiz khi chương sau bị khóa, gợi ý mục tiếp theo sau khi chương mở. Điểm gần đây xếp mới nhất trước, không tăng số lần hiển thị khi event lặp. Sau khi hoàn thành khóa, `nextStep: null`. |
| PRG-06 | Tra trạng thái trước và sau khi RabbitMQ giao kết quả. Đổi sang tài khoản khác. | Chủ lượt làm thấy `PENDING → SYNCED`. Tài khoản khác nhận `403 NOT_ATTEMPT_OWNER`. |
| PRG-06 | Cố ý chặn ghi receipt `SYNCED` ở PostgreSQL. Chờ hết retry rồi gửi lại JSON gốc sau khi gỡ lỗi. | Transaction thất bại để lại **0 dòng điểm và 0 receipt** ở lần ghi trực tiếp. Khi consumer hết retry, DLQ giữ đúng JSON gốc, API trả `FAILED` và điểm vẫn chưa được ghi. Gửi lại cùng event thì API trả `SYNCED` và PostgreSQL có đúng một dòng điểm. |
| PRG-07 | Gửi lại cùng event rồi gửi cùng kết quả với `eventId` khác. | Receipt cũ giữ nguyên thời điểm đồng bộ, mã mới đọc được `SYNCED` và lượt làm chỉ có một dòng điểm. Test NestJS cũng xác minh event mâu thuẫn được chuyển vào DLQ. |
| PRG-08 | Mở khóa lần đầu, gửi hai yêu cầu tạo đồng thời rồi gửi hai yêu cầu cập nhật cùng `expectedRevision`. | Ban đầu `data: null`. Mỗi cặp có một kết quả `200` và một `409 REVISION_CONFLICT`. PostgreSQL giữ đúng một dòng. Đọc lại trả đúng vị trí vừa lưu. Tiến độ hoàn thành giữ nguyên. |
| PRG-08 | Lưu video quá thời lượng, lưu bài đọc với và không có số giây, thử sai quan hệ bài và thử mục ở chương khóa hoặc sai thứ tự. | Vị trí sai trả `400`, item ngoài bài trả `422`, mục bị khóa hoặc sai thứ tự trả `403`. Bài đọc hợp lệ lưu `positionSeconds: null`. |
| PRG-08 | Đọc bằng tài khoản khác, hủy ghi danh, dùng lượt ghi danh mới và đổi phiên bản nội dung. | Học viên chưa ghi danh hoặc đã hủy ghi danh nhận `403`. Lượt ghi danh hoặc phiên bản mới không đọc mốc cũ. Course trả sai phiên bản cho mốc đang có thì Learning trả `409 CONTENT_VERSION_MISMATCH`. |
| PRG-01/02/03 | Hoàn thành bài chỉ có nội dung tùy chọn và thử đi tắt qua bài bắt buộc chỉ khai báo ở policy chương. | Bài tùy chọn không tăng số bài bắt buộc đã hoàn thành. Các mục bắt buộc của chương vẫn chặn học sai thứ tự. |
| PRG-01/03 | Gửi kết quả 60% đã đạt theo ngưỡng 60%, trong khi policy ghi danh yêu cầu 70%. | Mục quiz giữ `NOT_STARTED`, xác nhận hoàn thành bài trả `409`. Kết quả đúng policy sau đó cho phép hoàn thành. |
| PRG-05 | Tạo 12 kết quả đúng phiên bản rồi thêm kết quả mới hơn thuộc phiên bản khác. | Dashboard chỉ trả 10 kết quả đúng phiên bản, theo thứ tự thời gian chấm mới nhất trước. |
| PRG-06/07 | Ghi đồng thời hai event ID cho cùng lượt làm, sau đó gửi điểm mâu thuẫn và event có `maxScore: 0` qua RabbitMQ. | PostgreSQL có một dòng điểm và hai receipt `SYNCED`. Event mâu thuẫn vào DLQ với `EVENT_CONFLICT`, event sai vào DLQ với `INVALID_RESULT`. Điểm và receipt gốc giữ nguyên. |
| PRG-01–08 | Chạy trọn luồng Postman từ chưa học, lưu vị trí, hoàn thành bài, quiz 79%, quiz 80%, hoàn thành bài sau và quiz cuối, rồi gửi lại kết quả cuối. | Khóa chuyển `NOT_STARTED → IN_PROGRESS → COMPLETED`. Dashboard gợi ý đúng bước, chương mở đúng điều kiện, bảng điểm đúng quyền và gửi lặp giữ nguyên kết quả. |

## Lỗi phát hiện và bản sửa

**PRG-01 · UUID viết hoa bị báo không tìm thấy.** Trước bản sửa, gửi cùng mã item hợp lệ bằng chữ hoa nhận `404`. Controller hiện chuẩn hóa UUID trên các đường dẫn Progress về chữ thường trước khi xử lý. Test tái hiện lỗi đã qua với `200` sau bản sửa. [Controller](../src/modules/progress/progress.controller.ts)

**PRG-01/03 · Mục quiz có thể bị tính hoàn thành theo ngưỡng khác policy.** Trước bản sửa, kết quả có `passed: true` theo ngưỡng 60% có thể hoàn thành mục quiz dù policy yêu cầu 70%. Luật bằng chứng hiện đối chiếu loại quiz, trạng thái đạt và ngưỡng cấu hình khi quiz nằm trong yêu cầu đánh giá của khóa hoặc chương. Test xác minh chặn hoàn thành bài với kết quả sai ngưỡng và chấp nhận kết quả đúng policy. [Luật áp dụng kết quả quiz](../src/modules/progress/rules/progress-evidence.ts)

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
- PRG-04 cần xác minh Course trả đúng `instructorId` của khóa và luồng xác thực khi ghép gateway. Test hiện dùng `MockAuthGuard`.
- PRG-02/05 cần xác minh Course thật giữ và trả bản cấu trúc cũ qua `getLearningStructure`. Bản Course đã đối chiếu trên `origin/main` hiện kiểm tra phiên bản được yêu cầu với phiên bản hiện tại và có thể trả `409` cho bản cũ.
- PRG-06 và PRG-07 trong report được kiểm thử cho `quiz.attempt.graded.v2`. Luồng đồng bộ các loại event khác thuộc phạm vi kiểm thử riêng khi có consumer tương ứng.
