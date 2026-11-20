import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { EnrollmentStatus } from '@lms/contracts';

@Entity('enrollments')
@Index('IDX_enrollments_current_pair', ['courseId', 'userId'], {
  unique: true,
  where: `"status" IN ('ACTIVE', 'COMPLETED')`,
})
export class Enrollment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  courseId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status!: EnrollmentStatus;

  @Column({ type: 'timestamptz' })
  enrolledAt!: Date;

  /** Content requirements pinned when the learner enrolled. */
  @Column({ type: 'integer' })
  contentVersion!: number;
}
