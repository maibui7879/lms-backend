import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserRole } from '@lms/contracts';
import type { UserEntity } from './user.entity';

export enum RoleRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity({ name: 'role_requests' })
@Index(['userId', 'status'])
export class RoleRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne('UserEntity', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({
    name: 'requested_role',
    type: 'varchar',
    length: 32,
    default: 'INSTRUCTOR',
  })
  requestedRole!: UserRole;

  @Column({ type: 'text' })
  reason!: string;

  @Column({
    type: 'enum',
    enum: RoleRequestStatus,
    default: RoleRequestStatus.PENDING,
  })
  status!: RoleRequestStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
