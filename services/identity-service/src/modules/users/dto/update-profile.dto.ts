import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'https://example.com/avatar.png',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl()
  avatarUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Lập trình viên Backend' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  bio?: string | null;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ChangePasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}