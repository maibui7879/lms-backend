import { Injectable, Logger } from '@nestjs/common';
import type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { connect } from 'amqplib';
import {
  COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
  ENROLLMENT_CREATED_V2_ROUTING_KEY,
} from '@lms/contracts';
import { EnrollmentOutboxEvent } from './enrollment-outbox.entity';

/** At-least-once delivery: a crash after confirmation can replay the same eventId. */
@Injectable()
export class EnrollmentOutboxPublisher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(EnrollmentOutboxPublisher.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(private readonly database: DataSource) {}

  onApplicationBootstrap(): void {
    if (!process.env.RABBITMQ_URL) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.flush()
        .catch(() => {
          this.logger.warn(
            'Enrollment outbox delivery failed; pending events will be retried',
          );
        })
        .finally(() => {
          this.running = undefined;
        });
    }, 1000);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  async flush(): Promise<void> {
    const url = process.env.RABBITMQ_URL;
    if (!url) return;
    await this.database.transaction(async (manager) => {
      // Lock only committed rows. Parallel publishers skip each other's batches.
      const rows = await manager
        .getRepository(EnrollmentOutboxEvent)
        .createQueryBuilder('event')
        .where('event.sentAt IS NULL')
        .orderBy('event.createdAt', 'ASC')
        .addOrderBy('event.id', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .take(25)
        .getMany();
      if (!rows.length) return;
      const connection = await connect(url, { timeout: 5000 });
      connection.on('error', () =>
        this.logger.warn('Enrollment outbox broker connection error'),
      );
      try {
        const channel = await connection.createConfirmChannel();
        channel.on('error', () =>
          this.logger.warn('Enrollment outbox channel error'),
        );
        await channel.assertExchange('lms.events', 'topic', { durable: true });
        // Establish durable routing even before notification-service first starts.
        if (
          rows.some((row) =>
            [
              COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
              ENROLLMENT_CREATED_V2_ROUTING_KEY,
            ].includes(row.routingKey),
          )
        ) {
          const queue = 'notification.course-review.v1';
          const deadQueue = `${queue}.dead`;
          await channel.assertQueue(deadQueue, { durable: true });
          await channel.assertQueue(queue, {
            durable: true,
            arguments: {
              'x-dead-letter-exchange': '',
              'x-dead-letter-routing-key': deadQueue,
            },
          });
          await channel.bindQueue(
            queue,
            'lms.events',
            COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
          );
          await channel.bindQueue(
            queue,
            'lms.events',
            ENROLLMENT_CREATED_V2_ROUTING_KEY,
          );
        }
        for (const row of rows) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error('Outbox confirmation timeout')),
              5000,
            );
            channel.publish(
              'lms.events',
              row.routingKey,
              Buffer.from(JSON.stringify(row.event)),
              {
                persistent: true,
                contentType: 'application/json',
                messageId: row.id,
                correlationId: row.event.correlationId,
              },
              (error) => {
                clearTimeout(timeout);
                if (error) reject(error);
                else resolve();
              },
            );
          });
          await manager.update(
            EnrollmentOutboxEvent,
            { id: row.id },
            { sentAt: new Date() },
          );
        }
      } finally {
        await connection.close();
      }
    });
  }
}
