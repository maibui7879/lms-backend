import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ChapterData } from '@lms/contracts';

@Entity('chapters')
export class Chapter {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  courseId!: string;

  @Column({ type: 'uuid', nullable: true })
  revisionId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'jsonb', nullable: true })
  endSectionQuiz!: ChapterData['endSectionQuiz'];

  @Column({ type: 'integer' })
  order!: number;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
