import { Controller, UseGuards } from '@nestjs/common';
import { QuizAuthGuard } from '../../common/auth/quiz-auth.guard';

@Controller('quiz-attempts')
@UseGuards(QuizAuthGuard)
export class QuizAttemptController {}