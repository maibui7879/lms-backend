import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizAuthModule } from '../../common/auth/quiz-auth.module';
import { IdempotencyKey } from '../../infrastructure/idempotency/idempotency-key.entity';
import { CourseClient } from '../../integrations/course.client';
import { Quiz } from './entities/quiz.entity';
import { QuizAttempt } from '../quiz-attempt/entities/quiz-attempt.entity';
import { QuizQuestion } from '../quiz-question/entities/quiz-question.entity';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

@Module({
  imports: [
    QuizAuthModule,
    TypeOrmModule.forFeature([Quiz, QuizAttempt, QuizQuestion, IdempotencyKey]),
  ],
  controllers: [QuizController],
  providers: [CourseClient, QuizService],
})
export class QuizModule {}
