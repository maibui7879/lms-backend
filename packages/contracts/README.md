# LMS contracts — baseline trước mock data

Package này đặc tả HTTP, dữ liệu tích hợp và RabbitMQ cho Identity, Course, Quiz và Learning. Không chứa entities, truy vấn database, controller, mock server hoặc seed. Phạm vi lấy từ tài liệu brainstorm đính kèm và [tài liệu dự án](../../docs/LMS_PROJECT_DOCUMENTATION.md). Chưa xác minh độc lập Function List trên Google Sheets; không coi baseline này là xác nhận hoàn thành mọi Function ID của backlog bên ngoài.

## Nguồn sự thật và cách kiểm tra

- [DTO và exports](src/index.ts): các kiểu TypeScript dùng chung; giữ nguyên đường import cũ.
- [Danh mục HTTP](src/endpoints.ts): operationId, service sở hữu, method/path, access, request/query, response, pagination, status và idempotency.
- [Runtime parser](src/validation.ts): `parseContract(schemaName, unknown)` trả DTO có kiểu hoặc ném `ContractValidationError`; service chuyển thành envelope `400 VALIDATION_ERROR`. Không tự ép kiểu, bỏ field lạ hoặc sửa dữ liệu đầu vào.
- [JSON Schema](src/schemas.json), [OpenAPI tổng](openapi.json), OpenAPI riêng cho [Identity](openapi/identity.json), [Course](openapi/course.json), [Quiz](openapi/quiz.json), [Learning](openapi/learning.json) được sinh từ DTO và danh mục HTTP. Không sửa trực tiếp các file sinh.
- [Bảng mã lỗi](src/errors.ts): mã lỗi nghiệp vụ và HTTP status thống nhất.

Chạy từ root workspace:

```sh
npm run generate -w @lms/contracts
npm test -w @lms/contracts
npm run typecheck
npm run build
```

Test kiểm tra file sinh không lệch nguồn, schema compile, reference OpenAPI, phân quyền đăng ký, không lộ đáp án, policy, revision, kết quả chờ chấm và event version. Các input nhỏ trong test là dữ liệu kiểm thử validation; chưa phải bộ mock data hoặc seed liên service. Sau mỗi lần sửa DTO phải generate lại và review diff. Consumer có thể dùng JSON Schema bằng validator khác; các kiểm tra quan hệ trong parser và quy tắc transaction bên dưới vẫn bắt buộc.

## Quy ước HTTP chung

Gateway forward nguyên đường dẫn `/api/v1/...`, không tự bỏ prefix. Các endpoint `/api/v1/internal/...` chỉ dành mạng/service tin cậy, Gateway không public các route này. Endpoint hệ thống `/health` và `/health/live` thuộc cấu hình triển khai từng service, không thuộc catalog API nghiệp vụ này.

Mọi response có body là `{ data, meta: { requestId } }`, kể cả list và dữ liệu null. Response 204 không có body. Lỗi dùng `{ error: { code, message, details }, requestId, timestamp }`; không trả stack, SQL, JWT, hash hoặc secrets. UUID theo format chuẩn; thời gian ISO 8601 UTC có `Z`; URL chỉ HTTP(S). `details` là object chứa lỗi công khai, không chứa đáp án đúng. Client phải hiển thị lỗi theo code, không parse chuỗi message.

List dùng query `page` mặc định 1, `limit` mặc định 20, tối đa 100; data là `{ items, page, limit, total }`. Sắp xếp mặc định `createdAt desc`, tie-break bằng ID asc; course cho phép `title`. Query HTTP ban đầu là string: adapter parse số nguyên chặt chẽ trước khi gọi parser, từ chối giá trị lặp hoặc không hợp lệ; parser không coerce. Unknown query/body fields trả 400. `total` là số bản ghi sau filter và authorization.

`expectedVersion` so với revision entity hiện tại trong cùng transaction; mismatch trả `409 VERSION_CONFLICT`. `expectedRevision` cho attempt/checkpoint; mismatch trả `409 REVISION_CONFLICT`. Revision checkpoint/answers khởi tạo 0, tăng sau mỗi lần ghi; entity/content/assessment version bắt đầu 1. PATCH không có field thay đổi trả 400. Các DELETE có VersionRequest phải gửi JSON body; client không hỗ trợ body DELETE cần adapter, không tự đổi route. Reorder dùng version của parent và toàn bộ ID anh em đúng thứ tự; không nhận ID trùng/ngoài parent.

