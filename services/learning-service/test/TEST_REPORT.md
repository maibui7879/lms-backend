# Báo cáo kiểm thử luồng Learning

## Rà soát toàn nhánh Learning sau thay đổi ghi danh lại

Đối chiếu **PRG-01–08, MST-01–07, ADP-01–07, CERT-01–07 và INS-03/06/07/09** trên NestJS với PostgreSQL, RabbitMQ và các nguồn dữ liệu giả lập. Hai lượt rà độc lập dùng PostgreSQL tách riêng.

Một lượt độc lập đạt **53/53 E2E** và **4/4 ca bổ sung** về ghi đồng thời, đổi lượt và phiên bản checkpoint. Lượt còn lại đạt **47 ca E2E** trong lượt chạy chung, **ca QR/PDF chạy riêng đạt** và **3/3 ca bổ sung** về giao thoa CERT, MST và ADP. Ca Poppler vượt giới hạn 20 giây lúc chạy song song. Đã tăng giới hạn của riêng ca render và quét QR lên 45 giây.

Hồi quy cuối đạt **106/106 E2E**, gồm tải PDF và đọc QR trước và sau thu hồi. Đạt thêm **37/37 unit**, **22/22 HTTP mock** và **9/9 contract**. TypeScript và lint đạt. Có thể bàn giao phần Learning của TV4 trong phạm vi mock.

| Ca kiểm thử | Kết quả |
| --- | --- |
| PRG-08 lưu vị trí từ tab cũ | Tái hiện trước sửa. Lượt mới cấp lại revision 1, nên yêu cầu từ lượt cũ có revision 1 trả 200 và ghi đè vị trí. Sau sửa, số revision tiếp tục tăng trong cùng ID và phiên bản. Yêu cầu giữ revision cũ trả `409 REVISION_CONFLICT` kể cả sau khi đã lưu vị trí ở lượt mới. |
| Ghi song song và chuyển lượt | Hai yêu cầu lưu cùng revision cùng lúc cho kết quả một 200, một 409. Yêu cầu hoàn thành item đã lấy snapshot lượt A rồi ghi sau khi Course chuyển sang lượt B vẫn ghi riêng vào A. Tiến độ của B giữ nguyên. |
| Tiến độ, mastery, gợi ý và báo cáo | Lượt mới bắt đầu với số bài bằng 0 và vị trí học rỗng. Mastery và gợi ý dùng bằng chứng của lượt hiện tại. Quiz đang khóa chỉ mở sau khi học viên hoàn thành nội dung bắt buộc của lượt mới. |
| Chứng chỉ | Cùng học viên, khóa và phiên bản đã có chứng chỉ thì trả lại chứng chỉ đó dù tiến độ lượt mới bắt đầu lại. Nếu chưa có chứng chỉ, bằng chứng của lượt cũ không cấp được chứng chỉ cho lượt mới. Tải PDF theo quyền và mã xác minh tiếp tục hoạt động. |
| Migration trên dữ liệu cũ | Giữ cả ba loại bản ghi cũ và thêm được dữ liệu cho lượt mới. Thử rollback khi đã có hai lượt cùng khóa cũ nhận lỗi ràng buộc PostgreSQL và giao dịch giữ nguyên các bản ghi. |

API hoàn thành chọn lượt ghi danh Course trả tại thời điểm xử lý yêu cầu. Hành vi gửi lại thao tác đang chờ tại trình duyệt sau khi đổi lượt cần dấu lượt học từ client nếu nhóm muốn phân biệt với một thao tác mới. Phạm vi kiểm thử dùng hợp đồng HTTP hiện tại.

