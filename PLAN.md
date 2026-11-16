# Kế hoạch công việc Learning Service

Cập nhật ngày **16/11/2026** cho nhánh `feat/learning/progress`. Mã và phạm vi nghiệp vụ bám Function List. Đặc tả kỹ thuật lấy từ [contract chung](packages/contracts/README.md) và [lộ trình Learning](services/learning-service/README.md#mục-tiêu-và-cách-thực-hiện). Xem [WORK.md](WORK.md) để tra file, API và chức năng đang chạy.

## Ghi danh lại — PRG-01/02/03/05/08, INS và ADP

Đã triển khai tách lượt học từ `enrollmentId`, `contentVersion` và `enrolledAt`. Learning xử lý cả trường hợp bản Course hiện tại trả cùng ID sau khi ghi danh lại và cập nhật mốc bắt đầu. Chạy migration `1794528000014` trước khi bắt đầu bản Learning mới. [Luồng ghi danh lại](WORK.md#tách-tiến-độ-khi-ghi-danh-lại) · [Kiểm thử](services/learning-service/test/TEST_REPORT.md#ghi-danh-lại-giữ-nguyên-id-và-phiên-bản)

Rà soát độc lập đã phát hiện và sửa xung đột **PRG-08** khi tab cũ ghi vị trí vào lượt mới. Mỗi lần lưu tiếp tục cấp revision mới trong cùng ID và phiên bản. Khi lưu lần đầu của lượt mới, client gửi `expectedRevision: 0` rồi dùng revision từ phản hồi cho các lần cập nhật. [Báo cáo rà toàn Learning](services/learning-service/test/TEST_REPORT.md#rà-soát-toàn-nhánh-learning-sau-thay-đổi-ghi-danh-lại)

## Bàn giao phần Learning của TV4

**Sẵn sàng bàn giao trong phạm vi mock.** Đã rà độc lập toàn nhóm PRG, MST, ADP, CERT và INS do Learning phụ trách. Hồi quy cuối đạt **104/104 E2E** sau khi sửa các xung đột về giờ chấm quiz, lần học gần nhất và mốc học lại khi cấp chứng chỉ mới. Việc ghép thật cần xác nhận dữ liệu Course, luồng Quiz và xác thực qua Gateway. [Báo cáo bàn giao và các điểm cần ghép](services/learning-service/test/TEST_REPORT.md#rà-soát-bàn-giao-toàn-nhánh-learning)

## Dashboard giảng viên — INS-03, INS-06, INS-07 và INS-09

**Trạng thái.** Đã chốt bốn chức năng của Learning trong phạm vi mock sau khi rà và kiểm thử độc lập. Bộ INS đạt 12/12 và hồi quy Learning đạt 103/103 E2E. Function List dòng 146–149 xếp **INS-03** là P0 và ba mục còn lại là P1. [Cách hoạt động và API](WORK.md#báo-cáo-giảng-viên--ins-03-ins-06-ins-07-và-ins-09) · [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md)

| Mã chức năng | Phần Learning đã triển khai |
| --- | --- |
| **INS-03 — Tiến độ từng học viên** | Danh sách phân trang dùng phần trăm theo bài. API chi tiết trả bài đã hoàn thành và lần học gần nhất. Cả hai tính theo phiên bản ghi danh của từng người. |
| **INS-06 — Tỷ lệ hoàn thành khóa** | Lọc người học theo thời điểm ghi danh, tính tỷ lệ có trạng thái chính thức `COMPLETED` và tiến độ bài trung bình. Trả tỷ lệ `null` nếu nhóm được chọn rỗng. |
| **INS-07 — Thống kê kỹ năng yếu** | Đếm học viên ở mức `BEGINNER` trên số học viên có đủ bằng chứng cho kỹ năng. Mỗi học viên cần tối thiểu 5 câu có dữ liệu chấm của kỹ năng đó. |
| **INS-09 — Biểu đồ điểm và tiến độ** | Phân bố tiến độ theo bài, số bài hoàn thành theo ngày, phân bố và điểm phần trăm trung bình theo ngày cho từng quiz và phiên bản. Hỗ trợ lọc theo thời gian, quiz và lớp khi Course trả `classId`. |

**Khi ghép Course thật.** Kiểm tra quyền Admin trên API danh sách học viên. Bản `origin/main` được đối chiếu đang yêu cầu giảng viên sở hữu khóa. Với bộ lọc lớp, Course cần cung cấp `classId` trên từng bản ghi ghi danh. Kiểm tra thêm luồng đồng bộ điểm từ Quiz để biểu đồ có dữ liệu thực tế. [Mock INS-03](services/learning-service/test/fixtures/INS-03-MOCK.md)

## Chứng chỉ CERT-01 đến CERT-07

Function List dòng 139–145 giao nhóm chứng chỉ cho backend Learning (TV4). CERT-01–06 là P1, CERT-07 là P2. Bắt đầu với **CERT-01**, tạo mock kiểm tra đủ điều kiện bằng luồng Progress đã có. Phần cấp chứng chỉ có thể phát triển với dữ liệu Course, Quiz và Identity giả lập. [Function List](<C:/Users/LENOVO/Downloads/Lms hay cjd tuong tu.xlsm>) · [Quy tắc cấp chứng chỉ và chống gửi lặp](packages/contracts/README.md#learning-completion-resume-certificate)

**Quy tắc cấp lại đã thống nhất.** Khi khóa chưa có bản sửa được xuất bản đủ điều kiện cấp lại, học viên dùng chứng chỉ đã cấp. Khi có bản mới đủ điều kiện, học viên có thể chọn học lại. Chứng chỉ cũ giữ hiệu lực cho đến khi học viên hoàn thành yêu cầu của bản mới và được cấp chứng chỉ mới. Sau khi cấp thành công, Learning lưu cả hai hồ sơ và đổi trạng thái chứng chỉ cũ thành đã được thay thế.

**Tiến độ chứng chỉ.** Đã đóng CERT-01 đến CERT-07 ở phạm vi Learning dùng mock, sau khi hai agent rà soát và chạy API độc lập. Khi ghép thật, kiểm tra Course trả đúng phiên bản đã chọn và `enrolledAt` của lượt học lại, xác thực Admin và hồ sơ Identity, route qua Gateway và địa chỉ công khai trong QR. [Báo cáo rà soát](services/learning-service/test/TEST_REPORT.md) · [Luồng thu hồi](WORK.md#cert-07--admin-thu-hồi-chứng-chỉ)

| Thứ tự | Mã và chức năng | Cách làm và tiêu chí hoàn thành |
| --- | --- | --- |
| 1 | **CERT-01 — Xác định hoàn thành 100%** | Dùng kết quả hoàn thành chính thức từ Progress và `certificateEnabled` từ cùng snapshot ghi danh. Chỉ học viên có lượt ghi danh hợp lệ, khóa ở trạng thái `COMPLETED` và policy bật cấp chứng chỉ mới đủ điều kiện. Ví dụ, 100% bài nhưng quiz bắt buộc chưa đạt thì trả `409 CERTIFICATE_NOT_ELIGIBLE`. Kiểm thử cả trường hợp đổi nội dung phải học lại trước khi cấp. [Luồng Progress](services/learning-service/src/modules/progress/progress.service.ts) |
| 2 | **CERT-04 + CERT-06 — Mã duy nhất và chống cấp trùng** | Sinh mã ngẫu nhiên đủ khó đoán, đặt ràng buộc duy nhất trên mã và khóa nghiệp vụ đã chốt. Lưu theo `Idempotency-Key` của học viên và khóa, giữ kết quả tối thiểu 24 giờ theo contract. Kiểm thử hai request đồng thời, gửi lại cùng key, key khác và gửi lại sau khi hết hạn key. Các request hợp lệ cùng một chứng chỉ phải trả cùng ID và mã. |
| 3 | **CERT-02 — Tạo PDF** | Dùng tên học viên từ Identity và tên khóa từ Course. Lưu tên in trên chứng chỉ, ngày cấp và mã tại thời điểm cấp. Nhúng font hỗ trợ tiếng Việt, thêm QR trỏ tới địa chỉ xác minh của môi trường. Lưu PDF ở nơi có kiểm soát truy cập. Chỉ trả cấp thành công khi PDF đã sẵn sàng tải. Test lỗi tạo/lưu PDF rồi retry, bảo đảm không tạo thêm chứng chỉ. |
| 4 | **CERT-03 — Danh sách và tải PDF** | Dùng `listCertificates` để phân trang chứng chỉ của người đang đăng nhập. Bổ sung route tải theo mã chứng chỉ nội bộ (ID), kiểm tra chủ sở hữu trước khi trả `application/pdf`. Kiểm thử đúng chủ, học viên khác, danh sách rỗng và tên file. |
| 5 | **CERT-05 — Xác minh QR/mã** | Dùng `verifyCertificate` để kiểm tra mã công khai. Chỉ trả tên khóa, ngày cấp và tên học viên khi được phép công khai. Kiểm tra QR và nhập mã dẫn đến cùng kết quả. Mã lạ trả `valid: false` với dữ liệu định danh rỗng theo contract. |
| 6 | **CERT-07 — Thu hồi chứng chỉ** | Bổ sung API Admin thu hồi có lý do và lưu audit gồm người thao tác, thời điểm, lý do. Xác minh công khai phân biệt chứng chỉ đã thu hồi với mã không tồn tại, giữ lý do nội bộ. Kiểm thử gửi lặp, giảng viên/học viên bị từ chối, và xác minh sau thu hồi. |

### Contract hiện có và phần cần chốt

- **API quản trị và xác minh.** `PUT /api/v1/admin/certificates/{id}/revocation` chỉ dành cho Admin. `GET /api/v1/certificates/verify/{code}` trả `ACTIVE`, `SUPERSEDED`, `REVOKED` hoặc `status: null` với mã lạ. `SUPERSEDED` đi cùng `valid: true` vì vẫn là bằng chứng lịch sử. Chi tiết audit chỉ có trong phản hồi Admin. [Endpoint hiện có](packages/contracts/src/endpoints.ts) · [Kiểu dữ liệu](packages/contracts/src/http/learning.ts)
- **CERT-06 và contract Course.** Đã đồng bộ thay đổi vòng đời chứng chỉ từ `f71e371`. Khi nối Course, cần chốt nơi trả phiên bản đã chọn, ID lượt ghi danh và mốc bắt đầu học lại. Learning dùng mốc đó để chọn bằng chứng hoàn thành khi quiz giữ nguyên phiên bản. [Commit contract](https://github.com/maibui7879/lms-backend/commit/f71e3719e3f360313c1b18b0fcf1496d1a12ca62)
- **Quy tắc CERT-06 đã thống nhất.** Khóa chống cấp trùng là `(userId, courseId, contentVersion)`. `enrollmentId` lưu lượt ghi danh gốc làm căn cứ cấp. Mỗi học viên có tối đa một chứng chỉ hiện hành cho mỗi khóa. Cấp thành công bản mới và đánh dấu bản cũ `SUPERSEDED` trong cùng giao dịch. Admin thu hồi sang `REVOKED`. Bản thu hồi được lưu trong lịch sử, tải hoặc yêu cầu cấp cùng bản trả `409 CERTIFICATE_REVOKED`.
- **Tên và quyền công khai.** Tên in được lấy từ Identity và lưu cùng PDF. API xác minh hiện trả `recipientName: null`. Khi ghép thật, kiểm tra nguồn tên, tín hiệu cho phép công khai và URL xác minh dùng trong QR. [Profile Identity](packages/contracts/src/http/identity.ts) · [Quy tắc xác minh](packages/contracts/README.md#learning-completion-resume-certificate)
- **Cấp và thông báo.** Luồng đầu tiên bắt đầu từ yêu cầu cấp của học viên. Kiểm tra đủ điều kiện trước khi cấp lần đầu. Contract có sự kiện `learning.certificate.issued.v1`. Lộ trình Learning dùng outbox khi có consumer để chỉ phát thông báo sau khi đã cấp thành công. [CertificateIssuedEvent](packages/contracts/src/events/domain-events.ts)

### Luồng cấp và chống cấp trùng CERT-01/04/06

1. **Nhận yêu cầu.** Học viên đăng nhập và gọi `POST /api/v1/learning/courses/{id}/certificate` kèm `Idempotency-Key`. Learning lấy danh tính từ phiên đăng nhập. Đề xuất bổ sung phiên bản đích vào yêu cầu cấp lại sau khi đọc contract Course, để một request cũ gửi muộn vẫn chỉ yêu cầu bản ban đầu. Learning đối chiếu phiên bản đó với lựa chọn đã được Course ghi nhận.
2. **Kiểm tra kết quả đã có.** Nếu cùng học viên, API, khóa và key đã có kết quả, trả lại chứng chỉ đã lưu cho yêu cầu đó. Với bản đã bị Admin thu hồi, trả `409 CERTIFICATE_REVOKED`. API hiện tại nhận body trống. Khi bổ sung trường chọn phiên bản, áp dụng `409 IDEMPOTENCY_CONFLICT` cho cùng key gửi với body khác. Yêu cầu dùng key mới nhưng cùng phiên bản đã cấp nhận cùng ID và mã. Trong thời hạn lưu key, gửi lại key cũ của bản 1 tiếp tục trỏ đến hồ sơ bản 1 dù sau đó đã cấp bản 2. Trạng thái hiệu lực hiện tại được đọc qua API xác minh.
3. **Xét điều kiện khi cần cấp mới.** Kiểm tra lượt học thuộc đúng học viên và phiên bản đích. Progress phải báo `COMPLETED` theo policy của bản đó, gồm bài và quiz bắt buộc, và `certificateEnabled` phải bật. Nếu chưa đủ, trả `409 CERTIFICATE_NOT_ELIGIBLE`. Khi học viên đã có chứng chỉ, đối chiếu thêm phiên bản mới được Course cho phép cấp lại và bằng chứng học viên đã hoàn thành phiên bản đó.
4. **Ghi chứng chỉ.** Tuần tự hóa thao tác cấp của cùng học viên và khóa trong PostgreSQL, rồi kiểm tra lại chứng chỉ đã có và phiên bản hiện hành trong transaction. Database giữ một chứng chỉ cho mỗi bộ học viên, khóa và phiên bản, một mã xác minh duy nhất và tối đa một chứng chỉ hiện hành cho mỗi học viên và khóa. Nếu request khác đã cấp cùng phiên bản, trả bản ghi đó. Yêu cầu cũ đến muộn giữ nguyên chứng chỉ hiện hành mới hơn.
5. **Hoàn tất cấp hoặc thay thế.** Trong cùng transaction, lưu chứng chỉ mới và PDF, chuyển chứng chỉ trước đó sang `SUPERSEDED`, gắn `supersededByCertificateId` nếu có và ghi kết quả chống gửi lặp. Nếu transaction thất bại, chứng chỉ cũ vẫn hiện hành. Gửi lại key đã lưu nhận cùng chứng chỉ với trạng thái hiện tại, hoặc `409 CERTIFICATE_REVOKED` nếu chứng chỉ đã bị thu hồi.

| Ca kiểm thử CERT-06 | Kết quả mong đợi |
| --- | --- |
| Bấm hai lần cùng key, hoặc request gửi lại sau khi mất kết nối | Cùng ID và mã xác minh. |
| Hai request cùng phiên bản gửi đồng thời với hai key khác nhau | Chỉ có một dòng chứng chỉ cho phiên bản đó. Hai request nhận cùng ID và mã. |
| Key cũ đã hết hạn và học viên yêu cầu lại phiên bản đã cấp | Tra theo ràng buộc phiên bản và trả chứng chỉ đã lưu. |
| Bản 2 đã xuất bản, học viên chưa học lại hoặc đang học | Chứng chỉ bản 1 vẫn hiện hành. Chỉ có chứng chỉ mới sau khi đạt điều kiện của bản 2. |
| Học viên hoàn thành bản 2, hai request cấp bản 2 đến đồng thời | Một chứng chỉ bản 2 hiện hành, bản 1 được đánh dấu đã thay thế một lần. |
| PDF hoặc bước ghi bản 2 lỗi, hoặc request cấp bản 1 đến sau | Lỗi cấp bản 2 giữ hiệu lực bản 1. Khi bản 2 đã cấp thành công, request cũ giữ bản 2 hiện hành. |

### Cấu trúc và kiểm thử đề xuất

- Đặt `CertificateModule` ở `services/learning-service/src/modules/certificates/`. Controller xử lý API, service điều phối kiểm tra điều kiện và cấp, `rules/` giữ luật nghiệp vụ, `entities/` và `repositories/` lưu chứng chỉ và audit. Phần tạo/lưu PDF có thể kiểm thử qua adapter riêng, dùng kho file tạm trong test.
- Tạo fixture ở `services/learning-service/test/fixtures/certificates.mock.json` và thêm mock vào server đang có. Ca Postman đầu tiên dùng hai học viên hoặc hai lượt ghi danh. Một ca 100% bài nhưng quiz chưa đạt phải nhận 409. Ca đủ điều kiện và bật `certificateEnabled` nhận 201. Gửi lặp trả cùng ID và mã. Kiểm tra thêm đúng phiên bản, policy tắt, ghi danh đã hủy, tải hộ người khác, dữ liệu công khai, mã QR và thu hồi.
- Bổ sung ca cấp lại khi có contract Course. Khi An đã có chứng chỉ bản 1 và khóa xuất bản bản 2, QR bản 1 vẫn hợp lệ lúc An chưa học lại hoặc đang học dở. Khi cấp bản 2 thành công, QR bản 1 hiển thị đã được thay thế. Gửi lặp bản 2 trả cùng mã. Giả lập cấp bản 2 thất bại và kiểm tra chứng chỉ bản 1 vẫn hợp lệ.
- Chạy unit cho điều kiện, mock HTTP cho Postman và E2E NestJS với PostgreSQL để kiểm tra ràng buộc duy nhất, cạnh tranh và retry. Dùng Course/Quiz/Identity giả lập để làm độc lập trước. Ghi kết quả từng mã vào [WORK.md](WORK.md) và [báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md).

## Gợi ý học tập ADP-01 đến ADP-07

Function List dòng 132–138 giao nhóm này cho backend Learning, thuộc phần TV4. Làm **ADP-01 trước**, dùng kết quả MST-03/04/06 đã có. Sau đó ghép ADP-02 và ADP-05 thành luồng đầu tiên để thử trên Postman. Tiếp tục với quiz và hoàn thiện thứ tự chung. ADP-01–05 thuộc P1, ADP-06–07 thuộc P2. [Function List](<C:/Users/LENOVO/Downloads/Lms hay cjd tuong tu.xlsm>)

**Tiến độ ADP-01 đến ADP-07.** Đã triển khai toàn bộ nhóm phía Learning với Course/Quiz giả lập. API trả bài và quiz đã lọc quyền, xét kỹ năng tiên quyết, xếp hạng theo điểm và xu hướng rồi phân trang. Hai API riêng cho phép chủ khóa đọc và lưu đồ thị. Khi ghép thật, xác minh dữ liệu liên kết bài và số lượt từ hai service sở hữu. [Vị trí code và ví dụ Postman](WORK.md#adp-04--xếp-hạng-gợi-ý)

| Thứ tự | Mã và chức năng | Cách làm và kết quả cần đạt |
| --- | --- | --- |
| 1 | **ADP-01 (P1) — Phát hiện kỹ năng yếu** | Dùng mastery hiện tại của chính học viên theo lượt ghi danh, lọc kỹ năng đang dùng, đủ bằng chứng và dưới ngưỡng. Dùng điểm gốc khi so ngưỡng. Sắp từ yếu nhất và dùng mã kỹ năng để phân định khi bằng điểm. Kiểm thử chưa có điểm, thiếu số câu, đúng ngưỡng và đủ số câu. |
| 2 | **ADP-02 (P1) — Gợi ý bài học bổ trợ** | Dùng mapping kỹ năng–bài từ Course giả lập, lọc theo phiên bản ghi danh và quyền truy cập của PRG, gồm cả học tuần tự trong chương. Lọc lại theo cấu trúc hiệu lực nếu có migration. Một bài khớp nhiều kỹ năng chỉ xuất hiện một lần. Bài đã học vẫn có thể xuất hiện để ôn nếu truy cập được. |
| 3 | **ADP-05 (P1) — Giải thích lý do đề xuất** | Dùng `reason` và `explanation` của API hiện có. Bắt đầu với bài học ở ADP-02 và dùng lại khi bổ sung quiz. Giải thích nêu tên kỹ năng, điểm, số câu và nội dung có thể mở. |
| 4 | **ADP-03 (P1) — Gợi ý quiz ôn tập** | Dùng danh sách quiz liên quan kỹ năng theo phiên bản từ Quiz giả lập. Ghép với mục quiz còn truy cập được trong cấu trúc Course. Quiz xác định còn lượt và được bắt đầu hay không, gồm cả lượt chưa chấm theo policy của Quiz. Chỉ đọc thông tin khả dụng, nên gọi API gợi ý không tạo lượt làm. |
| 5 | **ADP-04 (P1) — Xếp hạng gợi ý** | Đã xếp chung bài và quiz. Tiên quyết chưa đạt đứng trước, sau đó xét điểm kỹ năng có điều chỉnh theo xu hướng. Khi bằng ưu tiên, dùng điểm gốc, mã khóa, thứ tự bài và item, rồi mã định danh. Gom trùng trước khi phân trang. |
| 6 | **ADP-06 (P2) — Prerequisite graph** | Đã có API đọc/lưu đồ thị theo khóa và phiên bản ghi. Chỉ nhận kỹ năng đang dùng cùng khóa. Kiểm tra chuỗi nhiều cấp, tự tham chiếu, chu trình và ghi đồng thời. Kỹ năng tiên quyết đạt khi Mastery xếp `PROFICIENT`. |
| 7 | **ADP-07 (P2) — Cá nhân hóa theo lịch sử** | Đã lấy bốn lượt chấm có hiệu lực gần nhất trong 30 ngày, đúng học viên, lượt ghi danh và phiên bản hợp lệ. So điểm theo công thức MST-03 của hai lượt gần với hai lượt trước. Chênh lệch điều chỉnh tối đa 5 điểm xếp hạng. |

### API và nguồn dữ liệu

- **Learning** triển khai `listRecommendations` tại `GET /api/v1/learning/me/recommendations?page=1&limit=20`. Contract đã định nghĩa danh sách phân trang với `courseId`, `lessonId`, `learningItemId`, `reason` và `explanation`. Đề xuất đặt code trong `services/learning-service/src/modules/recommendations/`, dùng lại Mastery và luật truy cập của Progress trong cùng service. [Định nghĩa endpoint](packages/contracts/src/endpoints.ts) · [Kiểu dữ liệu](packages/contracts/src/http/learning.ts)
- **Course** cung cấp cấu trúc theo `enrollment.contentVersion` qua API nội bộ. Contract đã bổ sung trường tùy chọn `LessonOutline.skillIds` và Course giả lập đã trả trường này. Khi ghép, Course cần lưu liên kết kỹ năng theo bài trong đúng snapshot và trả qua endpoint đó. [Kiểu cấu trúc Course](packages/contracts/src/http/course.ts) · [Course client](services/learning-service/src/integrations/course.client.ts)
- **Quiz** cung cấp kỹ năng theo `quizId + assessmentVersion` và quyền tạo lượt mới của học viên qua contract nội bộ `getQuizRecommendationContext`. Learning đã kiểm thử bằng Quiz giả lập. Khi ghép, Quiz thật cần triển khai endpoint và đếm mọi lượt đã tạo theo policy. Với quiz cuối chương cần chốt cách điều hướng nếu đưa vào gợi ý, vì `RecommendationData.lessonId` bắt buộc. [Contract nội bộ](packages/contracts/src/internal/integration.ts)

### Mock đầu tiên và tiêu chí kiểm thử

1. **Chính sách thử ADP-01.** Tạm dùng ngưỡng bắt đầu mức `DEVELOPING` của MST-04, mặc định 40%, và tối thiểu 5 câu đã chấm cho một kỹ năng. Theo giả định này, 35% từ 8 câu được xếp cần ôn. Đúng 40%, 35% từ 3 câu hoặc `questionCount: null` chưa vào danh sách. Đây là giá trị đề xuất cho mock. Ngưỡng, số câu tối thiểu và phạm vi cấu hình cần chốt trước khi dùng thật.
2. **Tạo fixture trước khi viết module.** Trong `services/learning-service/test/fixtures/`, chuẩn bị hai học viên, snapshot ghi danh cũ và bản Course mới hơn, một bài bổ trợ mở, một bài liên quan nằm ở chương khóa và quiz ôn còn/hết lượt. Thêm mock cho `listRecommendations` theo contract hiện có và ghi request Postman cùng kết quả mong đợi.
3. **Kiểm thử ADP-01–05.** Gọi API với học viên có kỹ năng 35% từ 8 câu. Kết quả chứa bài đang mở và quiz đủ điều kiện, giải thích có tên kỹ năng, 35% và 8 câu. Bài ở chương khóa, quiz hết lượt và nội dung chỉ có ở phiên bản Course mới được lọc ra. Gọi lặp kiểm tra thứ tự, phân trang và chống trùng. Kiểm tra thêm học viên khác, ghi danh đã hủy, danh sách rỗng và lỗi từ provider.
4. **Chốt theo phạm vi.** Chạy unit cho luật, mock HTTP/Postman và E2E Learning với Course/Quiz giả lập. Sau mỗi mã, ghi trạng thái, vị trí code, API và ví dụ trong [WORK.md](WORK.md), cùng kết quả trong [báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md). Khi ghép thật, đối chiếu mapping, lượt làm và quyền với service sở hữu rồi chạy lại E2E.

## Mastery (MST-01 đến MST-07)

**Đã triển khai công thức MST-03 đã chốt và nối vào MST-04/05/06/07.** API đọc điểm hiện tại và lịch sử dùng kết quả quiz đã đồng bộ. Khi ghép, QUIZ-08 dùng API kiểm tra mã mới và giữ mapping theo phiên bản. [Vị trí code và ví dụ MST-03](WORK.md#mst-03--tính-điểm-mastery)

**Cập nhật sau rà soát.** MST-03 đã dùng số câu từ kết quả chấm giả lập và lưu điểm tổng hợp. MST-05/06 cập nhật `updatedAt` khi bảng điểm thay đổi. MST-07 ghi các mốc cố định vào PostgreSQL từ lần đọc đầu tiên sau khi có dữ liệu. Phần ghép với Quiz/Course thật sẽ xác nhận contract và luồng phát kết quả. [Báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md#mst-03-và-mst-07--số-câu-quiz-và-snapshot)

1. Khi ghép, Quiz gửi `skillScores[].questionCount` từ snapshot lượt làm theo cùng hình dạng mock. Cập nhật consumer dùng schema mới trước khi bật trường này trên publisher.
2. Ghép QUIZ-08/RES-07 và Course thật. Thử gắn kỹ năng, chấm, gửi lại event, đọc điểm và lịch sử khi đổi phiên bản khóa. Xác minh Course trả đúng snapshot ghi danh qua HTTP.

Đối chiếu Function List dòng 125–131, tab Phân công TV4 và mã QUIZ-08/RES-07 của Quiz. Hai bản bảng tính hiện có trên máy khớp nhau ở các dòng Learning. Bản `(2).xlsm` được nhắc trong chat không có ở đường dẫn đã cho. API đã định nghĩa là `getMastery`. Contract hiện có `skillIds` trong dữ liệu soạn câu hỏi và `skillScores` trong event `quiz.attempt.graded.v2`. Danh mục kỹ năng, cách lấy số câu và API lịch sử cần bổ sung hoặc thống nhất trước khi dùng thật. [Function List và nguồn đối chiếu](<C:/Users/LENOVO/Downloads/Lms hay cjd tuong tu.xlsm>) · [Baseline Learning](packages/contracts/README.md#learning-completion-resume-certificate)

| Thứ tự | Mã và chức năng | Cách thực hiện | Kết quả cần đạt |
| --- | --- | --- | --- |
| 1 | **MST-01 (P1) — Danh sách kỹ năng khóa học. Đã làm.** | Learning lưu mã, khóa, tên, mô tả và trạng thái trên PostgreSQL. API phân quyền qua Course và giữ mã của kỹ năng đã ngừng dùng. | Đã thử chủ khóa và Admin quản lý, học viên đọc danh sách hiện hành, sai khóa bị chặn và tra được mã cũ qua API nội bộ. Course dùng HTTP giả lập. |
| 2 | **MST-02 (P1) — Liên kết câu hỏi với kỹ năng. Đã làm phía Learning.** | `validateCourseSkills` kiểm tra cùng khóa, đúng mã và trạng thái của cả danh sách trong một request. Quiz giả lập gọi trước khi lưu phiên bản câu hỏi. | Đã thử nhiều mã hợp lệ, sai khóa, sai mã, mục đã ngừng dùng và giữ mapping ở phiên bản cũ. **QUIZ-08** cần nối API và chạy lại ca gắn/chấm trên Quiz thật. |
| 3 | **MST-03 (P1) — Tính mastery score và số câu.** | Tính tổng điểm đạt chia tổng điểm tối đa. Cộng số câu theo kỹ năng từ kết quả chấm. Lưu điểm hiện tại khi đọc. | Hai lượt 4/10 và 18/20 trả 73,33%, 2 lượt và 8 câu với Quiz giả lập. Event cũ thiếu số câu trả `null`. |
| 4 | **MST-04 (P1) — Phân loại mức độ thành thạo. Đạt phía Learning.** | Ngưỡng mặc định 40% và 70%. Cấu hình qua `LEARNING_MASTERY_DEVELOPING_MIN` và `LEARNING_MASTERY_PROFICIENT_MIN` cho cả instance. | API điểm hiện tại và lịch sử dùng ngưỡng đã cấu hình. Đã thử số thập phân đúng biên và giá trị thực sự dưới biên. |
| 5 | **MST-06 (P1) — Cập nhật mastery sau quiz. Đã nối MST-03.** | Đọc attempt đã commit qua consumer PRG-06/07, lấy đúng phiên bản theo snapshot và migration. Tính khi có request đọc. | Kiểm tra kết quả lệch thứ tự và giao lại qua RabbitMQ/PostgreSQL. Còn xác nhận Quiz thật. |
| 6 | **MST-05 (P1) — Biểu đồ năng lực. Đã làm API.** | `GET /api/v1/learning/courses/{id}/mastery` trả tên kỹ năng, điểm, mức và số lượt đánh giá của chính học viên đã ghi danh. | Có điểm thì trả kết quả theo MST-03. Chưa có bằng chứng thì trả mảng rỗng. |
| 7 | **MST-07 (P2) — Lịch sử mastery. Đã lưu snapshot tại lần đọc đầu.** | `GET /api/v1/learning/courses/{id}/mastery/history` phân trang mốc trong PostgreSQL, giữ tên, mức, điểm, số câu và phiên bản công thức đã ghi. | Đã thử đọc đồng thời, đổi tên, event trùng, event cũ đến muộn và migration. Mốc đã lưu giữ nguyên. |

### Các quyết định cần thống nhất trước khi mở rộng contract

| Chủ đề | Đề xuất làm việc |
| --- | --- |
| **Số câu và số lượt** | Mock và schema đã hỗ trợ `skillScores[].questionCount`; `evidenceCount` đếm lượt. Đối chiếu cách đếm trên snapshot của Quiz thật và cách rollout schema khi ghép. |
| **Nguồn kỹ năng và phiên bản** | Learning sở hữu danh mục, luật và lịch sử mastery. Quiz sở hữu mapping, chấm điểm và phát event qua **QUIZ-08/RES-07**. Course sở hữu quyền, cấu trúc và phiên bản ghi danh. Xác nhận ba nguồn qua luồng ghép HTTP/RabbitMQ. |
| **Ngưỡng và lượng dữ liệu tối thiểu** | Dùng các mốc mặc định của baseline cho fixture. Chốt phạm vi cấu hình ngưỡng (toàn hệ thống hay từng khóa) và số bằng chứng tối thiểu trước khi gắn nhãn kỹ năng yếu ở ADP-01. |

### Checklist đã thực hiện cho MST-01

1. Đã bổ sung bốn operation và schema OpenAPI cho danh mục, gồm tạo, xem, sửa hoặc ngừng sử dụng và tra mã nội bộ.
2. Đã chuẩn bị fixture hai khóa và các tài khoản khác quyền, thêm mock API thử bằng Postman.
3. Đã triển khai `src/modules/mastery/`, migration PostgreSQL và kiểm tra quyền qua Course. Khóa nháp dùng cùng kiểm tra chủ khóa/Admin. Token tra kỹ năng dùng riêng cho API nội bộ đọc.
4. Đã ghi vị trí, API, ví dụ và kết quả vào [WORK.md](WORK.md) và [báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md). Sau khi ghép, xác nhận quyền trên Course thật và để Quiz kiểm tra mã đúng khóa, đúng trạng thái ở MST-02.

**Phạm vi mới.** Sau lần chốt nhóm PRG, main bổ sung quy tắc invalidation và yêu cầu học lại. Phần Learning cho quy tắc mới đã được triển khai và kiểm thử với Course giả lập.

## Cập nhật theo main 0981c48 — học lại mục bị ảnh hưởng

Nguồn là `packages/contracts/docs/learning-migration-guide.md` trên main, đã đọc ngày 14/11/2026. Phạm vi gồm PRG-01/02/03/05/06/07/08 và ảnh hưởng hiển thị lịch sử điểm PRG-04.

1. Đồng bộ kiểu `OUTDATED`, `RESET`, thông tin invalidation và API internal migration. Giữ các trường dashboard và tiến độ theo bài đang dùng.
2. Thêm trạng thái cho completion cũ, đặt mặc định `COMPLETED`. Thêm sổ migration để xử lý lại an toàn và giữ bản ghi lịch sử.
3. Xác minh revision đã xuất bản, đúng khóa và đúng item qua Course. Bổ sung contract API nội bộ trả liên hệ item trước và sau revision vì main hiện chỉ có API metadata dành cho chủ khóa, còn revision có thể tạo mã item mới.
4. Với `REQUIRE_RECOMPLETION`, chỉ loại bằng chứng hoàn thành của mục bị ảnh hưởng. Với `NOTIFY_ONLY`, giữ số bài và trạng thái hoàn thành. Giữ `contentVersion` của lượt ghi danh.
5. Áp dụng cùng luật cho tiến độ bài/chương/khóa, dashboard và vị trí học tiếp. Quiz bị thay đổi dùng phiên bản đánh giá mới, giữ điểm và attempt cũ để tra cứu.
6. Thêm mock migration và các ca test gửi lặp, sai quyền/quan hệ, nhiều item cùng transaction, học lại, quiz cũ đến trễ và hai thao tác ghi đồng thời. Cập nhật WORK và báo cáo với ví dụ cho người đọc không chuyên code.

**Kết quả triển khai và xác nhận lại bởi hai agent.** Bộ đầy đủ đạt **56/56 E2E**, có PostgreSQL/RabbitMQ thật; mock API **10/10**. Agent thứ hai tự chạy **32/32 E2E** thuộc ba suite và **10/10 mock**, đọc lại logic và đồng ý chốt. Đã sửa bốn ca biên: quiz phiên bản mới đến trước migration, khóa hoàn thành khi chưa xác nhận bài, video đổi thành quiz bỏ ngưỡng mới, và mất lý do thông báo quiz. **Đóng PRG-01 đến PRG-08 trong phạm vi Learning với provider giả; chuyển sang nhóm tiếp theo.** Lần xác nhận trước đối chiếu 59 request HTTP trực tiếp. [WORK.md](WORK.md#rà-soát-chéo-prg-01-đến-prg-08-ngày-14112026) ghi vị trí code, ví dụ và quy ước policy khi đổi loại item.

**Phần Course cần cung cấp khi ghép.** Contract bổ sung `getCourseItemMigrationContext`, gồm revision đã xuất bản, item đích, các item nguồn và yêu cầu quiz mới. Course cần triển khai endpoint và phục vụ nội dung đã sửa cho người học cũ. Learning hiện kiểm thử bằng provider giả lập.

## Trạng thái các chức năng PRG

**Sửa luồng snapshot.** `CourseClient.structure()` gọi thẳng `getLearningStructure` với `enrollment.contentVersion` và credential service. Bổ sung 11 ca HTTP xác minh đường dẫn, token, khóa, phiên bản và lỗi phụ thuộc. Các API user-scoped khác giữ contract hiện có cho danh sách ghi danh và chủ khóa.

| Thứ tự | Mã và chức năng | Việc tiếp theo | Khi nào báo hoàn thành |
| --- | --- | --- | --- |
| Đã làm | **PRG-01 – Lưu hoàn thành từng bài** | Backend đã đọc và lưu hoàn thành item/lesson theo lượt ghi danh. | Đã kiểm thử thiếu item bắt buộc, chương khóa, sai phiên bản và gửi hai request đồng thời trên PostgreSQL. |
| Đã làm | **PRG-03 – Tiến độ theo chương** | Backend đã trả số lesson hoàn thành, tổng số lesson, phần trăm và trạng thái chương. Frontend dùng các trường này để hiển thị. | Đã kiểm thử trường hợp đủ số bài nhưng quiz chưa đạt, sau đó mở chương khi quiz đạt đúng ngưỡng của phiên bản ghi danh. |
| Đã làm | **PRG-04 – Tổng hợp điểm quiz** | Learning tổng hợp điểm đã đồng bộ theo học viên, khóa, quiz và phiên bản. Có hai route đọc điểm cho học viên và chủ khóa hoặc Admin. | Kiểm thử với PostgreSQL, RabbitMQ và Course/Quiz giả lập. Khi ghép hệ thống, chạy lại ca đúng quyền, sai chủ, khác phiên bản, chưa có điểm và event lặp với service của nhóm. |
| Đã làm | **PRG-02 – Tính phần trăm hoàn thành khóa** | Thêm tỷ lệ theo bài bắt buộc cho dashboard và giữ tỷ lệ theo item của contract hiện tại. | Đã kiểm thử khóa không có bài bắt buộc, phiên bản thay đổi và 100% bài nhưng còn thiếu quiz. Khi ghép, xác nhận Course trả được cấu trúc của bản ghi danh cũ. |
| Đã làm | **PRG-05 – Dashboard tiến độ cá nhân** | Hiển thị tiến độ theo bài, quiz đã chấm gần đây và gợi ý học tiếp. | Đã kiểm thử học viên có nhiều khóa, chưa ghi danh, chưa có quiz, quiz bị gửi lặp và bước học sau khi mở chương. |
| Đã làm theo contract | **PRG-06 – Đồng bộ tiến độ qua event** và **PRG-07 – Chống tính trùng event** | Learning nhận `quiz.attempt.graded.v2`. Học viên ghi nhận hoàn thành bài qua API PRG-01. Course cung cấp trạng thái ghi danh hiện tại khi đọc. | Đã kiểm thử RabbitMQ và PostgreSQL, gồm giao lại, rollback, retry và replay. Khi ghép, xác nhận publisher, quyền tra attempt và token nội bộ của Quiz thật. |
| Đã làm | **PRG-08 – Lưu thời điểm học gần nhất** | Lưu vị trí và thời điểm vào PostgreSQL. Dashboard sắp xếp khóa theo vị trí vừa lưu, nội dung đã hoàn thành và quiz vừa chấm. | Đã kiểm thử đọc lại vị trí, chặn ghi đè từ thiết bị cũ và thứ tự khóa. Khi ghép, kiểm tra lưu và phát tiếp trên giao diện. |

## Việc còn lại khi ghép nhóm PRG

1. Course cung cấp cấu trúc phía server theo `contentVersion` đã ghi danh, kể cả khi có bản phát hành mới. Kiểm tra cấu hình `COURSE_SERVICE_TOKEN` và endpoint `getLearningStructure`.
2. Quiz phát `quiz.attempt.graded.v2` và cung cấp quyền tra lượt làm theo contract. Gửi lại bản tin để đối chiếu điểm và số lượt sau khi ghép.
3. Frontend gọi dashboard để hiển thị tiến độ theo bài, kết quả quiz và điều hướng tới bước học tiếp. Thử dừng video rồi học tiếp, cùng tình huống chương đang khóa.
4. Course cung cấp `getCourseItemMigrationContext` theo contract và chỉ gọi endpoint migration sau khi revision đã được xuất bản. Kiểm tra liên hệ mã item cũ với mã mới, thông tin quiz và credential `LEARNING_SERVICE_TOKEN`.
5. Course chuyển `contentVersion` từ query HTTP sang số, trả được snapshot lịch sử và xác thực credential trên các route internal. Main 0981c48 hiện còn các phần này cần hoàn thiện.

## Vị trí PRG-04

- [Repository kết quả Quiz trong Learning](services/learning-service/src/modules/progress-sync/repositories/assessment-attempts.repository.ts) lưu lượt làm theo `attemptId` và `assessmentVersion`. Đây là dữ liệu đã đồng bộ để xây phần tổng hợp của Learning.
- [Contract API](packages/contracts/src/endpoints.ts) khai báo `listMySyncedQuizScores` và `listCourseSyncedQuizScores` cho điểm đã đồng bộ vào Learning. Quiz sở hữu các API lượt làm, kết quả từng lượt và thống kê Quiz.
- [Contract dữ liệu điểm](packages/contracts/src/internal/integration.ts) có `GradedAssessmentSummary` cho từng lượt làm và `LearnerAssessmentSummary` cho kết quả tổng hợp. Kiểm thử với [fixture Course và Quiz](services/learning-service/test/fixtures/learning-providers.mock.json).

## Cách theo dõi mỗi chức năng

1. Khi bắt đầu, ghi mã, tên và phạm vi đang làm.
2. Sau khi code, chạy test phù hợp. Dùng mock khi phụ thuộc service đồng đội và ghi rõ phần nào đã dùng PostgreSQL, RabbitMQ hoặc service thật.
3. Khi báo kết quả, ghi **hoàn thành** kèm phạm vi đã kiểm tra hoặc ghi **còn thiếu** kèm phần chưa làm và phụ thuộc cụ thể.
4. Cập nhật [WORK.md](WORK.md) với vị trí thư mục và file trước, rồi đến công dụng, cách hoạt động, API hoặc event, ví dụ và kết quả mong đợi. Ghi bằng chứng vào [báo cáo kiểm thử](services/learning-service/test/TEST_REPORT.md).
