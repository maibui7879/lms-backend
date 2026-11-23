import type { AccountStatus, UserRole } from '@lms/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserGender = 'MALE' | 'FEMALE' | 'OTHER';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 254, unique: true })
  email!: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  passwordHash!: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName!: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 20, nullable: true })
  phoneNumber!: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  gender!: UserGender | null;

  @Column({ type: 'varchar', length: 32, default: 'STUDENT' })
  role!: UserRole;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: AccountStatus;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ name: 'github_url', type: 'varchar', length: 255, nullable: true })
  githubUrl!: string | null;

  @Column({
    name: 'linkedin_url',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  linkedinUrl!: string | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({
    name: 'password_changed_at',
    type: 'timestamptz',
    nullable: true,
  })
  passwordChangedAt!: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({
    name: 'oauth_provider',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  oauthProvider!: 'LOCAL' | 'GOOGLE' | 'GITHUB' | null;

  @Column({
    name: 'oauth_provider_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  oauthProviderId!: string | null;
}
