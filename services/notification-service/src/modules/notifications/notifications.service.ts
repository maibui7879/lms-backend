import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type {
  CourseNotificationData,
  NotificationQuery,
  PageData,
} from '@lms/contracts';
import { Notification } from './notification.entity';
import { NotificationsGateway } from './notifications.gateway';

export function notificationData(row: Notification): CourseNotificationData {
  return {
    id: row.id,
    courseId: row.courseId,
    revisionId: row.revisionId,
    type: row.type,
    title: row.title,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

@Injectable()
export class NotificationsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    private readonly gateway: NotificationsGateway,
  ) {}
  async list(
    recipientId: string,
    query: NotificationQuery,
  ): Promise<PageData<CourseNotificationData>> {
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const [rows, total] = await this.notifications.findAndCount({
      where: { recipientId, ...(query.unreadOnly ? { readAt: IsNull() } : {}) },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(notificationData), page, limit, total };
  }
  async unreadCount(recipientId: string): Promise<{ count: number }> {
    return {
      count: await this.notifications.count({
        where: { recipientId, readAt: IsNull() },
      }),
    };
  }
  async markRead(
    id: string,
    recipientId: string,
  ): Promise<CourseNotificationData> {
    await this.notifications.update(
      { id, recipientId, readAt: IsNull() },
      { readAt: new Date() },
    );
    const row = await this.notifications.findOneBy({ id, recipientId });
    if (!row) throw new NotFoundException('Notification not found');
    return notificationData(row);
  }
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
