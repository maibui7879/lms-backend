import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizAuthModule } from '../../common/auth/quiz-auth.module';
import { IdempotencyKey } from '../../infrastructure/idempotency/idempotency-key.entity';
import { Quiz } from './entities/quiz.entity';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

@Module({
  imports: [
    QuizAuthModule,
    TypeOrmModule.forFeature([Quiz, IdempotencyKey]),
  ],
  controllers: [QuizController],
  providers: [QuizService],
})
export class QuizModule {}