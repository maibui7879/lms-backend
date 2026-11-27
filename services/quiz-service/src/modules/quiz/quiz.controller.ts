import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@lms/auth';
import type { AuthenticatedRequest } from '@lms/auth';
import type {
  ApiResponse,
  AuthUser,
  CreateQuizRequest,
  QuizData,
  UpdateQuizRequest,
} from '@lms/contracts';
import type { Request } from 'express';
import { apiResponse } from '../../common/api-response';
import { QuizAuthGuard } from '../../common/auth/quiz-auth.guard';
import { CreateQuizPipe, UpdateQuizPipe } from './dto/create-quiz.dto';
import { QuizService } from './quiz.service';

@Controller('api/v1/quizzes')
@UseGuards(QuizAuthGuard)
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(UpdateQuizPipe) body: UpdateQuizRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<QuizData>> {
    const authRequest = request as Request & AuthenticatedRequest;
    const data = await this.quizService.update(id, body, user, {
      authorization:
        typeof authRequest.headers.authorization === 'string'
          ? authRequest.headers.authorization
          : undefined,
      mockUser:
        typeof authRequest.headers['x-mock-user'] === 'string'
          ? authRequest.headers['x-mock-user']
          : undefined,
      requestId: String(authRequest.headers['x-request-id']),
    });
    return apiResponse(data, String(authRequest.headers['x-request-id']));
  }

  @Post()
  async create(
    @Body(CreateQuizPipe) body: CreateQuizRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<QuizData>> {
    const authRequest = request as Request & AuthenticatedRequest;
    const data: QuizData = await this.quizService.create(body, user, {
      authorization:
        typeof authRequest.headers.authorization === 'string'
          ? authRequest.headers.authorization
          : undefined,
      mockUser:
        typeof authRequest.headers['x-mock-user'] === 'string'
          ? authRequest.headers['x-mock-user']
          : undefined,
      requestId: String(authRequest.headers['x-request-id']),
    });

    return apiResponse(data, String(authRequest.headers['x-request-id']));
  }
}
