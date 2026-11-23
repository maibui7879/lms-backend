import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CourseAuthoring1795132803000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE courses ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await runner.query(
      `ALTER TABLE learning_items ADD COLUMN "bodyFormat" varchar(20) NOT NULL DEFAULT 'PLAIN_TEXT', ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await runner.query(
      `CREATE INDEX courses_metadata_gin ON courses USING gin (metadata)`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX courses_metadata_gin`);
    await runner.query(
      `ALTER TABLE learning_items DROP COLUMN attachments, DROP COLUMN "bodyFormat"`,
    );
    await runner.query(`ALTER TABLE courses DROP COLUMN metadata`);
  }
}
