import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResumeCheckpoints1794528000005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE learning_resume_checkpoints (
        enrollment_id uuid NOT NULL,
        content_version integer NOT NULL CHECK (content_version >= 1),
        lesson_id uuid NOT NULL,
        learning_item_id uuid NOT NULL,
        position_seconds double precision CHECK (position_seconds >= 0),
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revision integer NOT NULL CHECK (revision >= 1),
        PRIMARY KEY (enrollment_id, content_version)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE learning_resume_checkpoints');
  }
}
