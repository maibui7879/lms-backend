import { Column, Entity, PrimaryColumn } from 'typeorm';

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
}
