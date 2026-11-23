import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type {
  CourseNotificationData,
  NotificationQuery,
  PageData,
} from '@lms/contracts';
import { Notification } from '../entities/notification.entity';
import { notificationData } from '../mappers/notification-data';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  async list(
    recipientId: string,
    query: NotificationQuery,
  ): Promise<PageData<CourseNotificationData>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
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
}
