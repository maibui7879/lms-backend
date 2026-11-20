import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards';
import type { JwtAccessPayload } from '../../common/auth/jwt-payload.interface';
import {
  CreateRoleRequestDto,
  ReviewRoleRequestDto,
} from './dto/role-request.dto';
import { AdminUpdateRoleDto, Role } from './dto/update-role.dto';
import { RoleRequestStatus } from './entities/role-request.entity';
import { UsersService } from './users.service';
import { ChangePasswordDto, UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
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

  @Post('role-requests')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: '[STUDENT] Submit request to become an INSTRUCTOR' })
  async submitRoleRequest(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: CreateRoleRequestDto,
  ) {
    return this.usersService.createRoleRequest(currentUser.sub, dto);
  }

  @Get('role-requests/me')
  @ApiOperation({ summary: 'Get current user role upgrade request history' })
  async getMyRoleRequests(@CurrentUser() currentUser: JwtAccessPayload) {
    return this.usersService.getMyRoleRequests(currentUser.sub);
  }

  @Get('role-requests')
  @Roles(Role.ADMIN)
  @ApiQuery({ name: 'status', enum: RoleRequestStatus, required: false })
  @ApiOperation({ summary: '[ADMIN] List all role upgrade requests' })
  async getRoleRequests(@Query('status') status?: RoleRequestStatus) {
    const requests = await this.usersService.listRoleRequests(status);
    return requests.map((req) => ({
      id: req.id,
      userId: req.userId,
      userEmail: req.user?.email,
      userDisplayName: req.user?.displayName,
      requestedRole: req.requestedRole,
      reason: req.reason,
      status: req.status,
      reviewNote: req.reviewNote,
      reviewedAt: req.reviewedAt,
      createdAt: req.createdAt,
    }));
  }

  @Patch('role-requests/:requestId/review')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Approve or reject a role upgrade request' })
  async reviewRoleRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() admin: JwtAccessPayload,
    @Body() dto: ReviewRoleRequestDto,
  ) {
    return this.usersService.reviewRoleRequest(requestId, admin.sub, dto);
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Directly update role for any user' })
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

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile (displayName, bio, avatarUrl)' })
  async updateMe(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.usersService.updateProfile(currentUser.sub, dto);
    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      status: updated.status,
      avatarUrl: updated.avatarUrl ?? null,
      bio: updated.bio ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(currentUser.sub, dto);
    return {
      message: 'Password changed successfully. Please log in again on other devices.',
    };
  }
}