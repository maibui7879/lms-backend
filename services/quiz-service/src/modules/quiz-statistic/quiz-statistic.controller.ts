import { Controller, UseGuards } from '@nestjs/common';
import { QuizAuthGuard } from '../../common/auth/quiz-auth.guard';

@Controller('quiz-statistics')
@UseGuards(QuizAuthGuard)
export class QuizStatisticController {}