`Idempotency-Key` bắt buộc với startAttempt, submitAttempt, issueCertificate; 1–128 ký tự. Lưu theo actor + operation + resource + key và hash body, khóa atomic cùng transaction nghiệp vụ. Cùng key/body trả lại status/body ban đầu, không tạo attempt/event/certificate mới; cùng key khác body trả `409 IDEMPOTENCY_CONFLICT`. Giữ bản ghi ít nhất 24 giờ; sau retention vẫn dùng trạng thái attempt và unique certificate để chống trùng. Submit lại bằng key khác trả `409 ATTEMPT_ALREADY_SUBMITTED`. PUT completion lặp lại không cộng lần nữa; PUT answers/resume vẫn kiểm tra revision để chặn ghi đè cũ.

## Authorization và quyền sở hữu

JWT người dùng: RS256, issuer `identity-service`, kiểm tra signature, allowlist algorithm, expiry và shape JwtClaims ở Gateway và mỗi service. Đọc trạng thái tài khoản ở Identity cho thao tác nhạy cảm. Client không được cung cấp userId, instructorId, reviewedBy, timestamp chấm hoặc score thay server. Không tin X-User-Id/X-Role từ client.

Internal service JWT dùng credential riêng, issuer `lms-internal`, audience là service đích, scope theo operationId, thời hạn tối đa 5 phút. Chỉ cho caller có nhu cầu: Gateway đọc UserAccess/UserSummary; Quiz/Learning đọc enrollment/access; Quiz đọc content reference; Learning đọc structure/graded/attempt-access; Course/Gateway đọc learner summaries. Với yêu cầu thay mặt người dùng, service caller phải xác minh user context và giới hạn userId/courseId trước khi gọi; credential service không cấp quyền public tùy ý. Quản lý key/JWKS và rotation thuộc deployment, không lưu trong contracts.

| Access trong catalog | Bắt buộc kiểm tra                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PUBLIC               | Không cần user token; course chưa publish chỉ trả cho owner/Admin đã xác thực; người khác 404                                                                    |
| AUTHENTICATED        | Tài khoản ACTIVE, chỉ tài nguyên của chính user (`enrollments/me`, attempts/me, profile, certificate, dashboard); hủy enrollment cũng phải đúng owner            |
| STUDENT              | Role STUDENT, ACTIVE; enrollment/access và policy tương ứng vẫn bắt buộc                                                                                         |
| INSTRUCTOR           | Role INSTRUCTOR; createQuiz còn phải sở hữu course và lesson đúng course                                                                                         |
| ADMIN                | Role ADMIN, ACTIVE; không cho tự khóa hoặc hạ quyền Admin cuối cùng đang hoạt động                                                                               |
| COURSE_OWNER         | Instructor sở hữu course của resource hoặc Admin; resolve ownership qua quan hệ server, không tin body                                                           |
| ENROLLED             | Student có enrollment ACTIVE/COMPLETED và version phù hợp; Instructor owner/Admin có thể đọc preview; mutation completion/resume chỉ dành Student của chính mình |
| ATTEMPT_OWNER        | Chỉ Student sở hữu attempt; Instructor/Admin dùng thống kê, không dùng endpoint kết quả riêng tư này                                                             |
| DISCUSSION_AUTHOR    | Tác giả ACTIVE; Admin được moderation; Instructor owner được xóa khi moderation nhưng không sửa nội dung tác giả                                                 |
| INTERNAL             | Credential service và scope hợp lệ; không chấp nhận user JWT thay thế                                                                                            |

Chưa xác thực trả 401; role/ownership không hợp lệ trả 403. Kiểm tra dependency thất bại trả 503, timeout trả 504, tuyệt đối không cho phép truy cập theo giả định. Thông tin không tồn tại trả 404. Owner preview không được lộ answer keys trên endpoint student.

## Identity và session

Public register chỉ tạo STUDENT. `role` được bỏ qua khỏi body hoặc chỉ được là STUDENT; ADMIN/INSTRUCTOR/unknown bị từ chối 400. Admin cấp role INSTRUCTOR qua changeUserRole, lưu lý do/audit. Email trim/lowercase trước kiểm tra unique. Password 12–128 ký tự, không trim; response không chứa password/hash. Chỉ ACTIVE được login; sai credentials trả 401, INACTIVE trả `403 ACCOUNT_INACTIVE`, email trùng trả `409 EMAIL_ALREADY_EXISTS`.

