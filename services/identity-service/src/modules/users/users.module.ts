import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalApiGuard } from '../../common/auth/internal-api.guard';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { AdminUsersController } from './admin-users.controller';
import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';
import { RoleRequestEntity } from './entities/role-request.entity';
import { UserEntity } from './entities/user.entity';
import { InternalUsersController } from './internal-users.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      RoleRequestEntity,
      AdminAuditLogEntity,
      RefreshTokenEntity,
    ]),
  ],
  controllers: [
    UsersController,
    AdminUsersController,
    InternalUsersController,
  ],
  providers: [UsersService, InternalApiGuard],
  exports: [UsersService],
})
export class UsersModule {}