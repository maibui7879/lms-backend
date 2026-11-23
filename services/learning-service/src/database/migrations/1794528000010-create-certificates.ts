import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCertificates1794528000010 implements MigrationInterface {
  async up(query: QueryRunner): Promise<void> {
    await query.query(`
      CREATE TABLE learning_certificates (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        course_id uuid NOT NULL,
        enrollment_id uuid NOT NULL,
        content_version integer NOT NULL CHECK (content_version >= 1),
        course_title text NOT NULL,
        verification_code varchar(32) NOT NULL UNIQUE,
        issued_at timestamptz NOT NULL,
        status text NOT NULL,
        superseded_at timestamptz,
        CONSTRAINT learning_certificates_status_check CHECK (
          (status = 'ACTIVE' AND superseded_at IS NULL) OR
          (status = 'SUPERSEDED' AND superseded_at >= issued_at AND superseded_at IS NOT NULL)
        ),
        UNIQUE (user_id, course_id, content_version)
      )
    `);
    await query.query(`
      CREATE UNIQUE INDEX learning_certificates_one_active
        ON learning_certificates (user_id, course_id) WHERE status = 'ACTIVE'
    `);
    await query.query(`
      CREATE INDEX learning_certificates_by_user
        ON learning_certificates (user_id, issued_at DESC, id DESC)
    `);
    await query.query(`
      CREATE TABLE learning_certificate_issuance_receipts (
        user_id uuid NOT NULL,
        course_id uuid NOT NULL,
        key varchar(128) NOT NULL,
        certificate_id uuid NOT NULL REFERENCES learning_certificates(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        PRIMARY KEY (user_id, course_id, key)
      )
    `);
  }

  async down(query: QueryRunner): Promise<void> {
    await query.query('DROP TABLE learning_certificate_issuance_receipts');
    await query.query('DROP TABLE learning_certificates');
  }
}
