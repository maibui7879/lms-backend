import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCertificateRevocation1794528000012 implements MigrationInterface {
  async up(query: QueryRunner): Promise<void> {
    await query.query(`
      ALTER TABLE learning_certificates
        DROP CONSTRAINT learning_certificates_status_check,
        ADD COLUMN revoked_at timestamptz,
        ADD COLUMN revoked_by uuid,
        ADD COLUMN revocation_reason varchar(500),
        ADD CONSTRAINT learning_certificates_status_check CHECK (
          ((status = 'ACTIVE' AND superseded_at IS NULL) OR
           (status = 'SUPERSEDED' AND superseded_at IS NOT NULL AND superseded_at >= issued_at))
          AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL
          OR
          (status = 'REVOKED' AND revoked_at IS NOT NULL AND revoked_at >= issued_at
           AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL
           AND revocation_reason ~ '[^[:space:]]'
           AND (superseded_at IS NULL OR superseded_at BETWEEN issued_at AND revoked_at))
        )
    `);
  }

  async down(query: QueryRunner): Promise<void> {
    // Restoring this constraint refuses a downgrade once a revocation exists.
    await query.query(`
      ALTER TABLE learning_certificates
        DROP CONSTRAINT learning_certificates_status_check,
        ADD CONSTRAINT learning_certificates_status_check CHECK (
          (status = 'ACTIVE' AND superseded_at IS NULL) OR
          (status = 'SUPERSEDED' AND superseded_at IS NOT NULL AND superseded_at >= issued_at)
        ),
        DROP COLUMN revoked_at,
        DROP COLUMN revoked_by,
        DROP COLUMN revocation_reason
    `);
  }
}
