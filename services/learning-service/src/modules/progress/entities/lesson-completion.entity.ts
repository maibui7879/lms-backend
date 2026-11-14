import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('learning_lesson_completions')
export class LessonCompletion {
  @PrimaryColumn('uuid', { name: 'enrollment_id' })
  enrollmentId!: string;

  @PrimaryColumn('integer', { name: 'content_version' })
  contentVersion!: number;

  @PrimaryColumn('uuid', { name: 'lesson_id' })
  lessonId!: string;

  @Column('timestamptz', {
    name: 'completed_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  completedAt!: Date;

  @Column('integer', { name: 'migration_count', default: 0 })
  migrationCount?: number;
}
