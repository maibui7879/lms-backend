import { Column, Entity, PrimaryColumn } from 'typeorm';
import type {
  CourseItemMigrationContext,
  MigrateCourseItemsRequest,
} from '@lms/contracts';

@Entity('learning_course_item_migrations')
export class CourseItemMigration {
  @PrimaryColumn('uuid', { name: 'revision_id' })
  revisionId!: string;

  @PrimaryColumn('uuid', { name: 'target_item_id' })
  targetItemId!: string;

  @PrimaryColumn('text')
  policy!: MigrateCourseItemsRequest['policy'];

  @Column('uuid', { name: 'course_id' })
  courseId!: string;

  @Column('integer', { name: 'content_version' })
  contentVersion!: number;

  @Column('integer')
  generation!: number;

  @Column('text')
  reason!: string;

  @Column('jsonb')
  context!: CourseItemMigrationContext['items'][number];

  @Column('timestamptz', {
    name: 'applied_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  appliedAt!: Date;
}
