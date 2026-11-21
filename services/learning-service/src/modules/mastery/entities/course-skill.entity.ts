import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { CourseSkillStatus } from '@lms/contracts';

@Entity('learning_course_skills')
export class CourseSkill {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'course_id' })
  courseId!: string;

  @Column('text')
  name!: string;

  @Column('text')
  description!: string;

  @Column('text')
  status!: CourseSkillStatus;

  @Column('integer')
  version!: number;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
