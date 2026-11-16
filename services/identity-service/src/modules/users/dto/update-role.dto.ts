import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum Role {
  STUDENT = 'STUDENT',
  INSTRUCTOR = 'INSTRUCTOR',
  ADMIN = 'ADMIN',
}

export class SelectSelfRoleDto {
  @ApiProperty({ enum: [Role.STUDENT, Role.INSTRUCTOR], example: Role.INSTRUCTOR })
  @IsEnum([Role.STUDENT, Role.INSTRUCTOR], {
    message: 'Role must be either STUDENT or INSTRUCTOR',
  })
  role!: Role.STUDENT | Role.INSTRUCTOR;
}

export class AdminUpdateRoleDto {
  @ApiProperty({ enum: Role, example: Role.INSTRUCTOR })
  @IsEnum(Role, { message: 'Invalid role' })
  role!: Role;
}