Login/refresh trả SessionData; refresh token chỉ lưu hash tại Identity, rotate mỗi lần dùng, reuse thu hồi cả family. Refresh hết hạn/thu hồi trả `401 INVALID_REFRESH_TOKEN`. Logout chỉ cần refresh token hợp lệ về shape, thu hồi idempotent, token đã hết hạn/thu hồi vẫn trả 204. Khóa account/đổi role thu hồi refresh sessions và ghi audit với actor/time từ server; access token cũ phải bị từ chối qua account-status check cho thao tác nhạy cảm. Update profile không sửa email/role/status. Session store, hash password và JWT verification chưa được hiện thực bởi package.

## Course, nội dung và enrollment

| Operation hoặc nhóm                                                     | Precondition, kết quả và side effect                                                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| createCourse                                                            | Instructor tạo DRAFT của chính mình, version/contentVersion = 1                                                                                                              |
| updateCourse; CRUD Chapter/Lesson/Item; reorder; updateCompletionPolicy | Chỉ DRAFT hoặc REJECTED, đúng parent và ownership, version khớp; tăng version entity và aggregate parent liên quan. Không cho sửa trực tiếp snapshot đã publish              |
| deleteCourse                                                            | Chỉ DRAFT/REJECTED, chưa có enrollment; xóa aggregate trong Course, không tự xóa Quiz DB                                                                                     |
| deleteChapter/deleteLesson/deleteLearningItem                           | Chỉ draft, xóa con thuộc Course theo transaction; nếu còn quiz reference cần xử lý reference trước, không tạo orphan                                                         |
| submitCourseReview                                                      | DRAFT/REJECTED → IN_REVIEW, có title, ít nhất một lesson/item, requirements không rỗng, reference quiz hợp lệ; giữ lịch sử review                                            |
| reviewCourse                                                            | Admin; chỉ IN_REVIEW; APPROVE → PUBLISHED và đóng băng snapshot, REJECT → REJECTED với reason không rỗng. Lưu reviewedBy/time server, tăng version                           |
| listReviewQueue/listCourseReviews                                       | Admin xem queue IN_REVIEW; lịch sử chỉ course owner/Admin, phân trang                                                                                                        |
| getCourse/listCourses                                                   | Public chỉ PUBLISHED. Không chứa nội dung lesson bị giới hạn; owner/Admin xem draft theo detail hoặc instructor list                                                         |
| getCourseOutline/getCompletionPolicy                                    | Enrollment hợp lệ theo pinned contentVersion, hoặc owner/Admin preview                                                                                                       |
| enroll                                                                  | Chỉ PUBLISHED; unique courseId/userId, 201 EnrollmentSnapshotData; ghi outbox enrollment.created.v2 cùng transaction                                                         |
| cancelEnrollment                                                        | Chính enrollment owner; ACTIVE → CANCELLED, lặp lại 204; COMPLETED không hủy. Phát cancelled.v1 sau commit qua outbox                                                        |
| listMyEnrollments/listInstructorCourses/listCourseLearners              | Chỉ tài nguyên đúng actor hoặc owner/Admin; không trả email/password trong learner list                                                                                      |
| Discussion CRUD/pin                                                     | Enrolled/owner đọc và tạo; author sửa, author/Admin hoặc course owner moderation xóa; chỉ owner/Admin pin. parentId phải là bài gốc cùng course/lesson; không lồng nhiều cấp |

Không có endpoint Instructor publish trực tiếp. Invalid course transition trả `409 INVALID_COURSE_TRANSITION`, sai quan hệ trả `422 INVALID_LESSON_RELATION`, yêu cầu publish thiếu requirements trả `422 INVALID_COURSE_REQUIREMENTS`. `requiredItemIds` được server tính từ cờ required của items, không để client nhập tùy ý. `chapterPolicies` khai báo requirements riêng của từng chapter; mỗi `chapterId` chỉ xuất hiện một lần, và Learning chỉ mở chapter kế tiếp khi policy của chapter hiện tại đạt. `requiredAssessments` ở cấp course dành cho các assessment toàn course như final quiz. RequiredAssessment phải là graded quiz đã publish, đúng course/item và đúng assessmentVersion; passingScorePercent phải khớp Quiz policy snapshot.

