import { Injectable, Logger } from '@nestjs/common';
import type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { connect } from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import {
  ContractValidationError,
  COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
  ENROLLMENT_CREATED_V2_ROUTING_KEY,
} from '@lms/contracts';
import { NotificationInboxService } from '../services/notification-inbox.service';

const QUEUE = 'notification.course-review.v1';

const DLQ = `${QUEUE}.dead`;

const RETRY = `${QUEUE}.retry`;

@Injectable()
export class NotificationEventsConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationEventsConsumer.name);

  private connection?: ChannelModel;

  private channel?: Channel;

  private consumerTag?: string;

  private timer?: ReturnType<typeof setTimeout>;

  private stopped = false;

  private connecting?: Promise<void>;

  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly inbox: NotificationInboxService) {}

  get isConnected(): boolean {
    return !!this.channel;
  }

  onApplicationBootstrap(): void {
    if (process.env.RABBITMQ_URL) this.schedule(0);
    else
      this.logger.warn(
        'RABBITMQ_URL missing: notification ingestion is disabled',
      );
  }

  private schedule(delay: number): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.connecting = this.open()
        .catch(() => {
          this.logger.warn(
            'Notification broker unavailable; reconnect scheduled',
          );
          this.schedule(5000);
        })
        .finally(() => {
          this.connecting = undefined;
        });
    }, delay);
    this.timer.unref();
  }

  private async open(): Promise<void> {
    const connection = await connect(process.env.RABBITMQ_URL!, {
      timeout: 5000,
    });
    this.connection = connection;
    connection.on('error', () =>
      this.logger.warn('Notification broker connection error'),
    );
    connection.on('close', () => {
      if (this.connection !== connection) return;
      this.connection = undefined;
      this.channel = undefined;
      this.schedule(5000);
    });
    try {
      const channel = await connection.createConfirmChannel();
      channel.on('error', () =>
        this.logger.warn('Notification consumer channel error'),
      );
      channel.on('close', () => {
        if (this.channel === channel) {
          this.channel = undefined;
          void connection.close().catch(() => undefined);
        }
      });
      await channel.assertExchange('lms.events', 'topic', { durable: true });
      await channel.assertQueue(DLQ, { durable: true });
      await channel.assertQueue(RETRY, {
        durable: true,
        arguments: {
          'x-message-ttl': 5000,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': QUEUE,
        },
      });
      await channel.assertQueue(QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': DLQ,
        },
      });
      await channel.bindQueue(
        QUEUE,
        'lms.events',
        COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
      );
      await channel.prefetch(10);
      await channel.bindQueue(
        QUEUE,
        'lms.events',
        ENROLLMENT_CREATED_V2_ROUTING_KEY,
      );
      this.channel = channel;
      const subscription = await channel.consume(QUEUE, (message) => {
        if (!message) return;
        const work = this.handle(message, channel);
        this.pending.add(work);
        void work.finally(() => this.pending.delete(work));
      });
      this.consumerTag = subscription.consumerTag;
    } catch (error) {
      this.channel = undefined;
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private async handle(
    message: ConsumeMessage,
    channel: Awaited<ReturnType<ChannelModel['createConfirmChannel']>>,
  ): Promise<void> {
    try {
      if (message.content.length > 65536)
        throw new SyntaxError('Event too large');
      const event: unknown = JSON.parse(message.content.toString('utf8'));
      await this.inbox.accept(event);
      channel.ack(message);
    } catch (error) {
      try {
        if (
          error instanceof SyntaxError ||
          error instanceof ContractValidationError
        ) {
          channel.nack(message, false, false); // DLQ: invalid payloads are never retried.
          return;
        }
        const raw = Number(
          message.properties.headers?.['x-notification-retry'] ?? 0,
        );
        const attempts = Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
        if (attempts >= 5) {
          channel.nack(message, false, false);
          return;
        }
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Retry confirmation timeout')),
            5000,
          );
          channel.sendToQueue(
            RETRY,
            message.content,
            {
              persistent: true,
              contentType: 'application/json',
              messageId: message.properties.messageId,
              headers: {
                ...message.properties.headers,
                'x-notification-retry': attempts + 1,
              },
            },
            (err) => {
              clearTimeout(timeout);
              if (err) reject(err);
              else resolve();
            },
          );
        });
        channel.ack(message);
      } catch {
        // Closing the channel requeues unacknowledged work; never ACK a failed retry publish.
        await channel.close().catch(() => undefined);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.connecting;
    if (this.channel && this.consumerTag)
      await this.channel.cancel(this.consumerTag).catch(() => undefined);
    await Promise.allSettled(this.pending);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
