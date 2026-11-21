import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards';
import type { JwtAccessPayload } from '../../common/auth/jwt-payload.interface';
import { CreateRoleRequestDto } from './dto/role-request.dto';
import { ChangePasswordDto, UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: JwtAccessPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile with optimistic locking' })
  updateMe(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change current user password and revoke all sessions' })
  async changePassword(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(user.sub, dto);
  }

  @Post('me/role-requests')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Student requests upgrade to INSTRUCTOR role' })
  createRoleRequest(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateRoleRequestDto,
  ) {
    return this.usersService.createRoleRequest(user.sub, dto);
  }

  @Get('me/role-requests')
  @ApiOperation({ summary: 'List current user role upgrade requests' })
  getMyRoleRequests(@CurrentUser() user: JwtAccessPayload) {
    return this.usersService.getMyRoleRequests(user.sub);
  }
}