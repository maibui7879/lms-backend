import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ChoiceData, QuestionDeliveryDTO } from '@lms/contracts';
import { Quiz } from '../../quiz/entities/quiz.entity';

@Entity({ name: 'quiz_questions' })
export class QuizQuestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'quiz_id', type: 'uuid' })
  quizId!: string;

  @ManyToOne(() => Quiz)
  @JoinColumn({ name: 'quiz_id' })
  quiz!: Quiz;

  @Column({
    type: 'enum',
    enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'],
    enumName: 'question_type',
  })
  type!: QuestionDeliveryDTO['type'];

  @Column({ type: 'text' })
  prompt!: string;

  @Column({ type: 'jsonb' })
  choices!: ChoiceData[];

  @Column({ name: 'correct_choice_ids', type: 'uuid', array: true })
  correctChoiceIds!: string[];

  @Column({
    name: 'skill_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'::uuid[]",
  })
  skillIds!: string[];

  @Column({ type: 'numeric' })
  points!: string;

  @Column({ type: 'text', nullable: true })
  explanation!: string | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