Thứ tự item bắt đầu 0, không trùng trong parent. VIDEO có durationSeconds nguyên dương và videoUrl; READING có body không rỗng; QUIZ chỉ tham chiếu quizId/assessmentVersion, không copy đáp án. Input HTML/Markdown phải được sanitize ở service/rendering boundary, schema không thay thế xử lý nội dung.

Enrollment pin contentVersion tại lúc đăng ký. Không có implicit migration khi course thay đổi. Baseline này **chặn sửa nội dung PUBLISHED**; versioning revision/review lại và migration enrollment hiện không có endpoint. ContentUpdatedEvent chỉ dành trường hợp sau này có workflow revision được review; không phát event này từ draft save và không tự reset progress cũ. Re-enroll enrollment CANCELLED chưa hỗ trợ, trả ALREADY_ENROLLED; cần policy riêng nếu mở lại.

## Quiz, câu hỏi, attempt và kết quả

| Operation hoặc nhóm                      | Precondition, kết quả và side effect                                                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| createQuiz/updateQuiz                    | Owner course; lesson thuộc course; DRAFT, version match; policy hợp lệ                                                                                                                              |
| Question CRUD/listAuthoringQuestions     | Owner/Admin, chỉ sửa DRAFT; choice IDs unique, >= 2 choices, points > 0; correctChoiceIds là tập con không rỗng; SINGLE_CHOICE có đúng một đáp án                                                   |
| publishQuiz                              | DRAFT → PUBLISHED; có câu hỏi hợp lệ và tổng điểm > 0; đóng băng câu hỏi, policy, assessmentVersion. Chỉ publish quiz đã có Course reference đúng version                                           |
| archiveQuiz                              | PUBLISHED → ARCHIVED, chặn start mới; attempt đang chạy dùng snapshot cũ đến hạn                                                                                                                    |
| deleteQuiz                               | Chỉ DRAFT và không còn Course reference; không xóa attempt/result lịch sử                                                                                                                           |
| getQuiz                                  | Metadata không đáp án; phải kiểm tra enrollment hoặc owner preview; lịch mở đóng dùng server clock                                                                                                  |
| startAttempt                             | Student, enrollment/access hợp lệ, PUBLISHED, trong `[opensAt, closesAt)`, chưa quá maxAttempts; tạo snapshot questions/policy/version trong transaction atomic; trả câu hỏi delivery và serverTime |
| getAttempt                               | Attempt owner; lấy lại cùng question/choice order đã snapshot, answers và expiresAt; không shuffle lại mỗi lần đọc                                                                                  |
| saveAnswers                              | Attempt IN_PROGRESS, serverNow < expiresAt, revision khớp; replace toàn bộ answer set, tăng revision; bỏ câu hỏi khỏi set nghĩa là xóa câu trả lời đó                                               |
| submitAttempt                            | Chỉ dùng answers đã lưu, revision khớp; khóa attempt, chấm trên snapshot, lưu kết quả và outbox trong cùng transaction; không lấy score/passed từ client                                            |
| getQuizResult                            | Owner; pending score/maxScore/passed/gradedAt là null. GRADED có đủ dữ liệu; đồng bộ Learning được đọc riêng                                                                                        |
| getQuizReview                            | Owner; reviewPolicy AFTER_SUBMISSION khi đã chấm, AFTER_CLOSE khi đã chấm và serverNow >= closesAt, NEVER luôn từ chối; trả 403 REVIEW_NOT_AVAILABLE khi chưa đủ điều kiện                          |
| listMyAttempts                           | Chỉ chính user, filter quizId và phân trang; không có đáp án đúng                                                                                                                                   |
| getQuizStatistics/listLearnerAssessments | Chỉ course owner/Admin; thống kê theo assessmentVersion, không lấy điểm practice thay graded; không có mẫu trả null thay vì 0 giả                                                                   |

Policy: durationSeconds và maxAttempts nguyên dương, passingScorePercent trong [0,100]; practice không được requiredForCompletion. Review AFTER_CLOSE phải có closesAt. opensAt/closesAt nullable, nếu có cả hai thì opensAt < closesAt. Update một phần phải validate lại **entity đã merge**, không chỉ DTO PATCH.

Start tính `expiresAt = min(startedAt + durationSeconds, closesAt nếu có)`. Mỗi quiz/user/assessmentVersion chỉ có một attempt IN_PROGRESS; request khác key khi còn attempt đang chạy trả attempt đó, không tăng số lượt. maxAttempts đếm mọi attempt đã tạo của cùng assessmentVersion, kể cả EXPIRED. Transaction/unique constraint ngăn hai request vượt giới hạn.

