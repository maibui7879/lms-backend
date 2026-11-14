import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { MasteryData } from '@lms/contracts';

@Entity('learning_mastery_current')
export class MasteryCurrent {
  @PrimaryColumn('uuid', { name: 'enrollment_id' })
  enrollmentId!: string;

  @PrimaryColumn('timestamptz', { name: 'enrolled_at' })
  enrolledAt!: Date;

  @PrimaryColumn('integer', { name: 'content_version' })
  contentVersion!: number;

  @Column('uuid', { name: 'course_id' })
  courseId!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('jsonb')
  data!: MasteryData;
}
