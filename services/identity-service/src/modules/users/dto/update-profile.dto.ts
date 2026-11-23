import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { UserGender } from '../entities/user.entity';

export class UpdateProfileDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-()]{8,20}$/, {
    message: 'Invalid phone number format',
  })
  phoneNumber?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth?: string | null;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: UserGender | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string | null;

  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'avatarUrl must be a valid URL' },
  )
  avatarUrl?: string | null;

  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'githubUrl must be a valid URL' },
  )
  @MaxLength(255)
  githubUrl?: string | null;

  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'linkedinUrl must be a valid URL' },
  )
  @MaxLength(255)
  linkedinUrl?: string | null;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
