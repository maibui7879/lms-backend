import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards';
import type { JwtAccessPayload } from '../../common/auth/jwt-payload.interface';
import { ListUsersQueryDto, UpdateUserStatusDto } from './dto/admin-users.dto';
import { Role, UsersService } from './users.service';

@ApiTags('Admin - Users & Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('api/v1/admin')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users with pagination and filters (ADMIN)' })
  async listUsers(@Query() query: ListUsersQueryDto) {
    return this.usersService.listUsersPaginated(query);
  }

  @Patch('users/:id/status')
  @ApiOperation({
    summary: 'Update user status (ACTIVE/BLOCKED), revoke sessions, and write audit log',
  })
  async updateUserStatus(
    @CurrentUser() admin: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.adminUpdateUserStatus(admin.sub, id, dto);
  }

  @Patch('users/:id/role')
  @ApiOperation({
    summary: 'Update user role with last-admin protection, session revocation, and audit log',
  })
  async updateUserRole(
    @CurrentUser() admin: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { role: Role; reason?: string },
  ) {
    return this.usersService.adminUpdateUserRoleWithAudit(
      admin.sub,
      id,
      body.role,
      body.reason,
    );
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'List admin audit logs with pagination (ADMIN)' })
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.listAuditLogs(
      Number(page) || 1,
      Number(limit) || 20,
    );
  }
}