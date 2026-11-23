import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Upgrade the existing Course schema without removing enrollment history. */
export class CourseContractAlignment1795132800001 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "initialPublishedContentVersion" integer`,
    );
    await runner.query(
      `ALTER TABLE "chapters" ADD COLUMN IF NOT EXISTS "endSectionQuiz" jsonb`,
    );
    await runner.query(`ALTER TABLE "course_revisions"
      ADD COLUMN IF NOT EXISTS "sourceItemIds" jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "sourceChapterIds" jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "sourceLessonIds" jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "completionPolicy" jsonb`);
    await runner.query(`UPDATE "courses" c SET "initialPublishedContentVersion" = COALESCE(
      (SELECT MIN(r."baseContentVersion") FROM "course_revisions" r WHERE r."courseId" = c.id AND r.status = 'PUBLISHED'),
      c."contentVersion") WHERE c.status = 'PUBLISHED' AND c."initialPublishedContentVersion" IS NULL`);
    await runner.query(`DROP INDEX IF EXISTS "IDX_a6f2eeafcbf0dd7a69fc91e295"`);
    await runner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_enrollments_current_pair" ON "enrollments" ("courseId", "userId") WHERE status IN ('ACTIVE', 'COMPLETED')`,
    );
  }

  down(): Promise<void> {
    throw new Error(
      'Restore a database backup to undo this history-preserving schema upgrade',
    );
  }
}
