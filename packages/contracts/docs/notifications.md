# Course notifications

Enrollment success is also consumed from `course.enrollment.created.v2` on the
same notification queue, independently from Learning's queue. `ENROLLMENT_SUCCEEDED`
is addressed to payload.userId. The optional envelope field courseTitle is a
presentation snapshot; the enrollment payload stays unchanged. Older events without
a title use generic text. Deduplication uses enrollmentId, so even a replay with a
different eventId cannot create a second notice for the same enrollment. A genuinely
new enrollment after cancellation has a new enrollmentId and gets a new notice.

Notifications belong to the standalone `notification-service` on port `3005`.
The endpoint contract service name and OpenAPI tag are `notification`; its
service document is [notification OpenAPI](../openapi/notification.json).
It owns PostgreSQL schema `notification`; sharing the same PostgreSQL connection
with other services is allowed. No upload flow is involved.

## Course review events

Course publishes `CourseReviewNotificationEvent` through RabbitMQ topic exchange
`lms.events`, routing key `course.review.decided.v1` (exported as
`COURSE_REVIEW_NOTIFICATION_ROUTING_KEY`). Notification consumes the durable queue
`notification.course-review.v1` bound to that routing key.

The envelope requires `eventId` and `correlationId` UUIDs, `eventType:
'course.review.decided'`, `version: 1`, UTC `occurredAt`, and `producer:
'course-service'`. Its payload requires `recipientId`, `courseId`, nullable
`revisionId`, `decision` (`APPROVE` or `REJECT`), nullable `reason`, and the
positive integer course/revision `version`. Envelope version and payload version
are separate fields. A null revision identifies a course review; a revision UUID
identifies a revision review. Together with the decision this maps to the four
existing `CourseNotificationData.type` values.

The consumer deduplicates by `eventId`, saving the processed event and notification
in the same transaction, and ACKs after commit. Invalid events go to the DLQ;
transient failures retry with bounded backoff (1s/5s/30s), then go to the DLQ on
exhaustion. Replay preserves the original event ID. There is no public notification
creation API: notifications are created by consuming events.

All REST routes require a real authenticated identity and operate only on that
user's notifications:

| Method | Path                                 | Result (`ApiResponse` data)        |
| ------ | ------------------------------------ | ---------------------------------- |
| GET    | `/api/v1/notifications`              | `PageData<CourseNotificationData>` |
| GET    | `/api/v1/notifications/unread-count` | `UnreadNotificationCount`          |
| PUT    | `/api/v1/notifications/{id}/read`    | `CourseNotificationData`           |

The list uses `NotificationQuery`: standard `page` and `limit`, plus optional
`unreadOnly` (omitted or false includes all). The HTTP adapter parses literal
`true`/`false` into booleans and rejects other or repeated values; the contract
parser does not coerce strings. Standard pagination defaults and ordering apply.
The count includes only this user's unread notifications, independent of pagination.
Mark-read returns 200, preserves the first `readAt` on repeated calls, and requires
no body or `Idempotency-Key`. Missing or other users' IDs return `404 NOT_FOUND`.
`revisionId` and `readAt` are required nullable fields. Timestamps are ISO 8601 UTC.

## Socket.IO

Connect to namespace `/notifications` using handshake
`auth: { accessToken: '<raw JWT>' }`. Supply a real access JWT, without the
`Bearer ` prefix; never use a mock token or mock authentication bypass.
Validate the user JWT signature, issuer and expiry, and check the identity
with Identity before accepting the connection. Reject invalid, expired or inactive
identities. Derive the user identity and room membership on the server; clients
cannot select rooms or supply a recipient identity.

Before each emit, recheck JWT expiry and account status/role with Identity. Expired
tokens and inactive accounts must receive no further notifications and must be
disconnected; reconnect with a fresh real access token. Fail closed if the
identity check cannot complete.

User access tokens follow JwtClaims (no audience field). The service JWT used for
the Identity call has audience identity-service and scope getUserAccess. Refresh
token logout/revocation alone is not access-token revocation; a still-valid access
token can remain usable until expiry unless the account status/role changes.

The server emits `notification.created` with payload
`ApiResponse<CourseNotificationData>` (including `meta.requestId`), as typed by
`NotificationCreatedPayload`. There is no client room-selection event.
Socket delivery is best effort, not exactly once: events can be missed or repeated
across disconnects. Deduplicate by notification `id` and use the REST list and
unread-count routes for catchup on connection/reconnection. REST is the durable
source of current read state; this contract promises no replay cursor or socket
acknowledgement guarantee.
