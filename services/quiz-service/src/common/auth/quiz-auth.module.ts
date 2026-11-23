import { Module } from '@nestjs/common';
import { InternalServiceGuard } from './internal-service.guard';
import { QuizAuthGuard } from './quiz-auth.guard';

@Module({
  providers: [QuizAuthGuard, InternalServiceGuard],
  exports: [QuizAuthGuard, InternalServiceGuard],
})
export class QuizAuthModule {}
