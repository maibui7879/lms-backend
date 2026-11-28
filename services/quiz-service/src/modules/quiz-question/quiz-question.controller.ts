import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@lms/auth';
import type {
  AuthUser,
  ApiResponse,
  CreateQuestionRequest,
  PageData,
  PageQuery,
  QuestionAuthoringDTO,
  UpdateQuestionRequest,
  VersionRequest,
} from '@lms/contracts';
import type { Request } from 'express';
import { apiResponse } from '../../common/api-response';
import { QuizAuthGuard } from '../../common/auth/quiz-auth.guard';
import type { CourseRequestContext } from '../../integrations/course.client';
import {
  CreateQuestionPipe,
  DeleteQuestionPipe,
  QuestionPageQueryPipe,
  UpdateQuestionPipe,
} from './dto/create-question.pipe';
import { QuizQuestionService } from './quiz-question.service';

@Controller('api/v1')
@UseGuards(QuizAuthGuard)
export class QuizQuestionController {
  constructor(private readonly questions: QuizQuestionService) {}

  @Get('quizzes/:id/questions')
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(QuestionPageQueryPipe) query: PageQuery,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<PageData<QuestionAuthoringDTO>>> {
    const context: CourseRequestContext = {
      authorization: request.headers.authorization,
      mockUser:
        typeof request.headers['x-mock-user'] === 'string'
          ? request.headers['x-mock-user']
          : undefined,
      requestId: String(request.headers['x-request-id']),
    };
    return apiResponse(
      await this.questions.list(id, query, user, context),
      context.requestId,
    );
  }

  @Delete('questions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(DeleteQuestionPipe) body: VersionRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.questions.remove(id, body, user, {
      authorization: request.headers.authorization,
      mockUser:
        typeof request.headers['x-mock-user'] === 'string'
          ? request.headers['x-mock-user']
          : undefined,
      requestId: String(request.headers['x-request-id']),
    });
  }

  @Patch('questions/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(UpdateQuestionPipe) body: UpdateQuestionRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<QuestionAuthoringDTO>> {
    const context: CourseRequestContext = {
      authorization: request.headers.authorization,
      mockUser:
        typeof request.headers['x-mock-user'] === 'string'
          ? request.headers['x-mock-user']
          : undefined,
      requestId: String(request.headers['x-request-id']),
    };
    return apiResponse(
      await this.questions.update(id, body, user, context),
      context.requestId,
    );
  }

  @Post('quizzes/:id/questions')
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(CreateQuestionPipe) body: CreateQuestionRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<QuestionAuthoringDTO>> {
    const context: CourseRequestContext = {
      authorization: request.headers.authorization,
      mockUser:
        typeof request.headers['x-mock-user'] === 'string'
          ? request.headers['x-mock-user']
          : undefined,
      requestId: String(request.headers['x-request-id']),
    };
    return apiResponse(
      await this.questions.create(id, body, user, context),
      context.requestId,
    );
  }
}
