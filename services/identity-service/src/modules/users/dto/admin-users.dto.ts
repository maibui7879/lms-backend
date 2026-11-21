import type { AccountStatus, UserRole } from '@lms/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class ListUsersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] })
  @IsOptional()
  @IsIn(['ADMIN', 'INSTRUCTOR', 'STUDENT'])
  role?: UserRole;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: AccountStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: AccountStatus;

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  reason!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] })
  @IsIn(['ADMIN', 'INSTRUCTOR', 'STUDENT'])
  role!: UserRole;

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  reason!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
