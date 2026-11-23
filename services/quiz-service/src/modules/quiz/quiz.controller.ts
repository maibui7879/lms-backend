import { Controller, UseGuards } from '@nestjs/common';
import { QuizAuthGuard } from '../../common/auth/quiz-auth.guard';
import { QuizService } from './quiz.service';

@Controller('quizzes')
@UseGuards(QuizAuthGuard)
export class QuizController {
  //tiêm DI giúp controller có thể sử dụng các phương thức của service
  constructor(private readonly quizService: QuizService) {}
}
