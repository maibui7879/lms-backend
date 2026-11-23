# Notification service

Supports Course/revision review decisions and successful enrollments. Enrollment
events use course.enrollment.created.v2 and notify the student, deduplicated by
enrollmentId. Course optionally supplies courseTitle without changing the snapshot
payload. Notification uses its own durable queue, not Learning's enrollment queue.

Standalone Nest service on port 3005. Uses the monorepo's existing dependency versions and shared contracts/auth packages. Authentication always verifies an Identity RS256 access token and current account access; mock headers are never accepted.

From the repository root run `npm run build -w @lms/notification-service`, `npm test -w @lms/notification-service`, or `npm run test:e2e -w @lms/notification-service`. Dependencies resolve from the root installation. Build shared contracts/auth first if their outputs are missing.

Provision the service environment from [.env.example](./.env.example). Keep real credentials in the local environment. Use the same DATABASE_URL as the other services. Synchronization is always disabled. After building, run `npm run migration:run -w @lms/notification-service`; the runner creates the notification schema before TypeORM initializes its migration ledger, then applies transactional migrations. All inbox data lives in notification.notifications.

`GET /health/live` reports liveness. `GET /health` executes SELECT 1 and checks broker connectivity when RABBITMQ_URL is configured. Swagger uses the notification OpenAPI contract at `/docs` and `/docs-json`.

Inbox HTTP endpoints are under `/api/v1/notifications`; Socket.IO uses `/notifications`, with a bare signed JWT in handshake auth.accessToken. Allowed browser origins come from NOTIFICATION_ALLOWED_ORIGINS. Socket connections expire with the JWT and recheck Identity before each delivery.

The consumer and inbox service persist broker events idempotently by eventId before acknowledging. Invalid messages go to notification.course-review.v1.dead; transient storage failures are retried through a five-second delayed queue, up to five retries, then sent to the dead-letter queue. Broker recovery reconnects automatically. The dispatcher polls committed rows every two seconds. Socket delivery and dispatch are single-instance; multi-instance deployment requires shared delivery coordination. Inbox reads remain the durable source of notifications.

Course publishes via its transactional outbox. Both services must use the same RabbitMQ virtual host and exchange lms.events. Course declares durable notification routing before publishing so events remain queued even before the first Notification startup. Broker publishers must be restricted to trusted services; schema validation is not cryptographic proof of the producer.

Docker uses the root Compose definition and this service's Dockerfile. No database container is required. If RabbitMQ runs on the host, set its URL to host.docker.internal rather than localhost inside containers. Migrations are explicit, not run at service startup. Gateway routing/WebSocket proxy is not implemented by this change.
