import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CourseNotificationData } from '@lms/contracts';

@Entity({ name: 'notifications', schema: 'notification' })
@Index('IDX_notifications_recipient', ['recipientId', 'createdAt'])
@Index('UQ_notifications_event', ['eventKey'], { unique: true })
export class Notification {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) recipientId!: string;
  @Column({ type: 'uuid' }) courseId!: string;
  @Column({ type: 'uuid', nullable: true }) revisionId!: string | null;
  @Column({ type: 'varchar', length: 40 })
  type!: CourseNotificationData['type'];
  @Column({ type: 'varchar', length: 200 }) title!: string;
  @Column({ type: 'text' }) message!: string;
  @Column({ type: 'varchar', length: 200 }) eventKey!: string;
  @Column({ type: 'timestamptz' }) createdAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) readAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) emittedAt!: Date | null;
}
