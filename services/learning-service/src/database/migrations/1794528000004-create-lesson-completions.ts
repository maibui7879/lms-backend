import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLessonCompletions1794528000004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE learning_lesson_completions (
        enrollment_id uuid NOT NULL,
        content_version integer NOT NULL CHECK (content_version >= 1),
        lesson_id uuid NOT NULL,
        completed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (enrollment_id, content_version, lesson_id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE learning_lesson_completions');
  }
}
