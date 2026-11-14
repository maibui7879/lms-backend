import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { LearningStatus } from '@lms/contracts';

@Entity('learning_item_completions')
export class ItemCompletion {
  @PrimaryColumn('uuid', { name: 'enrollment_id' })
  enrollmentId!: string;

  @PrimaryColumn('integer', { name: 'content_version' })
  contentVersion!: number;

  @PrimaryColumn('uuid', { name: 'learning_item_id' })
  learningItemId!: string;

  @Column('timestamptz', {
    name: 'completed_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  completedAt!: Date;

  @Column('text', { default: 'COMPLETED' })
  status?: LearningStatus;

  @Column('integer', { name: 'migration_count', default: 0 })
  migrationCount?: number;

  @Column('timestamptz', { name: 'invalidated_at', nullable: true })
  invalidatedAt?: Date | null;

  @Column('text', { name: 'invalidation_reason', nullable: true })
  invalidationReason?: string | null;
}
