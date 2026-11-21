import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'student@lms.edu.vn' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'student@lms.edu.vn' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  otp!: string;

  @ApiProperty({ example: 'NewStrongPass@123' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
