import { Module } from '@nestjs/common';
import { QuizAuthModule } from '../../common/auth/quiz-auth.module';
import { QuizStatisticController } from './quiz-statistic.controller';
import { QuizStatisticService } from './quiz-statistic.service';

@Module({
  imports: [QuizAuthModule],
  controllers: [QuizStatisticController],
  providers: [QuizStatisticService],
})
export class QuizStatisticModule {}