[Ca chống ghi đè trong E2E](instructor-reports.db.e2e-spec.ts) · [Luồng và vị trí code](../../../WORK.md#tách-tiến-độ-khi-ghi-danh-lại)

## Ghi danh lại giữ nguyên ID và phiên bản

**PRG-01/02/05/08 và INS-03.** Course giả lập trả cùng `enrollmentId` và `contentVersion` với `enrolledAt` mới. Qua HTTP NestJS và PostgreSQL, học viên cũ có 1/2 bài và một vị trí đã lưu. Sau hủy, API học viên trả 403 và chi tiết giảng viên trả 404. Sau ghi danh lại, tiến độ là 0/2, vị trí học tiếp là `null`. Gửi revision cũ lúc lượt mới chưa có vị trí trả 409. Học và lưu vị trí lại thành công, PostgreSQL vẫn chứa dữ liệu của cả hai lượt. [Ca kiểm thử E2E](instructor-reports.db.e2e-spec.ts)

**Dữ liệu cũ.** Đã thử migration trên PostgreSQL có sẵn dữ liệu item, bài và vị trí học. Cả ba bản ghi giữ nguyên dữ liệu, và cùng ID có thể lưu thêm bản ghi của lượt mới. Ca API riêng xác nhận dữ liệu cũ ghi trước mốc học mới được giữ lại trong PostgreSQL và không xuất hiện trong tiến độ hiện tại.

**Hồi quy.** Đạt **106/106 E2E**, **37/37 unit** và **22/22 mock HTTP**. TypeScript và lint đạt.

## Rà soát bàn giao toàn nhánh Learning

Phạm vi TV4 gồm **PRG-01 đến PRG-08, MST-01 đến MST-07, ADP-01 đến ADP-07, CERT-01 đến CERT-07 và INS-03/06/07/09**. Kiểm thử HTTP trực tiếp vào Learning NestJS dùng PostgreSQL và RabbitMQ thật. Course, Quiz, Identity và tài khoản được giả lập. Lượt kiểm thử CERT tải PDF thật và giải mã QR từ PDF bằng Poppler.

**Kết luận bàn giao.** Có thể đóng phần TV4 trong phạm vi mock để chuyển sang ghép nhóm. Lượt hồi quy cuối đạt **104/104 E2E**, **37/37 unit**, **22/22 HTTP mock** và **9/9 contract**. Build, TypeScript và lint đạt. Lượt chạy trước đạt đủ 104 ca nhưng vượt thời gian ở bước dọn môi trường thử nghiệm. Lượt cuối đã hoàn tất cả bước dọn.

| Nhóm | Luồng đã xác nhận |
| --- | --- |
| PRG | Ghi hoàn thành bài, tính tiến độ theo policy, mở chương đúng điều kiện, lưu vị trí học, dùng snapshot lúc ghi danh. RabbitMQ giao lại, phục hồi và DLQ hoạt động. |
| MST | Tính tổng điểm chia tổng điểm tối đa, dùng đúng bằng chứng theo kỹ năng, lọc lượt sai phiên bản và lưu lịch sử theo lần chấm. |
| ADP | Chỉ gợi ý nội dung học viên mở được và quiz còn lượt. Kiểm tra thứ tự, tiên quyết, vòng lặp, xu hướng và đồng bộ với luật mở chương. |
| CERT | Cấp một chứng chỉ cho một học viên, khóa và phiên bản. Chỉ cấp bản thay thế khi học lại đủ điều kiện. Tải PDF theo quyền, quét QR trước và sau thu hồi. |
| INS | Danh sách và chi tiết theo bài khớp Progress. Tỷ lệ hoàn thành theo policy, kỹ năng yếu khớp Mastery, biểu đồ tách phiên bản quiz và phân quyền giảng viên. |

**Lỗi liên module phát hiện và đã sửa.**

- Kết quả quiz có `gradedAt` trong tương lai từng mở chương và xuất hiện trong bảng điểm trước thời điểm hiệu lực. Repo đọc giới hạn theo giờ PostgreSQL. PRG, MST, ADP, INS và CERT chỉ dùng điểm đã đến mốc. Receipt `SYNCED` vẫn xác nhận sự kiện đã được lưu.
- Việc sửa nội dung từng đẩy một khóa lên đầu dashboard dù học viên chưa học thêm. Dashboard và INS dùng chung cách tính lần học thực tế. `progress.updatedAt` vẫn ghi nhận cập nhật của Course.
- Khi Course dùng lại `enrollmentId` cho phiên bản mới với mốc ghi danh cũ, điểm phiên bản quiz không đổi từng đủ để cấp chứng chỉ thay thế. Learning từ chối nếu mốc học lại của ID dùng lại chưa sau thời điểm cấp bản cũ. Khi mốc đúng và học viên làm lại đủ, chứng chỉ mới được cấp và bản cũ chuyển `SUPERSEDED`.

**Rà độc lập sau sửa.** Một agent đạt **92/92 E2E** trên tám suite và **3/3 ca bổ sung** về giờ chấm, lần học gần nhất và lượt học lại. Agent còn lại đạt **54/54 E2E** trên bốn suite và **4/4 ca bổ sung** về cấp lại, quiz tương lai và xác nhận bài sau migration. Hai lượt chạy dùng database riêng và có suite trùng nhau. [PRG/MST qua RabbitMQ](learning-workflow.db.e2e-spec.ts) · [INS qua HTTP](instructor-reports.db.e2e-spec.ts) · [CERT và QR](certificates.db.e2e-spec.ts)

**Điểm cần ghép với nhóm.**

- **Course.** Xác nhận snapshot lịch sử và `contentVersion` của các item sau khi duyệt revision, mốc `enrolledAt` khi tự nguyện học lại, cấu hình migration, `skillIds`, quyền Admin xem roster và `classId`. Ref `origin/main` local `0e63d67` cho thấy khi serialize outline, item có thể vẫn mang phiên bản gốc trong khi outline mang phiên bản mới. Ca giả lập tương ứng xác nhận Learning trả `503`.
- **Quiz.** Chạy publisher `quiz.attempt.graded.v2`, nối kiểm tra kỹ năng, `questionCount` và quyền làm quiz theo phiên bản. Chốt với Course ngưỡng đạt của snapshot. Nếu lượt bắt đầu trước học lại nhưng được chấm sau cần bị loại, Quiz phải cung cấp căn cứ nhận diện lượt học hoặc thời điểm bắt đầu theo contract.
- **Gateway và Identity.** Đối chiếu xác thực và vai trò thật, dữ liệu tên người nhận, route tải PDF và URL xác minh QR công khai. Luồng Notification/Analytics có thể ghép khi có consumer cho các sự kiện tùy chọn.

## Rà soát độc lập và kiểm thử xung đột INS-03, INS-06, INS-07 và INS-09

Bộ INS dùng HTTP NestJS, PostgreSQL và Course giả lập. Lượt cuối của bộ API INS đạt **12/12**. Hai agent chạy độc lập với cơ sở dữ liệu riêng. Một lượt kiểm tra thêm danh sách 102 học viên và chạy lại 2/2 ca tái hiện sau sửa. Lượt còn lại đạt 34/34 ca (11 INS, 13 ADP, 10 Course Skills/MST) sau sửa. [Bộ kiểm thử INS](instructor-reports.db.e2e-spec.ts)

Hồi quy cuối đạt **103/103 E2E**, **37/37 unit**, **22/22 mock HTTP** và **9/9 contract**. TypeScript và lint đạt. Có thể đóng bốn chức năng INS của Learning trong phạm vi mock.

| Ca đối chiếu | Kết quả |
| --- | --- |
| INS-03 và cập nhật khóa | Từng gặp báo cáo lấy trạng thái bài sau cập nhật và mốc tiến độ trước cập nhật. Sau khi đọc dữ liệu tiến độ của từng học viên trong cùng ảnh chụp PostgreSQL, lần đọc đang chạy thấy trạng thái cũ đầy đủ và lần đọc kế tiếp thấy trạng thái mới đầy đủ. |
| INS-03 và đổi phiên bản quiz | Từng mất mốc làm quiz cũ khi Course yêu cầu phiên bản mới. Sau sửa, quiz cũ giữ vai trò mốc hoạt động. Điểm của phiên bản ngoài lượt học bị loại và điều kiện hoàn thành dùng phiên bản mới. |
| INS-07/09 và cấu trúc Course | Từng mất điểm ở INS-09 khi UUID quiz viết hoa và từng chấp nhận item thuộc sai khóa hoặc sai phiên bản. Bộ kiểm tra chung nay chuẩn hóa UUID và trả 503 đối với cấu trúc sai. |
| INS đối chiếu PRG và MST | Hoàn thành bài qua API học viên, nhận điểm quiz giả lập và gửi lại cùng event. Danh sách, chi tiết và tiến độ học viên khớp. Tỷ lệ hoàn thành đổi sau khi đạt đủ policy, điểm yếu khớp với mastery và biểu đồ tính điểm một lần cho mỗi lượt chấm. |
| Phân trang Course | Dữ liệu 102 học viên trả đúng chi tiết của người ở trang sau. Trả 503 khi Course gửi trùng người hoặc thay đổi tổng số trong lúc tổng hợp. |

Phạm vi ghép thật gồm quyền Admin ở Course, `classId` và sự kiện chấm điểm từ Quiz. [Kế hoạch INS](../../../PLAN.md#dashboard-giảng-viên--ins-03-ins-06-ins-07-và-ins-09)

## Báo cáo giảng viên — INS-03, INS-06, INS-07 và INS-09

Đạt **6/6 ca HTTP** gọi API NestJS với PostgreSQL thật, Course giả lập và dữ liệu điểm ghi qua repository đồng bộ. [Bộ ca kiểm thử](instructor-reports.db.e2e-spec.ts)

Hồi quy đạt **97/97 E2E**, **22/22 mock HTTP**, **37/37 unit** và **9/9 contract**. TypeScript và lint đạt. Hai lượt chạy đầu gặp lỗi ADP khi thời điểm ghi của PostgreSQL đi trước giờ ứng dụng. Báo cáo và gợi ý học dùng mốc giờ đọc từ PostgreSQL để đọc được tiến độ vừa ghi và tiếp tục loại điểm chấm ở tương lai.

| Mã | Kết quả kiểm thử |
| --- | --- |
| INS-03 | Hai lượt ghi danh bản 1 và bản 2 hiển thị đúng mẫu số bài, phân trang đúng. Chi tiết có tên bài, thời điểm hoàn thành và lần học gần nhất. Yêu cầu học lại làm mất hiệu lực hoàn thành bài và giữ mốc hoạt động của học viên. Kiểm tra cả quyền Admin giả lập, giảng viên ngoài khóa, thiếu xác thực, người ngoài khóa và phản hồi Course sai snapshot. |
| INS-06 | Học đủ bài nhưng thiếu quiz bắt buộc vẫn cho tỷ lệ hoàn thành 0%. Khi một trong hai học viên đạt đầy đủ policy, tỷ lệ là 50%. Kiểm tra biên lọc ngày ghi danh và nhóm rỗng. |
| INS-07 | Đếm theo học viên cho từng kỹ năng, dùng ngưỡng mastery và đủ ít nhất 5 câu đã chấm. Loại bằng chứng thiếu số câu hỏi khỏi thống kê. |
| INS-09 | Kiểm tra phân bố tiến độ, số bài hoàn thành theo ngày, phân bố và trung bình điểm, tách phiên bản quiz, loại quiz luyện tập, lọc thời gian và lớp, cùng trường hợp nhà cung cấp thiếu dữ liệu lớp. |

Chạy từ thư mục gốc khi PostgreSQL thử nghiệm đã cấu hình qua `TEST_DATABASE_URL`.

```powershell
npm.cmd run test:e2e -w @lms/learning-service -- --runInBand instructor-reports.db.e2e-spec.ts
```

Khi ghép thật, xác nhận quyền Admin và trường `classId` từ Course cùng dữ liệu điểm đi qua luồng đồng bộ của Quiz.

## Chốt lại CERT-01 đến CERT-07 sau khi thống nhất khóa chống trùng

Hai agent kiểm thử độc lập trên hai database PostgreSQL riêng, mỗi lượt đạt 10/10 E2E chứng chỉ có đọc QR từ PDF và 4/4 ca mock HTTP của nhóm CERT. Lượt hồi quy toàn Learning đạt 91/91 E2E, 22/22 mock HTTP, 37/37 unit và 9/9 contract. TypeScript và lint đạt.

| Phạm vi | Kết quả |
| --- | --- |
| CERT-01/04/06 | Chỉ cấp khi học viên đủ điều kiện của phiên bản ghi danh. Gửi đồng thời hoặc ghi danh lại cùng phiên bản vẫn trả cùng chứng chỉ. Bản cũ giữ `ACTIVE` khi đang học bản mới hoặc khi lưu PDF bản mới thất bại. Cấp bản mới thành công gắn liên kết thay thế cho bản cũ. |
| CERT-02/03 | Chủ sở hữu tải đúng PDF đã lưu. Tải lại PDF bản cũ khi `SUPERSEDED` trả cùng nội dung. Sau thu hồi, yêu cầu tải trả `409 CERTIFICATE_REVOKED`. |
| CERT-05/07 | Quét cùng QR bản cũ nhận `SUPERSEDED`, `valid: true` sau khi có bản thay thế, rồi `REVOKED`, `valid: false` sau thu hồi. QR bản mới tiếp tục `ACTIVE`. Chỉ Admin thu hồi được và gửi lặp giữ thông tin lần đầu. |

Lượt thử độc lập bổ sung cho cấp bản 2 đồng thời với Admin thu hồi bản 1 trả đúng bản 2 `ACTIVE`, bản 1 `REVOKED` và giữ liên kết bản 1 sang bản 2. Gửi lại key cấp bản 1 trả `409 CERTIFICATE_REVOKED`.

Đủ điều kiện đóng phần Learning dùng mock. Lúc ghép thật, cần xác nhận phiên bản và mốc bắt đầu lượt học lại từ Course, quyền Admin qua xác thực thật và URL QR từ ngoài máy chạy service. Đối với quiz giữ nguyên phiên bản, Learning hiện lọc điểm theo thời điểm chấm. Course và Quiz cần thống nhất cách xử lý lượt làm bắt đầu trước mốc học lại nhưng chấm sau mốc đó. [Bộ ca kiểm thử](certificates.db.e2e-spec.ts)

## CERT-06 — Đồng bộ contract vòng đời chứng chỉ

**Kết quả.** 91/91 E2E Learning, gồm 10 ca chứng chỉ. 22/22 mock HTTP, 37/37 unit và 9/9 contract. TypeScript và lint đạt. Đã dùng PostgreSQL cùng Course và Identity giả lập, đọc QR trực tiếp từ PDF tải qua HTTP. Các báo cáo bên dưới ghi kết quả của từng lượt trước khi đồng bộ contract này.

| Ca kiểm thử | Kết quả |
| --- | --- |
| Cấp lại và chống trùng | Bản 1 giữ `ACTIVE` đến khi lưu bản 2 thành công. Gửi nhiều yêu cầu cấp bản 2 đồng thời hoặc đổi ID ghi danh nhưng giữ cùng phiên bản đều trả cùng chứng chỉ. Khi lưu PDF lỗi, bản 1 vẫn `ACTIVE`. |
| Danh sách và gửi lại yêu cầu cấp | Bản 2 là `ACTIVE` với liên kết `null`. Bản 1 là `SUPERSEDED` với `supersededByCertificateId` bằng ID bản 2, kể cả sau khởi động lại. Gửi lại key bản 1 giữ ID và mã của bản 1, trả trạng thái vòng đời hiện tại. |
| QR và thu hồi | QR bản 1 trả `SUPERSEDED` với `valid: true` sau khi có bản thay thế, rồi trả `REVOKED` với `valid: false` sau thu hồi. Bản 2 vẫn `ACTIVE`. Mã lạ trả `status: null` và `valid: false`. |
| Dữ liệu cũ | Chạy migration trên hai bản ghi theo schema cũ. PostgreSQL điền đúng liên kết từ bản đã thay thế sang bản kế tiếp. |

**Quy tắc đã chốt.** Nhóm thống nhất dùng `(userId, courseId, contentVersion)` cho khóa chống cấp trùng. Contract và OpenAPI trên nhánh Learning đã ghi rõ quy tắc này. Ca chèn trực tiếp một chứng chỉ `REVOKED` cùng học viên, khóa và phiên bản với `enrollmentId` khác bị PostgreSQL từ chối với mã `23505`. Lượt kiểm thử sau khi chốt đạt 10/10 ca API chứng chỉ, 22/22 mock HTTP và 9/9 contract. Ca quét QR dùng kết nối mới cho mỗi lượt gọi xác minh sau khi gặp một lần `ECONNRESET`. Luồng học lại thật cần Course trả phiên bản học viên đã chọn và mốc bắt đầu lượt học lại. [Ca kiểm thử](certificates.db.e2e-spec.ts) · [Quy tắc trên contract](../../../packages/contracts/README.md#learning-completion-resume-certificate)

## Rà soát độc lập và chốt CERT-01 đến CERT-07 với mock

Hai agent chạy độc lập bộ API chứng chỉ trong các database PostgreSQL riêng, có Poppler để đọc QR từ PDF tải qua HTTP. Mỗi lượt xác nhận 9/9 ca CERT. Lượt kiểm thử hồi quy toàn Learning đạt 90/90 E2E, 22/22 mock HTTP, 37/37 unit và 8/8 contract. TypeScript và lint đạt.

| Chức năng | Kết quả rà soát và kiểm thử |
| --- | --- |
| CERT-01 — Xét điều kiện | Thiếu bài hoặc quiz, điểm chấm ở tương lai, hoặc tắt cấp chứng chỉ đều không cấp được. Policy rỗng bị Course adapter từ chối với 503. Ghi danh hợp lệ có UUID khác chữ hoa/thường vẫn cấp được sau khi chuẩn hóa. |
| CERT-02 — Tạo PDF | PDF dùng tên tiếng Việt lấy từ mock Identity, giữ nội dung gốc sau khi đổi tên. Lỗi ghi PDF không đổi hiệu lực bản cũ. |
| CERT-03 — Danh sách và tải PDF | Chủ sở hữu tải đúng PDF đã lưu. Tài khoản khác nhận 404. PDF cũ đang đợi Identity ngay lúc Admin thu hồi trả `409 CERTIFICATE_REVOKED`, PostgreSQL không lưu thêm PDF. |
| CERT-04 — Mã duy nhất | 12 POST đồng thời cùng phiên bản chỉ tạo một chứng chỉ. Ràng buộc PostgreSQL từ chối mã xác minh trùng. |
| CERT-05 — Xác minh | Cùng QR đọc từ PDF trả `200`, `ACTIVE`, `valid: true` trước thu hồi và `200`, `REVOKED`, `valid: false` sau thu hồi. Mã lạ và bản thay thế trả `NOT_FOUND` và `SUPERSEDED`. |
| CERT-06 — Cấp lại | Bản 1 còn hiệu lực đến khi hoàn thành và lưu thành công bản 2. Ở lượt ghi danh mới, quiz giữ nguyên `assessmentVersion` vẫn bỏ điểm chấm trước `enrolledAt` của lượt mới. Cấp bản 2 đồng thời với Admin thu hồi bản 1 giữ đúng trạng thái `ACTIVE` và `REVOKED`. |
| CERT-07 — Thu hồi | Chỉ Admin được thu hồi. Gửi lặp giữ nguyên audit. Chuỗi Unicode có ký tự surrogate đơn bị trả `400`. Lý do có tiếng Việt và emoji hợp lệ được lưu và trả nguyên vẹn. |

**Kết luận.** Đóng nhóm CERT ở phạm vi Learning dùng mock. Khi ghép thật, xác nhận Course trả phiên bản học viên chọn và `enrolledAt` của lượt học lại, kể cả trường hợp quiz giữ nguyên phiên bản. Kiểm tra lại quyền Admin với xác thực thật, route qua Gateway và địa chỉ xác minh QR từ thiết bị bên ngoài. [Bộ kiểm thử](certificates.db.e2e-spec.ts) · [Mô tả chức năng](../../../WORK.md#cert-07--admin-thu-hồi-chứng-chỉ)

## CERT-07 — Thu hồi bằng API Admin và quét QR

**Kết quả.** 87/87 E2E Learning, gồm 6 ca chứng chỉ. 22/22 mock HTTP, 37/37 unit và 8/8 contract. TypeScript và lint đạt. Luồng NestJS dùng PostgreSQL thật trong môi trường test, còn tài khoản, Course và Identity dùng fixture giả lập.

| Ca kiểm thử | Kết quả |
| --- | --- |
| Chỉ Admin thu hồi được | Không xác thực nhận `401`. `studentB` và `instructorA` nhận `403` kể cả khi tự thêm header khai vai trò Admin. `adminA` nhận `200`. Lý do trắng, quá 500 ký tự hoặc chứa ký tự NUL nhận `400`, ID không có nhận `404`. |
| Gửi lại và lưu audit | Hai yêu cầu đồng thời trả cùng bản ghi. Gửi lại với lý do khác vẫn trả lý do, Admin và thời điểm ban đầu. PostgreSQL từ chối cập nhật trực tiếp sang `REVOKED` nếu thiếu audit. |
| Quét cùng QR trước và sau thu hồi | Đọc URL từ ảnh dựng của PDF tải qua HTTP, nhận `200` với `ACTIVE` và `valid: true` trước khi thu hồi. Sau đó cùng URL trả `200` với `REVOKED` và `valid: false`, các trường thông tin là `null`, không có audit và phản hồi dùng `Cache-Control: no-store`. |
| Cấp hoặc tải sau thu hồi | Chủ sở hữu nhận `409 CERTIFICATE_REVOKED` khi tải hoặc gửi cấp lại cùng phiên bản, kể cả với key cũ. PDF được giữ trong PostgreSQL. Học và hoàn tất phiên bản mới vẫn cấp được chứng chỉ mới. |
| Phân biệt trạng thái | Mã lạ trả `NOT_FOUND`, mã bản đã thay thế trả `SUPERSEDED`. Admin có thể thu hồi bản đã thay thế và chứng chỉ phiên bản mới tiếp tục `ACTIVE`. |

[Ca kiểm thử](certificates.db.e2e-spec.ts) · [Cách gọi API](../../../WORK.md#cert-07--admin-thu-hồi-chứng-chỉ)

## CERT-02/03/05 — Tạo PDF, tải file và xác minh QR

**Kết quả.** 86/86 E2E Learning, gồm 5 ca chứng chỉ. 21/21 mock HTTP, 37/37 unit và 8/8 contract. TypeScript và lint đạt. Luồng chứng chỉ dùng NestJS và PostgreSQL cùng Course, Identity giả lập.

| Ca kiểm thử | Kết quả |
| --- | --- |
| PDF tiếng Việt | Dựng ảnh từ file tải qua API và kiểm tra bố cục một trang. Trích xuất lại đúng `Nguyễn Thị Ánh Dương`, `NestJS căn bản` và `CHỨNG CHỈ HOÀN THÀNH`. |
| Tải file và quyền sở hữu | Chủ sở hữu nhận `200 application/pdf` và tên file `.pdf`. Người khác và ID không có nhận `404`, thiếu đăng nhập nhận `401`, ID sai dạng nhận `400`. Đổi tên hồ sơ sau khi cấp vẫn nhận đúng byte PDF đã lưu. |
| Quét QR từ PDF | Poppler dựng PNG ở 150 dpi. Bộ đọc QR giải mã URL từ ảnh, gọi đúng API và nhận `200` với `valid: true`. Địa chỉ trong ca này là NestJS cục bộ đang chạy trong test. |
| Lỗi nguồn tên và lỗi ghi PDF | Identity trả hồ sơ sai người thì API cấp trả 503 và không tạo chứng chỉ. Khi mô phỏng lỗi lưu PDF bản 2, bản 1 giữ hiệu lực, key cấp lại chưa được lưu, lần thử tiếp theo cấp thành công. |
| Chứng chỉ cũ chưa có PDF | Hai request tải đồng thời nhận cùng PDF và chỉ lưu một tài liệu cho chứng chỉ cũ. Gửi cấp lại trả cùng ID chứng chỉ. |

[Ca kiểm thử](certificates.db.e2e-spec.ts) · [Cách gọi API và chạy thử](../../../WORK.md#cert-020305--tạo-pdf-tải-pdf-và-xác-minh-qua-qr)

## CERT-01/04/06 — API NestJS và PostgreSQL

**Kết quả.** 83/83 E2E Learning, gồm 2 ca API chứng chỉ. 21/21 mock HTTP, 37/37 unit, TypeScript và lint đạt. Hai ca chứng chỉ chạy PostgreSQL cục bộ và Course giả lập qua HTTP. Điểm quiz lấy từ fixture và được lưu vào PostgreSQL qua repository Learning.

| Ca kiểm thử | Kết quả |
| --- | --- |
| CERT-01 cấp lần đầu | Thiếu đăng nhập trả 401, thiếu key trả 400, người chưa ghi danh trả 403. Hoàn thành 100% bài nhưng chưa có điểm quiz cuối hợp lệ, hoặc policy tắt cấp, trả 409. |
| CERT-04/06 cấp đồng thời | 12 POST cùng phiên bản với key giống và khác đều trả 201 với cùng ID và mã. PostgreSQL chỉ có một dòng. Thử ghi trực tiếp chứng chỉ trùng phiên bản, trùng mã hoặc thêm bản hiện hành thứ hai đều bị ràng buộc database từ chối. |
| CERT-06 gửi lại | Key còn hạn giữ đúng chứng chỉ của lần cấp trước. Key hết hạn khi vẫn yêu cầu cùng phiên bản trả bản đã lưu. Tài khoản khác dùng cùng key không nhận được kết quả của học viên. |
| CERT-06 cấp lại bản 2 | Xuất bản bản 2 mà ghi danh còn ở bản 1 vẫn trả bản 1. Sau khi giả lập chọn học bản 2, điểm quiz của bản 1 không đủ để cấp bản 2. Hoàn thành bản 2 rồi gửi ba POST đồng thời nhận cùng một chứng chỉ mới. |
| CERT-06 lỗi ghi và khởi động lại | Giả lập lỗi khi chèn chứng chỉ bản 2 sau bước đánh dấu bản cũ. API trả 503, bản 1 vẫn hợp lệ và key mới chưa được lưu. Thử lại thành công, bản 1 chuyển `SUPERSEDED` cùng giao dịch cấp bản 2. Khởi động lại NestJS vẫn đọc được cả hai bản từ PostgreSQL. |
| Danh sách và xác minh | Học viên thấy lịch sử của mình. Mã bản hiện hành xác minh `valid: true`. Mã bản thay thế và mã lạ trả `valid: false`. |

Việc tích hợp API học lại của Course thật cần kiểm tra khi contract được cập nhật. [Ca kiểm thử](certificates.db.e2e-spec.ts) · [Mô tả luồng](../../../WORK.md#cert-010406--cấp-chứng-chỉ-và-chống-cấp-trùng-bằng-postgresql)

## CERT-01/04/06 — Mock cấp chứng chỉ

**21/21 mock HTTP đạt**, gồm ba ca chứng chỉ. Mock dùng trạng thái Progress của bản 1 và fixture Course cho luồng học lại bản 2.

| Ca kiểm thử | Kết quả |
| --- | --- |
| CERT-01 học 100% bài nhưng chưa đạt quiz cuối, hoặc khóa hoàn thành nhưng chức năng cấp bị tắt | Trả `409 CERTIFICATE_NOT_ELIGIBLE`. |
| CERT-04/06 gửi đồng thời cùng key và khác key, rồi thử lại khi key đã hết hạn | Cùng ID và mã xác minh. Danh sách chỉ có một chứng chỉ cho bản 1. |
| CERT-06 xuất bản bản 2, tự chọn học lại, hoàn thành và yêu cầu cấp đồng thời | Bản 1 còn hợp lệ đến lúc cấp bản 2. Sau cấp, bản 2 hợp lệ, bản 1 hiện trong lịch sử và trả `valid: false` khi xác minh. Gửi lại key cũ còn hạn vẫn trả dữ liệu của lần cấp bản 1. |

Bộ kiểm thử này dùng dữ liệu trong bộ nhớ. Kết quả kiểm thử ràng buộc và giao dịch PostgreSQL nằm trong mục API NestJS ở trên. [Cách thử Postman](../../../WORK.md#cert-010406--cấp-chứng-chỉ-và-chống-cấp-trùng-mock)

## Đối chiếu độc lập ADP với hai agent

**Bản cuối đạt 81/81 E2E**, gồm 13 ca ADP và 6 ca mới so với lượt trước. Lượt kiểm thử cũng đạt 18/18 mock HTTP, 37/37 unit, 8/8 contract. TypeScript và lint đạt.

| Lượt | Kết quả trước khi sửa |
| --- | --- |
| Agent rà quyền và phiên bản | 37/37 unit, 18/18 mock HTTP, 18/18 E2E gồm 7 ca ADP và 11 ca Course snapshot. Gọi NestJS để tái hiện trang ghi danh rỗng báo tổng 401 khiến Learning đọc 5 trang. |
| Agent rà đồ thị và lịch sử | 37/37 unit, 18/18 mock HTTP, 7/7 E2E ADP. Gọi trực tiếp thêm 19 request NestJS với PostgreSQL riêng để kiểm tra chu trình ba cạnh, ghi đồng thời, ngừng dùng kỹ năng và mốc chấm tương lai. |

| Ca hồi quy | Sửa trong Learning |
| --- | --- |
| Policy của chương đầu trỏ đến mã chương lạ làm bài chương sau xuất hiện dù chưa đạt quiz | Từ chối snapshot với 503 nếu policy trỏ sai chương, trùng chương, dùng item của chương khác hoặc policy cấp khóa tham chiếu item không tồn tại. |
| Course báo trang ghi danh rỗng nhưng tổng là 401 | Trả 503 ngay trang đầu nếu số bản ghi không khớp tổng và phân trang. |
| Một lượt 100% có ngày chấm sau 7 ngày làm thay đổi điểm dùng để gợi ý ngay. Một điểm quiz qua chương trong tương lai cũng có thể mở gợi ý sớm | ADP dùng cùng một mốc thời gian cho điểm, xu hướng và quyền mở bài/quiz. Các bản ghi tương lai vẫn được lưu và chỉ tham gia gợi ý khi đến thời điểm hiệu lực. |

Hai agent hoàn thành lượt độc lập trước khi hết hạn mức. Agent chính phụ trách sửa và kiểm thử lại. Mốc thời gian chặn dữ liệu tương lai áp dụng cho luồng gợi ý ADP. Kiểm tra quy ước đồng hồ với Course và Quiz khi ghép thật.

## Rà soát lại logic ADP-01 đến ADP-07

**Kết quả sau bản sửa.** 75/75 E2E Learning với PostgreSQL và RabbitMQ cục bộ, 18/18 mock HTTP, 37/37 unit và 8/8 contract. TypeScript và lint đạt.

| Ca rà soát | Kết quả |
| --- | --- |
| Course trả item sai khóa, sai phiên bản hoặc bài gắn nhầm chương | Trước bản sửa API chấp nhận dữ liệu sai. Sau bản sửa API trả 503 trước khi hỏi Quiz. Chương còn khóa tiếp tục bị lọc khi mã chương trong outline và policy khác chữ hoa/thường. |
| Hai vị trí trong bài trỏ tới một quiz và phiên bản, mã quiz khác chữ hoa/thường | Trước bản sửa xuất hiện hai gợi ý. Sau bản sửa chỉ có một truy vấn sang Quiz và một gợi ý. |
| Bốn lượt chấm của bản quiz mới cùng có hiệu lực khi migration được áp dụng | Trước bản sửa xu hướng giảm 42 điểm phần trăm bị đảo thành tăng. Sau bản sửa dùng thời điểm chấm để xếp các lượt có cùng thời điểm hiệu lực. Đã xác nhận qua unit và API NestJS có migration trong PostgreSQL. |
| Học viên đạt mức `PROFICIENT` ở kỹ năng tiên quyết | API chuyển sang nội dung của kỹ năng phụ thuộc và giữ đồ thị giảng viên đã lưu. 200 đồ thị có nhiều nhánh được đối chiếu bằng phép duyệt độc lập, gồm ca thêm cạnh tạo chu trình. |

Các phần đã rà soát đủ để chốt phía Learning với Course/Quiz giả lập. Khi ghép thật, xác nhận snapshot, quyền bắt đầu và số lượt còn theo phiên bản. Theo contract hiện tại, timeout từ Quiz trả 504 cho request danh sách gợi ý.

## ADP-01 đến ADP-07 — Kiểm thử nhóm gợi ý học tập

HTTP NestJS chạy với PostgreSQL thật. Các suite hồi quy Progress/Mastery dùng RabbitMQ cục bộ. Course và Quiz được giả lập qua HTTP theo contract.

**Kết quả.** Toàn bộ Learning đạt **71/71 E2E, 18/18 mock HTTP và 36/36 unit**. Chạy lại riêng ADP đạt **3/3 E2E** trên bản cuối. Contract **8/8**, TypeScript và lint đạt.

| Phạm vi | Kết quả |
| --- | --- |
| ADP-01/02/03/05 | Học viên chỉ nhận bài và quiz đúng phiên bản, được phép mở, có kỹ năng phù hợp. Quiz hết lượt hoặc Quiz cấm tạo lượt được lọc. Giải thích có điểm, số câu và số lượt còn nếu có quiz. |
| ADP-04 | Bài và quiz được xếp chung, mục trùng chỉ tính một lần. Đọc lại cùng trang cho cùng kết quả. Unit test kiểm tra ưu tiên giữa nhiều khóa và thứ tự khi bằng điểm. |
| ADP-06 | Chủ khóa và Admin đọc/lưu được đồ thị. Học viên và giảng viên khóa khác bị từ chối. Kiểm tra tự tham chiếu, chu trình, cạnh trùng và kỹ năng ngoài khóa hoặc ngừng dùng. Hai lệnh lưu cùng phiên bản cho một 200 và một 409. Gợi ý chuyển sang kỹ năng tiên quyết chưa đạt, kể cả chuỗi nhiều cấp. |
| ADP-07 | Hai nhóm điểm 55% và 13% tạo xu hướng giảm 42 điểm phần trăm. Điểm tổng Mastery là 34%. Khi xếp hạng áp dụng mức điều chỉnh tối đa 5. Kết quả sai phiên bản, quá 30 ngày hoặc ở tương lai không góp vào xu hướng. |

Khi ghép hệ thống, xác nhận snapshot Course có `skillIds` của bài và Quiz tính đúng số lượt, quyền làm cùng kỹ năng theo phiên bản. [Vị trí code và ví dụ Postman](../../../WORK.md#adp-04--xếp-hạng-gợi-ý)

## ADP-03 — Gợi ý quiz ôn tập

Kiểm thử API NestJS với PostgreSQL và Course/Quiz giả lập qua HTTP. Bộ đầy đủ đạt **69/69 E2E, 17/17 mock HTTP và 33/33 unit**. Contract **8/8**, TypeScript và lint đạt.

| Kịch bản | Kết quả |
| --- | --- |
| Kỹ năng 35% từ 8 câu, quiz trong bài đã mở và còn 2 lượt | API trả `learningItemId` của quiz và lý do có điểm, số câu và số lượt còn. Các quiz đã hết lượt, Quiz cấm tạo lượt, không khớp kỹ năng hoặc khác loại được lọc. |
| Quiz ở chương khóa hoặc đứng sau item bắt buộc | Learning chưa hỏi Quiz về quyền tạo lượt. Sau khi mở chương và hoàn thành item đứng trước, API trả quiz. |
| Hỏi đúng người học, khóa và phiên bản quiz | Quiz giả lập nhận token và request ID. Trả sai người hoặc sai phiên bản cho kết quả 503. Quiz timeout trả 504. Một quiz trả 404 bị bỏ qua. |
| Gọi hai lần API nội bộ Quiz | Cùng kết quả `attemptsRemaining`. API mock chỉ đọc. Public API vẫn có thể trả quiz từ dữ liệu Quiz nếu snapshot cũ thiếu liên kết kỹ năng–bài. |

Khi ghép thật, kiểm tra thêm cách Quiz đếm các lượt đang làm, chưa chấm và hết hạn theo phiên bản. [Cách thử Postman](../../../WORK.md#adp-03--gợi-ý-quiz-ôn-tập)

## ADP-02 và ADP-05 — Bài bổ trợ và lý do đề xuất

Kiểm thử HTTP NestJS với PostgreSQL thật và Course giả lập qua HTTP. Ca ADP ghi kết quả chấm mẫu bằng repository đồng bộ. Các suite hồi quy PRG/MST kiểm thử luồng nhận kết quả qua RabbitMQ cục bộ. Bộ Learning đạt **69/69 E2E, 16/16 mock HTTP và 31/31 unit**. Contract **8/8**, TypeScript và lint đạt.

| Kịch bản | Kết quả |
| --- | --- |
| Course đã xuất bản bản mới, học viên ghi danh bản cũ | Learning chỉ yêu cầu snapshot của lượt ghi danh với credential nội bộ. Course thiếu snapshot trả 409. Snapshot cũ thiếu `skillIds` vẫn đọc được và trả danh sách gợi ý rỗng. |
| Chấm 35% từ 3 câu, dữ liệu của học viên khác, rồi thêm 5 câu cho đúng học viên | Có một gợi ý sau khi đủ 8 câu của chính học viên. Hai kỹ năng yếu khớp cùng bài chỉ tạo một mục. Lý do dùng kỹ năng yếu hơn. |
| Chương còn khóa hoặc bài còn bị chặn bởi thứ tự học | API chỉ trả bài truy cập được. Hoàn thành nội dung trước mở thêm bài cùng chương. Đạt quiz chương mở gợi ý của chương sau. |
| Phân trang, lỗi xác thực và ghi danh đã hủy | Hai lần gọi cùng trang trả cùng dữ liệu. Thiếu đăng nhập trả 401. Giảng viên trả 403. Học viên không có khóa đang học nhận danh sách rỗng. |
| Đọc gợi ý | Endpoint đọc kết quả Mastery trong PostgreSQL và không tạo snapshot hoặc ghi bảng mastery hiện tại. |

[Suite E2E](recommendations.db.e2e-spec.ts) · [Ví dụ Postman](../../../WORK.md#adp-01--phát-hiện-kỹ-năng-yếu)

## ADP-01 — Phát hiện kỹ năng yếu

Lượt kiểm thử ban đầu ngày **15/11/2026** đạt **31/31 unit** và **16/16 mock HTTP**, gồm 2 ca mới ở mỗi bộ. Lint và TypeScript đạt. Các lượt chấm và liên kết kỹ năng–bài lấy từ fixture. Luồng NestJS được kiểm thử ở phần ADP-02/05 phía trên.

| Ca kiểm thử | Kết quả mong đợi đã xác nhận |
| --- | --- |
| Học viên có 35% từ 3 câu, rồi nhận thêm một lượt góp 5 câu | Danh sách rỗng ở lượt đầu. Sau lượt thứ hai, API trả bài “Giới thiệu module” với lý do có 35% và 8 câu. Event gửi lặp giữ nguyên kết quả. |
| Đúng ngưỡng 40% và đủ 5 câu, hoặc điểm dưới ngưỡng nhưng số câu không rõ | API trả danh sách rỗng. Unit test kiểm tra thêm điểm sát ngưỡng, mã kỹ năng khi bằng điểm và thứ tự từ yếu nhất. |
| Bài cùng kỹ năng ở chương khóa, sau đó chương mở. Kỹ năng chuyển sang ngừng dùng | Bài chương khóa chỉ xuất hiện sau khi có đủ điều kiện mở chương. Khi kỹ năng ngừng dùng, danh sách rỗng. Bài thuộc bản cấu trúc mới hơn luôn nằm ngoài kết quả mẫu. |
| Phân trang, thiếu danh tính, tài khoản giảng viên và học viên khác | Kết quả và tổng số ổn định theo trang. Thiếu danh tính trả 401. Giảng viên trả 403. Học viên ngoài khóa mẫu nhận danh sách rỗng. Query `userId` hoặc `page` lặp trả 400. |

Chạy lại mock bằng `npm.cmd run test:mock -w @lms/learning-service`. [Ví dụ Postman](../../../WORK.md#adp-01--phát-hiện-kỹ-năng-yếu)

## Kiểm thử PRG và MST ngày 14/11/2026

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
