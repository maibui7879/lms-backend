import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InternalApiGuard } from '../../common/auth/internal-api.guard';
import { UsersService } from './users.service';

@ApiTags('Internal - Service Integration')
@ApiHeader({
  name: 'x-internal-api-key',
  description: 'Internal service credential key',
  required: true,
})
@UseGuards(InternalApiGuard)
@Controller('api/v1/internal/users')
export class InternalUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id/summary')
  @ApiOperation({ summary: 'Get minimal user summary for internal services' })
  async getUserSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getInternalUserSummary(id);
  }

  @Get(':id/access')
  @ApiOperation({
    summary: 'Check user active/role access status for Gateway/services',
  })
  async getUserAccess(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getInternalUserAccessStatus(id);
  }
}