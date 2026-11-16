import {
    Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards';
import type { JwtAccessPayload } from '../../common/auth/jwt-payload.interface';
import { UsersService } from './users.service';
import { AdminUpdateRoleDto, Role, SelectSelfRoleDto } from './dto/update-role.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  // Kiểu A: User tự chọn vai trò STUDENT hoặc INSTRUCTOR sau khi đăng nhập (chặn ADMIN)
  @Patch('me/role')
  @ApiOperation({ summary: 'Select own role (STUDENT or INSTRUCTOR)' })
  async selectMyRole(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: SelectSelfRoleDto,
  ) {
    const updated = await this.usersService.updateRole(currentUser.sub, dto.role);
    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      message: 'Role updated. Please log in again to get a new access token.',
    };
  }

  // Kiểu B: Chỉ ADMIN mới được quyền đổi role của user bất kỳ (dùng test luôn RolesGuard!)
  @Patch(':id/role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Update role for any user' })
  async adminUpdateUserRole(
    @Param('id') userId: string,
    @Body() dto: AdminUpdateRoleDto,
  ) {
    const updated = await this.usersService.updateRole(userId, dto.role);
    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
    };
  }
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  async getMe(@CurrentUser() currentUser: JwtAccessPayload) {
    const user = await this.usersService.findById(currentUser.sub);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      emailVerifiedAt: user.emailVerifiedAt
        ? user.emailVerifiedAt.toISOString()
        : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}