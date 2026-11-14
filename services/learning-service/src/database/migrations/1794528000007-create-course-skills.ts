import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCourseSkills1794528000007 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE learning_course_skills (
        id uuid PRIMARY KEY,
        course_id uuid NOT NULL,
        name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
        description text NOT NULL CHECK (char_length(description) <= 2000),
        status text NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
        version integer NOT NULL CHECK (version > 0),
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX learning_course_skills_course
        ON learning_course_skills (course_id, created_at, id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE learning_course_skills');
  }
}
