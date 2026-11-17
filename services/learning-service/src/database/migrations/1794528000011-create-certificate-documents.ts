import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCertificateDocuments1794528000011 implements MigrationInterface {
  async up(query: QueryRunner): Promise<void> {
    await query.query(`
      CREATE TABLE learning_certificate_documents (
        certificate_id uuid PRIMARY KEY REFERENCES learning_certificates(id) ON DELETE CASCADE,
        recipient_name varchar(200) NOT NULL,
        pdf bytea NOT NULL CHECK (octet_length(pdf) > 0)
      )
    `);
  }

  async down(query: QueryRunner): Promise<void> {
    await query.query('DROP TABLE learning_certificate_documents');
  }
}
