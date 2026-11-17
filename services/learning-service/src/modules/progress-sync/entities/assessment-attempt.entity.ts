import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { GradedAssessmentSummary } from '@lms/contracts';

@Entity('learning_assessment_attempts')
export class AssessmentAttempt {
  @PrimaryColumn('uuid', { name: 'attempt_id' })
  attemptId!: string;

  @PrimaryColumn('integer', { name: 'assessment_version' })
  assessmentVersion!: number;

  @Column('uuid', { name: 'event_id', unique: true })
  eventId!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('uuid', { name: 'course_id' })
  courseId!: string;

  @Column('timestamptz', { name: 'graded_at' })
  gradedAt!: Date;

  @Column('jsonb')
  result!: GradedAssessmentSummary;
}
