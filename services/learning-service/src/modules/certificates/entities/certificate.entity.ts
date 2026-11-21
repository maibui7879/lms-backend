import type { CertificateStatus } from '@lms/contracts';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('learning_certificates')
export class Certificate {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @Column({ name: 'content_version', type: 'integer' })
  contentVersion!: number;

  @Column({ name: 'course_title', type: 'text' })
  courseTitle!: string;

  @Column({ name: 'verification_code', type: 'varchar', length: 32 })
  verificationCode!: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ type: 'text' })
  status!: CertificateStatus;

  @Column({ name: 'superseded_at', type: 'timestamptz', nullable: true })
  supersededAt!: Date | null;

  @Column({
    name: 'superseded_by_certificate_id',
    type: 'uuid',
    nullable: true,
  })
  supersededByCertificateId!: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy!: string | null;

  @Column({
    name: 'revocation_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  revocationReason!: string | null;
}
