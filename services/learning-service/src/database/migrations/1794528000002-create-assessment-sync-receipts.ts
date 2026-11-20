import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssessmentSyncReceipts1794528000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE learning_assessment_sync_receipts (
        event_id uuid PRIMARY KEY,
        attempt_id uuid NOT NULL,
        user_id uuid NOT NULL,
        course_id uuid NOT NULL,
        status text NOT NULL CHECK (status IN ('PENDING', 'SYNCED', 'FAILED')),
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      INSERT INTO learning_assessment_sync_receipts
        (event_id, attempt_id, user_id, course_id, status)
      SELECT event_id, attempt_id, user_id, course_id, 'SYNCED'
      FROM learning_assessment_attempts
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE learning_assessment_sync_receipts');
  }
}
