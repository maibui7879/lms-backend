import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { RoleRequestStatus } from '../entities/role-request.entity';

export class CreateRoleRequestDto {
  @ApiProperty({
    example: 'Tôi là giảng viên khoa CNTT, muốn đăng ký mở khóa học trên hệ thống.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reason is required' })
  @MaxLength(1000)
  reason!: string;
}

export class ReviewRoleRequestDto {
  @ApiProperty({
    enum: [RoleRequestStatus.APPROVED, RoleRequestStatus.REJECTED],
    example: RoleRequestStatus.APPROVED,
  })
  @IsEnum([RoleRequestStatus.APPROVED, RoleRequestStatus.REJECTED], {
    message: 'Decision must be APPROVED or REJECTED',
  })
  decision!: RoleRequestStatus.APPROVED | RoleRequestStatus.REJECTED;

  @ApiPropertyOptional({
    example: 'Hồ sơ hợp lệ, đã nâng cấp tài khoản lên Giảng viên.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}