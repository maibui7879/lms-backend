import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkCertificateReplacements1794528000013 implements MigrationInterface {
  async up(query: QueryRunner): Promise<void> {
    await query.query(`
      ALTER TABLE learning_certificates
        ADD COLUMN superseded_by_certificate_id uuid,
        ADD CONSTRAINT learning_certificates_replacement_fk
          FOREIGN KEY (superseded_by_certificate_id) REFERENCES learning_certificates(id)
          DEFERRABLE INITIALLY DEFERRED,
        ADD CONSTRAINT learning_certificates_replacement_check CHECK (
          superseded_by_certificate_id IS NULL
          OR (superseded_at IS NOT NULL AND superseded_by_certificate_id <> id)
        )
    `);
    await query.query(`
      WITH replacements AS (
        SELECT DISTINCT ON (previous.id) previous.id, replacement.id AS replacement_id
        FROM learning_certificates AS previous
        JOIN learning_certificates AS replacement
          ON replacement.user_id = previous.user_id
          AND replacement.course_id = previous.course_id
          AND replacement.content_version > previous.content_version
          AND replacement.issued_at = previous.superseded_at
        ORDER BY previous.id, replacement.content_version
      )
      UPDATE learning_certificates AS previous
      SET superseded_by_certificate_id = replacements.replacement_id
      FROM replacements WHERE previous.id = replacements.id
    `);
  }

  async down(query: QueryRunner): Promise<void> {
    await query.query(`
      ALTER TABLE learning_certificates
        DROP CONSTRAINT learning_certificates_replacement_fk,
        DROP CONSTRAINT learning_certificates_replacement_check,
        DROP COLUMN superseded_by_certificate_id
    `);
  }
}
