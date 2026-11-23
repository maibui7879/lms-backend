import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { MasteryHistoryPoint } from '@lms/contracts';

@Entity('learning_mastery_snapshots')
export class MasterySnapshot {
  @PrimaryColumn('uuid', { name: 'enrollment_id' })
  enrollmentId!: string;

  @PrimaryColumn('timestamptz', { name: 'enrolled_at' })
  enrolledAt!: Date;

  @PrimaryColumn('integer', { name: 'content_version' })
  contentVersion!: number;

  @PrimaryColumn('uuid', { name: 'attempt_id' })
  attemptId!: string;

  @PrimaryColumn('integer', { name: 'assessment_version' })
  assessmentVersion!: number;

  @Column('timestamptz', { name: 'effective_at' })
  effectiveAt!: Date;

  @Column('timestamptz', { name: 'graded_at' })
  gradedAt!: Date;

  @Column('jsonb')
  data!: MasteryHistoryPoint;
}
