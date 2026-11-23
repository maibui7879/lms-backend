import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BindSyncReceiptToAssessmentVersion1794528000003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE learning_assessment_sync_receipts
      ADD COLUMN assessment_version integer CHECK (assessment_version >= 1)
    `);
    await queryRunner.query(`
      UPDATE learning_assessment_sync_receipts AS receipt
      SET assessment_version = attempt.assessment_version
      FROM learning_assessment_attempts AS attempt
      WHERE receipt.event_id = attempt.event_id
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE learning_assessment_sync_receipts DROP COLUMN assessment_version
    `);
  }
}
