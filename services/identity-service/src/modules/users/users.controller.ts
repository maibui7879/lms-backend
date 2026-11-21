import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/auth.decorators';
import { JwtAuthGuard } from '../../common/auth/guards';
import type { JwtAccessPayload } from '../../common/auth/jwt-payload.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser() user: JwtAccessPayload) {
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
}