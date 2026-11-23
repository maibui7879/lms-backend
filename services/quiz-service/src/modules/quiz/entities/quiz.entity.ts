import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { QuizPlacement, QuizPolicy, QuizStatus } from '@lms/contracts';

@Entity({ name: 'quizzes' })
export class Quiz {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ name: 'chapter_id', type: 'uuid' })
  chapterId!: string;

  @Column({ name: 'lesson_id', type: 'uuid', nullable: true })
  lessonId!: string | null;

  @Column({ name: 'instructor_id', type: 'uuid' })
  instructorId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({
    type: 'enum',
    enum: ['LESSON', 'SECTION_END'],
    enumName: 'quiz_placement',
  })
  placement!: QuizPlacement['placement'];

  @Column({
    type: 'enum',
    enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
    enumName: 'quiz_status',
    default: 'DRAFT',
  })
  status!: QuizStatus;

  @Column({ type: 'jsonb' })
  policy!: QuizPolicy;

  @Column({ name: 'assessment_version', type: 'integer', default: 1 })
  assessmentVersion!: number;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
