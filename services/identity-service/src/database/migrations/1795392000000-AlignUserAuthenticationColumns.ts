import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignUserAuthenticationColumns1795392000000 implements MigrationInterface {
  name = 'AlignUserAuthenticationColumns1795392000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "oauth_provider" varchar(30),
        ADD COLUMN IF NOT EXISTS "oauth_provider_id" varchar(255),
        ALTER COLUMN "password_hash" DROP NOT NULL,
        ALTER COLUMN "version" SET DEFAULT 1
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL rejects rollback if OAuth users have no local password.
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "password_hash" SET NOT NULL,
        ALTER COLUMN "version" DROP DEFAULT,
        DROP COLUMN "oauth_provider_id",
        DROP COLUMN "oauth_provider"
    `);
  }
}
