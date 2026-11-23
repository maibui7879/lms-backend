import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createNotification } from '../mappers/create-notification';

/** A single INSERT deduplicates broker redelivery before ACK. No Course DB access. */
@Injectable()
export class NotificationInboxService {
  constructor(private readonly database: DataSource) {}

  async accept(input: unknown): Promise<void> {
    const notification = createNotification(input);
    await this.database.query(
      `INSERT INTO notification.notifications
      (id, "recipientId", "courseId", "revisionId", type, title, message, "eventKey", "createdAt", "readAt", "emittedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL)
      ON CONFLICT ("eventKey") DO NOTHING`,
      [
        notification.id,
        notification.recipientId,
        notification.courseId,
        notification.revisionId,
        notification.type,
        notification.title,
        notification.message,
        notification.eventKey,
        notification.createdAt,
      ],
    );
  }
}
