import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('course_reviews')
export class CourseReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  courseId!: string;

  @Column({ type: 'varchar', length: 10 })
  decision!: 'APPROVE' | 'REJECT';

  @Column({ type: 'varchar', length: 20 })
  status!: 'PUBLISHED' | 'REJECTED';

  @Column({ type: 'uuid' })
  reviewedBy!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  reviewedAt!: Date;

  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  /** Course version that this review transitioned. */
  @Column({ type: 'integer' })
  version!: number;
}
