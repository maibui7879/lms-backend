import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationAuthGuard } from '../../common/notification-auth.guard';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationEventsConsumer } from './notification-events.consumer';
import { NotificationInboxService } from './notification-inbox.service';
@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsController],
  providers: [
    NotificationAuthGuard,
    NotificationsGateway,
    NotificationsService,
    NotificationEventsConsumer,
    NotificationInboxService,
  ],
  exports: [NotificationEventsConsumer],
})
export class NotificationsModule {}
