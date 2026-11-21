import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitIdentitySchema1794770872799 implements MigrationInterface {
  name = 'InitIdentitySchema1794770872799';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "display_name" character varying(120) NOT NULL, "avatar_url" text, "bio" text, "role" character varying(20) NOT NULL DEFAULT 'STUDENT', "status" character varying(20) NOT NULL DEFAULT 'ACTIVE', "email_verified_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "family_id" uuid NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "replaced_by_session_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_d76f5941d821678137ef15d9651" UNIQUE ("token_hash"), CONSTRAINT "PK_9190032f6967b7971dca07d69f3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a7ab4fd82c654c85b9de53d971" ON "refresh_sessions"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f22ad614014a610b9851827b84" ON "refresh_sessions"  ("family_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_audits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "actor_id" uuid NOT NULL, "action" character varying(30) NOT NULL, "reason" text NOT NULL, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_05430a6b832feb7f5dd1a91c0ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a88b6b39493fa72a748886c8bc" ON "user_audits"  ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_sessions" ADD CONSTRAINT "FK_a7ab4fd82c654c85b9de53d971a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_sessions" DROP CONSTRAINT "FK_a7ab4fd82c654c85b9de53d971a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a88b6b39493fa72a748886c8bc"`,
    );
    await queryRunner.query(`DROP TABLE "user_audits"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f22ad614014a610b9851827b84"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a7ab4fd82c654c85b9de53d971"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
