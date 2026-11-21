import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum Role {
  STUDENT = 'STUDENT',
}

export class RegisterDto {
  @ApiProperty({ example: 'student@lms.edu.vn' })
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  @ApiProperty({ example: 'StrongPass123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72)
  password!: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @IsNotEmpty({ message: 'Display name is required' })
  @MaxLength(120)
  displayName!: string;
}
