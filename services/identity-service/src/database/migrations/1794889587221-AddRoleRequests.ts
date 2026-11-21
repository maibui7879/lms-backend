import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRoleRequests1794889587221 implements MigrationInterface {
    name = 'AddRoleRequests1794889587221'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."role_requests_requested_role_enum" AS ENUM('STUDENT', 'INSTRUCTOR', 'ADMIN')`);
        await queryRunner.query(`CREATE TYPE "public"."role_requests_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "role_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "requested_role" "public"."role_requests_requested_role_enum" NOT NULL DEFAULT 'INSTRUCTOR', "reason" text NOT NULL, "status" "public"."role_requests_status_enum" NOT NULL DEFAULT 'PENDING', "reviewed_by" uuid, "review_note" text, "reviewed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_32873821a9e1122603cc2fb86a9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fb03dd758315425cbd4a90f537" ON "role_requests"  ("user_id", "status") `);
        await queryRunner.query(`ALTER TABLE "role_requests" ADD CONSTRAINT "FK_03f8a559ca73ddd3bbf6412a389" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role_requests" DROP CONSTRAINT "FK_03f8a559ca73ddd3bbf6412a389"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fb03dd758315425cbd4a90f537"`);
        await queryRunner.query(`DROP TABLE "role_requests"`);
        await queryRunner.query(`DROP TYPE "public"."role_requests_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."role_requests_requested_role_enum"`);
    }

}