Hết hạn: save/submit trả `409 ATTEMPT_EXPIRED`; worker idempotent chuyển attempt sang EXPIRED và tự chấm answers đã lưu, không nhận đáp án trễ. SUBMITTED và EXPIRED đều có thể gradingStatus GRADED. GRADED không được đi cùng IN_PROGRESS. Event chỉ phát khi chấm xong. MVP chỉ hỗ trợ SINGLE_CHOICE/MULTIPLE_CHOICE, chấm all-or-nothing bằng tập choice IDs chính xác, không trừ điểm, không partial credit. Câu không trả lời = 0. `passed = score / maxScore * 100 >= passingScorePercent` không làm tròn trước so sánh. PENDING_REVIEW được giữ cho mở rộng sau này, chưa có API chấm tay.

Invalid quiz transition trả `409 INVALID_QUIZ_TRANSITION`; không trong lịch hoặc chưa publish trả `409 QUIZ_NOT_AVAILABLE`; maxAttempts trả `409 ATTEMPT_LIMIT_REACHED`; answer question/choice không thuộc snapshot trả `422 INVALID_ANSWER`. Client không thể gửi đúng format nhưng dùng choice ID của câu khác. Câu hỏi authoring không bao giờ được spread thành delivery: server phải map allowlist; runtime delivery từ chối correctChoiceIds/explanation/version.

## Learning, completion, resume, certificate

| Operation hoặc nhóm                         | Precondition, kết quả và side effect                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| completeItem                                | Chính Student có access; contentVersion bằng enrollment snapshot; VIDEO/READING được xác nhận thủ công ở baseline, không nhận position làm bằng chứng; QUIZ completion lấy từ Quiz, từ chối client tự hoàn thành                           |
| completeLesson                              | completed chỉ được true; mọi required item đã hoàn thành theo snapshot; không tự đánh dấu tất cả item bằng một request. Cập nhật idempotent và outbox lesson.completed sau commit                                                          |
| getLessonProgress/getCourseProgress         | Đọc chính user, đúng enrollment snapshot; percentage chỉ tính required items                                                                                                                                                               |
| saveResume/getResume                        | Checkpoint không thay progress; item đúng course/lesson/contentVersion, sequence cho phép; video position trong [0,duration], reading/quiz position = null; expectedRevision=0 tạo, sai revision trả 409; chưa có checkpoint trả data:null |
| getDashboard/listRecommendations/getMastery | Chỉ chính actor; không khẳng định recommendation là điều kiện completion; mastery có algorithmVersion để consumer không trộn công thức                                                                                                     |
| getLearningStatistics/listLearnerProgress   | Course owner/Admin, aggregate/read model, có updatedAt; không dùng projection phụ thay trạng thái completion chính thức                                                                                                                    |
| issueCertificate                            | Course COMPLETED, enrollment hợp lệ, certificateEnabled; unique enrollmentId/contentVersion, retry không cấp trùng, phát certificate.issued sau commit                                                                                     |
| listCertificates/verifyCertificate          | List chỉ chính mình; verificationCode khó đoán, public chỉ tên đã cho phép công khai, tên khóa học và issuedAt; không lộ email/IDs; mã không có trả valid:false và các trường null                                                         |
| getProgressSync                             | Xác minh attempt tồn tại/ownership qua Quiz trước; không thấy attempt trả 404, dependency lỗi 503/504; pending chưa có receipt trả eventId/updatedAt null nếu chưa biết                                                                    |

Item/lesson/course: NOT_STARTED → IN_PROGRESS → COMPLETED, không có reset/reopen trong baseline. Course COMPLETED khi enrollment ACTIVE/COMPLETED, mọi required item hoàn thành và mọi required graded assessment có ít nhất một passed attempt cùng assessmentVersion. Practice required item hoàn thành khi có submitted/expired attempt đã chấm cùng version, không yêu cầu passed; practice không thay graded requirement. Không đủ required lessons trả COURSE_REQUIREMENTS_NOT_MET. Sequential access chỉ mở item kế tiếp khi các required item trước đó hoàn thành; dependency access được tính bằng Course structure + Learning state, không join database.

