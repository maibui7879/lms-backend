import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type UserAuditAction = 'STATUS_CHANGED' | 'ROLE_CHANGED';

@Entity({ name: 'user_audits' })
export class UserAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ type: 'varchar', length: 32 })
  action!: UserAuditAction;

  @Column({ type: 'text' })
  reason!: string;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}