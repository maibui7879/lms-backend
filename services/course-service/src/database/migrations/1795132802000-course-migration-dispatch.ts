import type { MigrationInterface, QueryRunner } from 'typeorm';
export class CourseMigrationDispatch1795132802000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "course_migration_dispatches" (
      "revisionId" uuid PRIMARY KEY, "courseId" uuid NOT NULL,
      request jsonb NOT NULL, "sentAt" timestamptz NULL)`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE "course_migration_dispatches"');
  }
}
