import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationEventsConsumer } from '../modules/notifications/consumers/notification-events.consumer';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DataSource,
    private readonly broker: NotificationEventsConsumer,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', service: 'notification-service' };
  }

  @Get()
  async readiness() {
    try {
      await this.database.query(
        'SELECT 1 FROM notification.notifications LIMIT 1',
      );
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    if (process.env.RABBITMQ_URL && !this.broker.isConnected)
      throw new ServiceUnavailableException('Broker unavailable');
    return {
      status: 'ok',
      service: 'notification-service',
      database: 'up',
      broker: process.env.RABBITMQ_URL ? 'up' : 'disabled',
    };
  }
}
