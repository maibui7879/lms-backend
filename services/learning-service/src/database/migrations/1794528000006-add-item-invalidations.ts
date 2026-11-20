import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddItemInvalidations1794528000006 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE learning_item_completions
        ADD COLUMN status text NOT NULL DEFAULT 'COMPLETED'
          CHECK (status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','OUTDATED','RESET')),
        ADD COLUMN invalidated_at timestamptz,
        ADD COLUMN invalidation_reason text,
        ADD COLUMN migration_count integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE learning_lesson_completions ADD COLUMN migration_count integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(
      'ALTER TABLE learning_resume_checkpoints ADD COLUMN migration_count integer NOT NULL DEFAULT 0',
    );
    await queryRunner.query(`
      CREATE TABLE learning_course_item_migrations (
        revision_id uuid NOT NULL,
        target_item_id uuid NOT NULL,
        policy text NOT NULL CHECK (policy IN ('REQUIRE_RECOMPLETION','NOTIFY_ONLY')),
        course_id uuid NOT NULL,
        content_version integer NOT NULL CHECK (content_version > 0),
        generation integer NOT NULL CHECK (generation > 0),
        reason text NOT NULL,
        context jsonb NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (revision_id, target_item_id, policy)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX learning_course_item_migrations_course
        ON learning_course_item_migrations (course_id, content_version)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE learning_course_item_migrations');
    await queryRunner.query(`
      ALTER TABLE learning_item_completions
        DROP COLUMN status, DROP COLUMN invalidated_at, DROP COLUMN invalidation_reason,
        DROP COLUMN migration_count
    `);
    await queryRunner.query(
      'ALTER TABLE learning_lesson_completions DROP COLUMN migration_count',
    );
    await queryRunner.query(
      'ALTER TABLE learning_resume_checkpoints DROP COLUMN migration_count',
    );
  }
}
