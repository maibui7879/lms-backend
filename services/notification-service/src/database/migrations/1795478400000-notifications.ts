import type { MigrationInterface, QueryRunner } from 'typeorm';
export class Notifications1795478400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('CREATE SCHEMA IF NOT EXISTS notification');
    await runner.query(`CREATE TABLE notification.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "recipientId" uuid NOT NULL, "courseId" uuid NOT NULL, "revisionId" uuid NULL,
      type varchar(40) NOT NULL, title varchar(200) NOT NULL, message text NOT NULL,
      "eventKey" varchar(200) NOT NULL, "createdAt" timestamptz NOT NULL,
      "readAt" timestamptz NULL, "emittedAt" timestamptz NULL
    )`);
    await runner.query(
      'CREATE UNIQUE INDEX "UQ_notifications_event" ON notification.notifications ("eventKey")',
    );
    await runner.query(
      'CREATE INDEX "IDX_notifications_recipient" ON notification.notifications ("recipientId", "createdAt")',
    );
    await runner.query(
      'CREATE INDEX "IDX_notifications_pending" ON notification.notifications ("createdAt") WHERE "emittedAt" IS NULL',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE notification.notifications');
  }
}
