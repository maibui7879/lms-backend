import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { type AccountStatus, Role, UserStatus } from '../users.service';

const ACCOUNT_STATUS_VALUES = Object.values(UserStatus);

export class ListUsersQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: ACCOUNT_STATUS_VALUES })
  @IsOptional()
  @IsIn(ACCOUNT_STATUS_VALUES)
  status?: AccountStatus;

  @ApiPropertyOptional({ description: 'Search by email or displayName' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ACCOUNT_STATUS_VALUES, example: UserStatus.BLOCKED })
  @IsIn(ACCOUNT_STATUS_VALUES)
  status!: AccountStatus;

  @ApiPropertyOptional({ example: 'Violated platform terms of service' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}