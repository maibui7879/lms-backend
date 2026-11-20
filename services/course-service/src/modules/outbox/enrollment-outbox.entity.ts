import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type {
  EnrollmentCreatedV2Event,
  EnrollmentCancelledEvent,
} from '@lms/contracts';

@Entity('course_event_outbox')
@Index('IDX_course_outbox_pending', ['createdAt'], {
  where: '"sentAt" IS NULL',
})
export class EnrollmentOutboxEvent {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  routingKey!: string;

  @Column({ type: 'jsonb' })
  event!: EnrollmentCreatedV2Event | EnrollmentCancelledEvent;

  @Column({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
}
