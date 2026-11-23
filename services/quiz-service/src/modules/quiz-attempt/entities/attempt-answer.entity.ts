import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuizQuestion } from '../../quiz-question/entities/quiz-question.entity';
import { QuizAttempt } from './quiz-attempt.entity';

@Entity({ name: 'attempt_answers' })
export class AttemptAnswer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId!: string;

  @ManyToOne(() => QuizAttempt)
  @JoinColumn({ name: 'attempt_id' })
  attempt!: QuizAttempt;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  @ManyToOne(() => QuizQuestion)
  @JoinColumn({ name: 'question_id' })
  question!: QuizQuestion;

  @Column({ name: 'quiz_id', type: 'uuid' })
  quizId!: string;

  @Column({
    name: 'selected_choice_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'::uuid[]",
  })
  selectedChoiceIds!: string[];

  @Column({ name: 'points_awarded', type: 'numeric', nullable: true })
  pointsAwarded!: string | null;

  @Column({ name: 'is_correct', type: 'boolean', nullable: true })
  isCorrect!: boolean | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
