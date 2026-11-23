import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizAuthModule } from '../../common/auth/quiz-auth.module';
import { IdempotencyKey } from '../../infrastructure/idempotency/idempotency-key.entity';
import { OutboxEvent } from '../../infrastructure/outbox/outbox-event.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { QuizQuestion } from '../quiz-question/entities/quiz-question.entity';
import { AttemptAnswer } from './entities/attempt-answer.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { QuizAttemptController } from './quiz-attempt.controller';
import { QuizAttemptService } from './quiz-attempt.service';

@Module({
  imports: [
    QuizAuthModule,
    TypeOrmModule.forFeature([
      Quiz,
      QuizQuestion,
      QuizAttempt,
      AttemptAnswer,
      OutboxEvent,
      IdempotencyKey,
    ]),
  ],
  controllers: [QuizAttemptController],
  providers: [QuizAttemptService],
})
export class QuizAttemptModule {}