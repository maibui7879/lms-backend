import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('learning_items')
export class LearningItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  courseId!: string;

  @Column({ type: 'uuid' })
  lessonId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: 'VIDEO' | 'READING' | 'QUIZ';

  @Column({ type: 'text', nullable: true })
  videoUrl!: string | null;

  @Column({ type: 'integer', nullable: true })
  durationSeconds!: number | null;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'uuid', nullable: true })
  quizId!: string | null;

  @Column({ type: 'integer', nullable: true })
  assessmentVersion!: number | null;

  @Column({ type: 'boolean', default: false })
  required!: boolean;

  @Column({ type: 'integer' })
  order!: number;

  @Column({ type: 'integer', default: 1 })
  contentVersion!: number;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
