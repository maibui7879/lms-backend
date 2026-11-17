import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSkillPrerequisites1794528000009 implements MigrationInterface {
  async up(query: QueryRunner): Promise<void> {
    await query.query(`
      CREATE TABLE learning_skill_prerequisites (
        course_id uuid PRIMARY KEY,
        version integer NOT NULL CHECK (version >= 1),
        edges jsonb NOT NULL CHECK (jsonb_typeof(edges) = 'array')
      )
    `);
  }

  async down(query: QueryRunner): Promise<void> {
    await query.query('DROP TABLE learning_skill_prerequisites');
  }
}