`progressPercent = completedRequiredItems / totalRequiredItems * 100`, totalRequiredItems=0 thì progressPercent=0 và đánh giá assessment riêng; 100% items không đồng nghĩa course completed. Không publish policy có cả hai tập requirements rỗng. Mastery baseline tính trung bình scorePercent của các graded attempts hợp lệ theo skill mapping, BEGINNER <40, DEVELOPING [40,70), PROFICIENT >=70; skill chưa có evidence không xuất entry. Mapping skill/question và thuật toán projection phải được Learning owner review trước triển khai, không tạo evidence giả trong mocks.

ProgressSync là receipt Learning PostgreSQL: PENDING chưa xử lý hoặc đang retry, SYNCED chỉ sau transaction processed_events + progress + receipt commit, FAILED chỉ khi có failure receipt bền vững. SYNCED phải có eventId/updatedAt và error=null; FAILED có public PROJECTION_FAILED. Replay FAILED → PENDING → SYNCED, giữ cùng event identity. RabbitMQ outbox SENT hoặc Atlas projection không đồng nghĩa SYNCED. Frontend poll backoff 1,2,4,8 giây rồi tối đa 15 giây; sau 2 phút hiện vẫn chờ, không tự đổi thành FAILED.

## Internal integration

| Provider → consumer         | Operation                             | Invariant                                                                                                            |
| --------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Identity → Gateway/services | getUserAccess/getUserSummary          | Không password/token; kiểm tra ACTIVE và role                                                                        |
| Course → Quiz/Learning      | checkEnrollment/checkCourseAccess     | allowed=false khác dependency failure; COMPLETED còn quyền đọc, CANCELLED không                                      |
| Course → Quiz               | getContentReference                   | Đúng course/lesson/item/quiz, instructor, content/assessment version; publish/start đều phải kiểm tra                |
| Course → Learning           | getLearningStructure                  | contentVersion query bắt buộc, immutable outline và completionPolicy phải cùng version/course                        |
| Quiz → Learning             | getAssessmentSummary/getAttemptAccess | Kết quả đã chấm, version/policy snapshot, ownership và event identity; chưa chấm trả 409 COURSE_REQUIREMENTS_NOT_MET |
| Quiz → Course/Gateway       | getLearnerAssessments                 | Có userId/course/quiz/version, phân trang; caller phải giới hạn theo course được phép                                |
| Learning → Course/Gateway   | getLearnerProgress                    | Phân trang learner summaries theo course; không tiết lộ course của owner khác                                        |

Timeout budget của adapter 3 giây; retry GET tối đa một lần với jitter trong budget. Không retry mutation mà thiếu idempotency key. Nếu Course cần tính sequence qua Learning, endpoint internal structure của Course phải độc lập, không gọi ngược checkCourseAccess gây vòng lặp. Integration adapter xác minh metadata từ provider, không chỉ parse đúng shape.

## Event catalog và delivery

Exchange `lms.events` topic; eventType không có suffix version, routing key có `.vN`; eventId UUID, occurredAt UTC, producer cố định theo service, correlationId từ request hoặc job. Events không chứa đáp án đúng, token hoặc password.

| Routing key                    | Producer → consumer                        | Payload và thời điểm                                                        |
| ------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------- |
| course.enrollment.created.v1   | Course → Learning legacy                   | Giữ nguyên payload cũ; không dùng để suy ra contentVersion                  |
| course.enrollment.created.v2   | Course → Learning mới                      | EnrollmentSnapshotData bắt buộc contentVersion, sau enrollment transaction  |
| quiz.attempt.graded.v1         | Quiz → Learning legacy                     | Giữ score/maxScore/passed; không đủ policy/version cho completion mới       |
| quiz.attempt.graded.v2         | Quiz → Learning mới                        | GradedAssessmentSummary có assessmentVersion, quizType, threshold, gradedAt |
| course.enrollment.cancelled.v1 | Course → Learning                          | Chặn mutation mới, giữ lịch sử progress                                     |
| course.content.updated.v1      | Course → Learning/Quiz tương lai           | Chỉ sau published revision workflow; không migrate enrollment ngầm          |
| learning.lesson.completed.v1   | Learning → Analytics tùy chọn              | Sau lần hoàn thành đầu tiên của lesson/version                              |
| learning.course.completed.v1   | Learning → Notification/Analytics tùy chọn | Sau lần completed đầu tiên của enrollment/version                           |
| course.published.v1            | Course → Search/Notification tùy chọn      | Chỉ khi Admin APPROVE                                                       |
| course.reviewed.v1             | Course → Notification tùy chọn             | Review record sau quyết định Admin                                          |
| learning.certificate.issued.v1 | Learning → Notification tùy chọn           | Chỉ sau cấp certificate lần đầu                                             |

