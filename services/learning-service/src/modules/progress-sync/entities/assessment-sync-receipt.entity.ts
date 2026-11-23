import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { ProgressSyncData } from '@lms/contracts';

@Entity('learning_assessment_sync_receipts')
export class AssessmentSyncReceipt {
  @PrimaryColumn('uuid', { name: 'event_id' })
  eventId!: string;

  @Column('uuid', { name: 'attempt_id' })
  attemptId!: string;

  @Column('integer', { name: 'assessment_version', nullable: true })
  assessmentVersion!: number | null;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('uuid', { name: 'course_id' })
  courseId!: string;

  @Column('text')
  status!: ProgressSyncData['status'];

  @Column('timestamptz', {
    name: 'updated_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date;
}
