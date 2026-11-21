import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRefreshTokens1795192774462 implements MigrationInterface {
    name = 'AddRefreshTokens1795192774462'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role_requests" DROP COLUMN "requested_role"`);
        await queryRunner.query(`DROP TYPE "public"."role_requests_requested_role_enum"`);
        await queryRunner.query(`ALTER TABLE "role_requests" ADD "requested_role" character varying(32) NOT NULL DEFAULT 'INSTRUCTOR'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role_requests" DROP COLUMN "requested_role"`);
        await queryRunner.query(`CREATE TYPE "public"."role_requests_requested_role_enum" AS ENUM('STUDENT', 'INSTRUCTOR', 'ADMIN')`);
        await queryRunner.query(`ALTER TABLE "role_requests" ADD "requested_role" "public"."role_requests_requested_role_enum" NOT NULL DEFAULT 'INSTRUCTOR'`);
    }

}
