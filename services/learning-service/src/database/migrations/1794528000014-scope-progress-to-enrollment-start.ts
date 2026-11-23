import type { MigrationInterface, QueryRunner } from 'typeorm';

const tables = [
  ['learning_item_completions', ', learning_item_id'],
  ['learning_lesson_completions', ', lesson_id'],
  ['learning_resume_checkpoints', ''],
] as const;

export class ScopeProgressToEnrollmentStart1794528000014 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, itemKey] of tables) {
      await queryRunner.query(`
        ALTER TABLE ${table}
        ADD COLUMN enrolled_at timestamptz NOT NULL DEFAULT '0001-01-01T00:00:00Z',
        DROP CONSTRAINT ${table}_pkey,
        ADD PRIMARY KEY (enrollment_id, content_version, enrolled_at${itemKey})
      `);
      await queryRunner.query(
        `ALTER TABLE ${table} ALTER COLUMN enrolled_at DROP DEFAULT`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, itemKey] of tables) {
      // PostgreSQL refuses the old key if multiple sessions share it.
      await queryRunner.query(`
        ALTER TABLE ${table}
        DROP CONSTRAINT ${table}_pkey,
        DROP COLUMN enrolled_at,
        ADD PRIMARY KEY (enrollment_id, content_version${itemKey})
      `);
    }
  }
}
