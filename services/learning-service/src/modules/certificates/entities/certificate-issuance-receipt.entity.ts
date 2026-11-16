import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('learning_certificate_issuance_receipts')
export class CertificateIssuanceReceipt {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @PrimaryColumn({ type: 'varchar', length: 128 })
  key!: string;

  @Column({ name: 'certificate_id', type: 'uuid' })
  certificateId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
