import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@lms/auth';
import { CourseAuthGuard } from '../../common/course-auth.guard';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type { AuthUser, PageQuery } from '@lms/contracts';
import type { Request } from 'express';
import { DiscussionsService } from './discussions.service';
import { validateCourseId } from '../courses/dto/course-request.pipe';
import { PageQueryPipe } from '../revision-metadata/page-query.pipe';

@Controller('api/v1')
@UseGuards(CourseAuthGuard)
export class DiscussionsController {
  constructor(private readonly discussions: DiscussionsService) {}

  @Get('courses/:id/discussions')
  async list(
    @Param('id') id: string,
    @Query(new PageQueryPipe()) query: PageQuery,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return {
      data: await this.discussions.list(validateCourseId(id), query, user),
      meta: { requestId: String(req.headers['x-request-id']) },
    };
  }

  @Post('courses/:id/discussions')
  async create(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return {
      data: await this.discussions.create(
        validateCourseId(id),
        parse('CreateDiscussionRequest', body),
        user,
      ),
      meta: { requestId: String(req.headers['x-request-id']) },
    };
  }

  @Patch('discussions/:id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return {
      data: await this.discussions.mutate(
        validateCourseId(id),
        parse('UpdateDiscussionRequest', body),
        user,
        'update',
      ),
      meta: { requestId: String(req.headers['x-request-id']) },
    };
  }

  @Delete('discussions/:id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    await this.discussions.mutate(
      validateCourseId(id),
      parse('VersionRequest', body),
      user,
      'delete',
    );
  }

  @Put('discussions/:id/pin')
  async pin(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return {
      data: await this.discussions.mutate(
        validateCourseId(id),
        parse('PinDiscussionRequest', body),
        user,
        'pin',
      ),
      meta: { requestId: String(req.headers['x-request-id']) },
    };
  }
}

function parse<
  N extends
    | 'CreateDiscussionRequest'
    | 'UpdateDiscussionRequest'
    | 'VersionRequest'
    | 'PinDiscussionRequest',
>(name: N, value: unknown) {
  try {
    return parseContract(name, value);
  } catch (error) {
    if (error instanceof ContractValidationError)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid discussion request',
        details: { issues: error.issues },
      });
    throw error;
  }
}
