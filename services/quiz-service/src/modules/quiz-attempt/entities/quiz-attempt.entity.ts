import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  AttemptStatus,
  GradingStatus,
  ProgressSyncStatus,
  QuizPolicy,
} from '@lms/contracts';
import { Quiz } from '../../quiz/entities/quiz.entity';

@Entity({ name: 'quiz_attempts' })
export class QuizAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'quiz_id', type: 'uuid' })
  quizId!: string;

  @ManyToOne(() => Quiz)
  @JoinColumn({ name: 'quiz_id' })
  quiz!: Quiz;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'assessment_version', type: 'integer' })
  assessmentVersion!: number;

  @Column({ name: 'policy_snapshot', type: 'jsonb' })
  policySnapshot!: QuizPolicy;

  @Column({ name: 'questions_snapshot', type: 'jsonb' })
  questionsSnapshot!: unknown[];

  @Column({
    name: 'attempt_status',
    type: 'enum',
    enum: ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED'],
    enumName: 'attempt_status',
    default: 'IN_PROGRESS',
  })
  attemptStatus!: AttemptStatus;

  @Column({
    name: 'grading_status',
    type: 'enum',
    enum: ['NOT_GRADED', 'GRADED'],
    enumName: 'grading_status',
    default: 'NOT_GRADED',
  })
  gradingStatus!: GradingStatus;

  @Column({ type: 'numeric', nullable: true })
  score!: string | null;

  @Column({ name: 'max_score', type: 'numeric', nullable: true })
  maxScore!: string | null;

  @Column({ type: 'boolean', nullable: true })
  passed!: boolean | null;

  @Column({ name: 'graded_at', type: 'timestamptz', nullable: true })
  gradedAt!: Date | null;

  @Column({ name: 'skill_scores', type: 'jsonb', nullable: true })
  skillScores!: Record<string, unknown> | null;

  @Column({
    name: 'progress_sync_status',
    type: 'enum',
    enum: ['PENDING', 'SYNCED', 'FAILED'],
    enumName: 'progress_sync_status',
    nullable: true,
  })
  progressSyncStatus!: ProgressSyncStatus | null;

  @Column({ name: 'event_id', type: 'uuid', nullable: true, unique: true })
  eventId!: string | null;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ type: 'integer', default: 0 })
  revision!: number;
}
