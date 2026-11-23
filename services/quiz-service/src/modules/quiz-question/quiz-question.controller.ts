import { Controller, UseGuards } from '@nestjs/common';
import { QuizAuthGuard } from '../../common/auth/quiz-auth.guard';

@Controller('quiz-questions')
@UseGuards(QuizAuthGuard)
export class QuizQuestionController {}