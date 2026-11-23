import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RevisionMetadataDiscussions1795132801000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "course_revision_changes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "revisionId" uuid NOT NULL,
      "entityType" varchar NOT NULL, "entityId" uuid NOT NULL, "changeType" varchar NOT NULL,
      "oldVersion" integer NULL, "newVersion" integer NULL, "isCritical" boolean NOT NULL,
      "summary" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(
      `CREATE INDEX "IDX_revision_changes_revision" ON "course_revision_changes" ("revisionId", "createdAt" DESC, "id")`,
    );
    await runner.query(`CREATE TABLE "course_patch_notices" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "courseId" uuid NOT NULL, "revisionId" uuid NOT NULL,
      "severity" varchar NOT NULL, "title" text NOT NULL, "message" text NOT NULL,
      "requiresAction" boolean NOT NULL, "publishedAt" timestamptz NOT NULL
    )`);
    await runner.query(
      `CREATE INDEX "IDX_patch_notices_course" ON "course_patch_notices" ("courseId", "publishedAt" DESC, "id")`,
    );
    await runner.query(`CREATE TABLE "course_patch_notice_reads" (
      "noticeId" uuid NOT NULL, "userId" uuid NOT NULL, "readAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("noticeId", "userId")
    )`);
    await runner.query(`CREATE TABLE "discussions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "courseId" uuid NOT NULL,
      "lessonId" uuid NULL, "parentId" uuid NULL, "authorId" uuid NOT NULL,
      "body" text NOT NULL, "pinned" boolean NOT NULL DEFAULT false, "version" integer NOT NULL DEFAULT 1,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(
      `CREATE INDEX "IDX_discussions_course" ON "discussions" ("courseId", "createdAt" DESC, "id")`,
    );
    await runner.query(
      `CREATE INDEX "IDX_discussions_parent" ON "discussions" ("parentId")`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    for (const table of [
      'discussions',
      'course_patch_notice_reads',
      'course_patch_notices',
      'course_revision_changes',
    ]) {
      await runner.query(`DROP TABLE "${table}"`);
    }
  }
}
