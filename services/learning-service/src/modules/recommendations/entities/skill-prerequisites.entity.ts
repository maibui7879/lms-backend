import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { SkillPrerequisiteEdge } from '@lms/contracts';

@Entity('learning_skill_prerequisites')
export class SkillPrerequisites {
  @PrimaryColumn('uuid', { name: 'course_id' })
  courseId!: string;

  @Column('integer')
  version!: number;

  @Column('jsonb')
  edges!: SkillPrerequisiteEdge[];
}
