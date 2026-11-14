import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { CourseRevisionStatus } from '@lms/contracts';

@Entity('course_revisions')
export class CourseRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  courseId!: string;

  @Column({ type: 'integer' })
  baseContentVersion!: number;

  @Column({ type: 'integer', nullable: true })
  contentVersion!: number | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status!: CourseRevisionStatus;

  @Column({ type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ type: 'varchar', length: 20, default: 'NORMAL' })
  updateType!: 'NORMAL' | 'CRITICAL';

  @Column({ type: 'varchar', length: 40, default: 'KEEP_ENROLLED_VERSION' })
  migrationPolicy!: 'KEEP_ENROLLED_VERSION' | 'MIGRATE_AFFECTED_ITEMS';
}
