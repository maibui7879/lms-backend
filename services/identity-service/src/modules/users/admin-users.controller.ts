import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards';
import type { JwtAccessPayload } from '../../common/auth/jwt-payload.interface';
import {
  ListUsersQueryDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/admin-users.dto';
import { UsersService } from './users.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/v1/admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: '[ADMIN] List users with filters & pagination' })
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.usersService.listUsersPaginated(query);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '[ADMIN] Update user account status with version check' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: JwtAccessPayload,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.adminUpdateUserStatus(admin.sub, id, dto);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: '[ADMIN] Update user role with version check' })
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: JwtAccessPayload,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.adminUpdateUserRole(admin.sub, id, dto);
  }

  @Get(':id/audit')
  @ApiOperation({ summary: '[ADMIN] List audit history for a specific user' })
  listUserAudits(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.usersService.listUserAudits(id, page, limit);
  }
}