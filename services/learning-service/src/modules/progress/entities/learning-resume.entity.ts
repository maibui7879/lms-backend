import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('learning_resume_checkpoints')
export class LearningResume {
  @PrimaryColumn('uuid', { name: 'enrollment_id' })
  enrollmentId!: string;

  @PrimaryColumn('integer', { name: 'content_version' })
  contentVersion!: number;

  @Column('uuid', { name: 'lesson_id' })
  lessonId!: string;

  @Column('uuid', { name: 'learning_item_id' })
  learningItemId!: string;

  @Column('double precision', { name: 'position_seconds', nullable: true })
  positionSeconds!: number | null;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;

  @Column('integer')
  revision!: number;

  @Column('integer', { name: 'migration_count', default: 0 })
  migrationCount?: number;
}
