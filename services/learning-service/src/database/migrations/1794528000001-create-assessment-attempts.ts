import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssessmentAttempts1794528000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE learning_assessment_attempts (
        attempt_id uuid NOT NULL,
        assessment_version integer NOT NULL CHECK (assessment_version >= 1),
        event_id uuid NOT NULL UNIQUE,
        user_id uuid NOT NULL,
        course_id uuid NOT NULL,
        graded_at timestamptz NOT NULL,
        result jsonb NOT NULL,
        PRIMARY KEY (attempt_id, assessment_version)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX learning_assessment_attempts_learner_course
        ON learning_assessment_attempts (user_id, course_id, graded_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE learning_assessment_attempts');
  }
}
