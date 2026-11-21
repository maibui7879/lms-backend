import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { AdminUsersController } from './admin-users.controller';
import { RoleRequestEntity } from './entities/role-request.entity';
import { UserAuditEntity } from './entities/user-audit.entity';
import { UserEntity } from './entities/user.entity';
import { InternalUsersController } from './internal-users.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      RoleRequestEntity,
      UserAuditEntity,
      RefreshTokenEntity,
    ]),
  ],
  controllers: [
    UsersController,
    AdminUsersController,
    InternalUsersController,
  ],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}