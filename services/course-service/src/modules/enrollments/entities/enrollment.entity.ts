import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { EnrollmentStatus } from '@lms/contracts';

@Entity('enrollments')
@Index(['courseId', 'userId'], { unique: true })
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
