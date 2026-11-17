import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseFilters,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiExceptionFilter } from '../../../common/api-error';
import { InternalServiceGuard } from '../../../common/internal-service.guard';
import { validateRequest } from '../../../common/validate-request';
import { CourseItemsMigrationService } from './course-items-migration.service';

@Controller('api/v1/internal/courses')
@UseGuards(InternalServiceGuard)
@UseFilters(ApiExceptionFilter)
export class CourseItemsMigrationController {
  constructor(private readonly migrations: CourseItemsMigrationService) {}

  @Post(':id/migrations')
  @HttpCode(204)
  async migrate(
    @Param('id') id: string,
    @Body() input: unknown,
    @Headers('x-request-id') requestId = 'learning-migration',
  ): Promise<void> {
    const body = validateRequest('MigrateCourseItemsRequest', input);
    await this.migrations.apply(
      validateRequest('Uuid', id).toLowerCase(),
      body,
      requestId,
    );
  }
}
