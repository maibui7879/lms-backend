import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, MockAuthGuard } from '@lms/auth';
import type {
  ApiResponse,
  AuthUser,
  CourseCompletionPolicy,
  UpdateCompletionPolicyRequest,
} from '@lms/contracts';
import type { Request } from 'express';
import { validateCourseId } from '../courses/dto/course-request.pipe';
import { CompletionPolicyService } from './completion-policy.service';
import { UpdateCompletionPolicyPipe } from './dto/completion-policy-request.pipe';

@Controller('api/v1/courses')
@UseGuards(MockAuthGuard)
export class CompletionPolicyController {
  constructor(private readonly policies: CompletionPolicyService) {}

  @Get(':id/completion-policy')
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseCompletionPolicy>> {
    return {
      data: await this.policies.get(validateCourseId(id), user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Put(':id/completion-policy')
  async update(
    @Param('id') id: string,
    @Body(UpdateCompletionPolicyPipe) body: UpdateCompletionPolicyRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseCompletionPolicy>> {
    return {
      data: await this.policies.update(validateCourseId(id), body, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
}
