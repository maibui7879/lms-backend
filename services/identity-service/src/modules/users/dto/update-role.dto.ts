import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum Role {
  STUDENT = 'STUDENT',
  INSTRUCTOR = 'INSTRUCTOR',
  ADMIN = 'ADMIN',
}

export class AdminUpdateRoleDto {
  @ApiProperty({ enum: Role, example: Role.INSTRUCTOR })
  @IsEnum(Role, { message: 'Invalid role' })
  role!: Role;
}
