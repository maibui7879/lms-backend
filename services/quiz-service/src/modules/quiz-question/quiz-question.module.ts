import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizAuthModule } from '../../common/auth/quiz-auth.module';
import { Quiz } from '../quiz/entities/quiz.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizQuestionController } from './quiz-question.controller';
import { QuizQuestionService } from './quiz-question.service';

@Module({
  imports: [QuizAuthModule, TypeOrmModule.forFeature([Quiz, QuizQuestion])],
  controllers: [QuizQuestionController],
  providers: [QuizQuestionService],
})
export class QuizQuestionModule {}