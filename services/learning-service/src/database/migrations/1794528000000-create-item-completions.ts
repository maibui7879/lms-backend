import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateItemCompletions1794528000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE learning_item_completions (
        enrollment_id uuid NOT NULL,
        content_version integer NOT NULL CHECK (content_version >= 1),
        learning_item_id uuid NOT NULL,
        completed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (enrollment_id, content_version, learning_item_id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE learning_item_completions');
  }
}
