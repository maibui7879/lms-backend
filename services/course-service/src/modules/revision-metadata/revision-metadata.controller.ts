import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@lms/auth';
import { CourseAuthGuard } from '../../common/course-auth.guard';
import type { AuthUser, PageQuery } from '@lms/contracts';
import type { Request } from 'express';
import { validateCourseId } from '../courses/dto/course-request.pipe';
import { PageQueryPipe } from './page-query.pipe';
import { RevisionMetadataService } from './revision-metadata.service';
import { InternalServiceGuard } from '../../common/internal-service.guard';

@Controller('api/v1')
export class RevisionMetadataController {
  constructor(private readonly metadata: RevisionMetadataService) {}

  @Get('course-revisions/:id/changes')
  @UseGuards(CourseAuthGuard)
  async changes(
    @Param('id') id: string,
    @Query(new PageQueryPipe()) query: PageQuery,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return {
      data: await this.metadata.changes(validateCourseId(id), query, user),
      meta: { requestId: String(req.headers['x-request-id']) },
    };
  }

  @Get('courses/:id/patch-notices')
  @UseGuards(CourseAuthGuard)
  async notices(
    @Param('id') id: string,
    @Query(new PageQueryPipe()) query: PageQuery,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return {
      data: await this.metadata.notices(validateCourseId(id), query, user),
      meta: { requestId: String(req.headers['x-request-id']) },
    };
  }

  @Post('patch-notices/:id/read')
  @HttpCode(204)
  @UseGuards(CourseAuthGuard)
  async read(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.metadata.read(validateCourseId(id), user);
  }

  @Get('internal/course-revisions/:id/item-migration-context')
  @UseGuards(InternalServiceGuard)
  async context(@Param('id') id: string, @Req() req: Request) {
    return {
      data: await this.metadata.context(validateCourseId(id)),
      meta: { requestId: String(req.headers['x-request-id']) },
    };
  }
}
