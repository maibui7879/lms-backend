import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import type {
  BeforeApplicationShutdown,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ATTEMPT_GRADED_V2_ROUTING_KEY, parseContract } from '@lms/contracts';
import type { AttemptGradedV2Event } from '@lms/contracts';
import { connect } from 'amqplib';
import type {
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
  Message,
  RecoveringChannelModel,
} from 'amqplib';
import { AssessmentAttemptsRepository } from '../repositories/assessment-attempts.repository';

const exchange = 'lms.events';
const queue = 'learning.quiz-results.v2';
const deadLetterQueue = `${queue}.dlq`;
const retryDelays = [1000, 5000, 30000];

@Injectable()
export class AssessmentResultsConsumer
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(AssessmentResultsConsumer.name);
  private connection?: RecoveringChannelModel;

  constructor(private readonly attempts: AssessmentAttemptsRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    const url = process.env.RABBITMQ_URL;
    if (!url) return;

    this.connection = await connect(url, {
      timeout: 5000,
      recovery: {
        waitForConnect: false,
        setup: (connection: ChannelModel) => this.subscribe(connection),
      },
    });
    this.connection.on('error', () =>
      this.logger.warn('Quiz results broker connection error'),
    );
    this.connection.on('connect-failed', () =>
      this.logger.warn('Quiz results broker is unavailable, reconnecting'),
    );
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.connection?.close();
  }

  private async subscribe(connection: ChannelModel): Promise<void> {
    connection.on('error', () =>
      this.logger.warn('Quiz results broker connection error'),
    );
    const channel = await connection.createConfirmChannel();
    const closed = new AbortController();
    const reconnect = () => {
      void connection.close().catch(() => undefined);
    };
    channel.on('close', () => {
      closed.abort();
      reconnect();
    });
    channel.on('error', () =>
      this.logger.warn('Quiz results consumer channel error'),
    );
    await channel.assertExchange(exchange, 'topic', { durable: true });
    await channel.assertQueue(queue, { durable: true });
    await channel.assertQueue(deadLetterQueue, { durable: true });
    await channel.bindQueue(queue, exchange, ATTEMPT_GRADED_V2_ROUTING_KEY);
    await channel.prefetch(4);
    await channel.consume(
      queue,
      (message) => {
        if (!message) {
          reconnect();
          return;
        }
        void this.handleMessage(channel, message, closed.signal).catch(() => {
          if (!closed.signal.aborted) {
            this.logger.warn('Could not acknowledge or forward a quiz result');
            reconnect();
          }
        });
      },
      { noAck: false },
    );
  }

  private async handleMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    signal: AbortSignal,
  ): Promise<void> {
    let event: AttemptGradedV2Event;
    try {
      event = parseContract(
        'AttemptGradedV2Event',
        JSON.parse(message.content.toString('utf8')),
      );
      const { score, maxScore, passed, passingScorePercent, gradedAt } =
        event.payload;
      if (
        !Number.isFinite(Date.parse(gradedAt)) ||
        score > maxScore ||
        passed !== (score / maxScore) * 100 >= passingScorePercent
      ) {
        throw new Error('Quiz result is inconsistent');
      }
    } catch {
      await this.deadLetter(channel, message, 'INVALID_RESULT');
      return;
    }

    let retryMarked = false;
    for (const nextDelay of [...retryDelays, undefined]) {
      if (signal.aborted) return;
      let outcome: Awaited<ReturnType<AssessmentAttemptsRepository['record']>>;
      try {
        if (!retryMarked) {
          await this.attempts.markRetrying(event);
          retryMarked = true;
        }
        outcome = await this.attempts.record(event);
      } catch {
        if (signal.aborted) return;
        if (nextDelay === undefined) {
          await this.saveFailure(event);
          if (signal.aborted) return;
          await this.deadLetter(channel, message, 'STORAGE_UNAVAILABLE');
          return;
        }
        await delay(nextDelay, undefined, { signal });
        continue;
      }
      if (signal.aborted) return;
      if (outcome === 'CONFLICT') {
        await this.saveFailure(event);
        if (signal.aborted) return;
        await this.deadLetter(channel, message, 'EVENT_CONFLICT');
      } else {
        channel.ack(message);
      }
      return;
    }
  }

  private async saveFailure(event: AttemptGradedV2Event): Promise<void> {
    try {
      await this.attempts.markFailed(event);
    } catch {
      this.logger.warn('Quiz result failure receipt could not be saved');
    }
  }

  private async deadLetter(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    reason: string,
  ): Promise<void> {
    const messageId = randomUUID();
    let returned = false;
    const onReturn = (returnedMessage: Message) => {
      if (returnedMessage.properties.messageId === messageId) returned = true;
    };
    channel.on('return', onReturn);
    try {
      await new Promise<void>((resolve, reject) => {
        channel.sendToQueue(
          deadLetterQueue,
          message.content,
          {
            persistent: true,
            mandatory: true,
            messageId,
            headers: { 'x-learning-failure': reason },
          },
          (error: unknown) => {
            if (error)
              reject(new Error('Quiz DLQ publish failed', { cause: error }));
            else if (returned)
              reject(new Error('Quiz DLQ did not accept result'));
            else resolve();
          },
        );
      });
      channel.ack(message);
      this.logger.warn(`Quiz result sent to ${deadLetterQueue} (${reason})`);
    } finally {
      channel.off('return', onReturn);
    }
  }
}
