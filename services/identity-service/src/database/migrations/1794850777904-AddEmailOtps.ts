import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailOtps1794850777904 implements MigrationInterface {
    name = 'AddEmailOtps1794850777904'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "email_otps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "otp_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c66a6bae8086377ae2b0f5b177e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_123baa002ab017ac4f1e224775" ON "email_otps"  ("email") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_123baa002ab017ac4f1e224775"`);
        await queryRunner.query(`DROP TABLE "email_otps"`);
    }

}
