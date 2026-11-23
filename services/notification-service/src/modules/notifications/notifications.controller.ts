import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@lms/auth';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type { AuthUser, NotificationQuery } from '@lms/contracts';
import type { Request } from 'express';
import { NotificationAuthGuard } from '../../common/notification-auth.guard';
import { NotificationsService } from './notifications.service';

function queryFor(value: Record<string, unknown>): NotificationQuery {
  const input = { ...value };
  for (const field of ['page', 'limit'])
    if (typeof input[field] === 'string' && input[field] !== '')
      input[field] = Number(input[field]);
  if (input.unreadOnly === 'true') input.unreadOnly = true;
  if (input.unreadOnly === 'false') input.unreadOnly = false;
  try {
    return parseContract('NotificationQuery', input);
  } catch (error) {
    if (error instanceof ContractValidationError)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid notification query',
        details: { issues: error.issues },
      });
    throw error;
  }
}
@Controller('api/v1/notifications')
@UseGuards(NotificationAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
  ) {
    return {
      data: await this.notifications.list(user.id, queryFor(query)),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
  @Get('unread-count')
  async count(@CurrentUser() user: AuthUser, @Req() request: Request) {
    return {
      data: await this.notifications.unreadCount(user.id),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
  @Put(':id/read')
  async read(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    try {
      parseContract('Uuid', id);
    } catch {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid notification id',
      });
    }
    return {
      data: await this.notifications.markRead(id, user.id),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
}
