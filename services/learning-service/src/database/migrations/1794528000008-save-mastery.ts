import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SaveMastery1794528000008 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE learning_mastery_current (
        enrollment_id uuid NOT NULL,
        enrolled_at timestamptz NOT NULL,
        content_version integer NOT NULL,
        course_id uuid NOT NULL,
        user_id uuid NOT NULL,
        data jsonb NOT NULL,
        PRIMARY KEY (enrollment_id, enrolled_at, content_version)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE learning_mastery_snapshots (
        enrollment_id uuid NOT NULL,
        enrolled_at timestamptz NOT NULL,
        content_version integer NOT NULL,
        attempt_id uuid NOT NULL,
        assessment_version integer NOT NULL,
        effective_at timestamptz NOT NULL,
        graded_at timestamptz NOT NULL,
        data jsonb NOT NULL,
        PRIMARY KEY (enrollment_id, enrolled_at, content_version, attempt_id, assessment_version),
        FOREIGN KEY (attempt_id, assessment_version)
          REFERENCES learning_assessment_attempts (attempt_id, assessment_version)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX learning_mastery_snapshots_timeline
      ON learning_mastery_snapshots (
        enrollment_id, enrolled_at, content_version, effective_at DESC,
        graded_at DESC, attempt_id DESC, assessment_version DESC
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE learning_mastery_snapshots');
    await queryRunner.query('DROP TABLE learning_mastery_current');
  }
}
