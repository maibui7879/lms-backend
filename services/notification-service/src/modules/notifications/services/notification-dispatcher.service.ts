import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { NotificationsGateway } from '../gateways/notifications.gateway';
import { notificationData } from '../mappers/notification-data';

@Injectable()
export class NotificationDispatcherService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationDispatcherService.name);

  private timer?: ReturnType<typeof setInterval>;

  private busy = false;

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    private readonly gateway: NotificationsGateway,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.dispatch(), 2000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Single-instance dispatcher; only committed inbox rows are visible. */
  async dispatch(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const pending = await this.notifications.find({
        where: { emittedAt: IsNull() },
        order: { createdAt: 'ASC' },
        take: 100,
      });
      for (const row of pending) {
        await this.gateway.publish(notificationData(row), row.recipientId);
        await this.notifications.update(
          { id: row.id, emittedAt: IsNull() },
          { emittedAt: new Date() },
        );
      }
    } catch {
      this.logger.warn(
        'Notification dispatch unavailable; pending rows will be retried',
      );
    } finally {
      this.busy = false;
    }
  }
}
