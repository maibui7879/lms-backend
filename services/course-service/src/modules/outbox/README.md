# Enrollment event outbox

`EnrollmentOutboxService.created(manager, snapshot, correlationId)` and
`cancelled(manager, payload, correlationId)` insert schema-validated events through
the caller's active TypeORM transaction manager. Save the enrollment and call the
helper in the same transaction; propagate insertion failures so both writes roll
back. Call `cancelled` only for an actual ACTIVE → CANCELLED transition. Never
publish from the enrollment request transaction.

The enrollment service injects `EnrollmentOutboxService` and makes these calls
inside its write transactions; the helper has no repository fallback outside a transaction.
Use the incoming request ID for correlation, or a generated job ID when unavailable.
For create, pass the persisted enrollment ID and pinned contentVersion via
`enrollmentData(saved)`. For cancel, pass enrollmentId/courseId/userId/cancelledAt.

`EnrollmentOutboxModule` is imported by the enrollment module. Its publisher polls
committed pending rows when RABBITMQ_URL is set, locks batches with SKIP LOCKED,
publishes persistent messages to the durable `lms.events` topic exchange, and
marks them sent only after publisher confirms. Broker failures roll back sent
markers and retry on the next poll. A crash after confirmation can deliver the
same event again: consumers must deduplicate by eventId. Rows are retained; no
automatic purge is configured. Exchange bindings and consumer queues must be
provisioned before enabling the publisher.

The entity is registered in database options. For an existing database with
DB_SYNC=false, apply `EnrollmentOutbox1795132800000` from the registered migrations
using the deployment's TypeORM migration runner before starting this module.
No database migration was executed as part of this change. DB_SYNC remains
development-only. Unit tests use transaction/broker doubles; live PostgreSQL
rollback/concurrency and RabbitMQ restart delivery still require integration tests.

Critical revision migration requests are a separate durable workflow owned by the
revision metadata implementation; do not encode them as enrollment events or
change the event contracts.
