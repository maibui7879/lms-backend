import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AdminAuditAction {
  APPROVE_ROLE_REQUEST = 'APPROVE_ROLE_REQUEST',
  REJECT_ROLE_REQUEST = 'REJECT_ROLE_REQUEST',
  CHANGE_ROLE = 'CHANGE_ROLE',
  CHANGE_STATUS = 'CHANGE_STATUS',
}

@Entity({ name: 'admin_audit_logs' })
export class AdminAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Index()
  @Column({ name: 'target_user_id', type: 'uuid' })
  targetUserId!: string;

  @Column({
    type: 'enum',
    enum: AdminAuditAction,
  })
  action!: AdminAuditAction;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
