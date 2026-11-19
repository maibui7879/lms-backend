import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EnrollmentOutbox1795132800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "course_event_outbox" (
      "id" uuid PRIMARY KEY,
      "routingKey" varchar(100) NOT NULL,
      "event" jsonb NOT NULL,
      "createdAt" timestamptz NOT NULL,
      "sentAt" timestamptz NULL
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_course_outbox_pending"
      ON "course_event_outbox" ("createdAt") WHERE "sentAt" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "course_event_outbox"');
  }
}