V1/v2 song song cần queue riêng và cutover từng consumer; consumer mới chỉ subscribe v2 cho cùng nghiệp vụ. Không double-apply cả v1 lẫn v2; business unique key attemptId/assessmentVersion hoặc enrollmentId bổ sung eventId dedup để chống dual-publish. V1 payload phải lookup version từ provider nếu cần migrate, không tự giả định 1. Package chưa bật publisher/queue nào. Event tùy chọn chỉ triển khai khi có consumer thật.

Producer dùng transactional outbox; consumer durable queue, persistent delivery, manual ACK sau commit. Ghi processed_events unique(eventId) và thay progress trong cùng transaction. Lỗi tạm thời retry backoff 1s/5s/30s tối đa ba lần rồi DLQ; lỗi schema poison không retry vô hạn. DLQ handler phải ghi failure receipt bền vững trước khi báo FAILED. Replay giữ eventId/payload gốc, không sửa điểm lịch sử; event tới trễ không được downgrade completion hoặc ghi đè version khác. Retain outbox/receipt ít nhất 30 ngày; purge chỉ sau khi consumer/replay retention được cấu hình thống nhất. Đây là baseline triển khai, chưa phải hạ tầng đã chạy.

## Coverage và việc cần review trước triển khai

| Nhóm brainstorm                                                                                     | Nguồn contract                                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Common, pagination, identifiers, errors, correlation/idempotency                                    | http/common, common/pagination, errors, endpoints  |
| Auth, sessions, users, authorization, admin user/audit                                              | http/auth, http/identity                           |
| Course/approval/chapter/lesson/item/outline/access/enrollment/discussion/instructor                 | http/course, http/enrollment, internal/integration |
| Question/config/attempt/answer/result/review/statistics/integration                                 | http/quiz, http/quiz-result, internal/integration  |
| Lesson/course progress, resume/dashboard, mastery/recommendation, completion/certificate/statistics | http/learning, CourseCompletionPolicy              |
| Internal HTTP và RabbitMQ                                                                           | internal/integration, events, endpoints            |

Baseline chọn các phương án cụ thể để review: chỉ Admin cấp Instructor; khóa nội dung đã publish; enrollment pin requirements; bất kỳ passed attempt cùng assessmentVersion đạt required assessment; timeout tự chấm answers đã lưu; receipt thuộc Learning. Các quyết định này cụ thể hóa đề xuất §30–33, **không tự đánh dấu ADR đã được owner duyệt**. Producer và consumer phải review ownership, security, thời gian retry/retention, grading, mastery/certificate và đối chiếu Function List trước triển khai module phụ thuộc. OpenAPI mô tả API dự kiến; scaffold service chưa phục vụ các endpoint này.

## Tương thích và bước mock sau contracts

Giữ LoginResponse/QuizResultData/QuizAttemptStatus và v1 event để consumer cũ compile; QuizResultData.status đã deprecated, code mới dùng QuizResultV2Data với attemptStatus/gradingStatus. ProgressSync được đọc riêng, không dùng SUBMITTED hay outbox SENT thay GRADED/SYNCED. API result mới dùng shape V2 ngay tại route v1 vì business route chưa được triển khai; nếu có consumer ngoài repo đã dùng shape cũ thì phải version route hoặc adapter trước cutover. Login mới thêm refresh fields, vẫn chứa trường accessToken/tokenType/expiresIn/user của kiểu cũ.

Public RegisterRequest bỏ quyền tự chọn INSTRUCTOR là thay đổi chủ ý so với handoff cũ; chưa có registration controller trong scaffold. Không thay version workspace package lúc consumer nội bộ còn cùng checkout; khi publish package cần version/release notes theo chính sách nhóm.

Chỉ sau review baseline mới xây mock dataset/scenario manifest dựa trên [IDs có sẵn](fixtures/ids.json): quan hệ owner → course → chapter → lesson → items/quiz, enrollment snapshot, attempt/question snapshot, graded event và receipt. Mỗi mock request/response/event phải qua parseContract và kiểm tra quan hệ chéo; dữ liệu sai quyền, deadline, version, pending và DLQ có scenario riêng. Không đưa secrets hoặc sửa database production. Thay đổi này chưa tạo dataset, seed hay mock endpoint.
