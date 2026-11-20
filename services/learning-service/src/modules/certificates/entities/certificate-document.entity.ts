import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('learning_certificate_documents')
export class CertificateDocument {
  @PrimaryColumn({ name: 'certificate_id', type: 'uuid' })
  certificateId!: string;

  @Column({ name: 'recipient_name', type: 'varchar', length: 200 })
  recipientName!: string;

  @Column({ type: 'bytea' })
  pdf!: Buffer;
}
