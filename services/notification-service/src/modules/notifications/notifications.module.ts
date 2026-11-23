import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationAuthGuard } from '../../auth/notification-auth.guard';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsGateway } from './gateways/notifications.gateway';
import { NotificationsService } from './services/notifications.service';
import { NotificationEventsConsumer } from './consumers/notification-events.consumer';
import { NotificationInboxService } from './services/notification-inbox.service';
import { NotificationDispatcherService } from './services/notification-dispatcher.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsController],
  providers: [
    NotificationAuthGuard,
    NotificationsGateway,
    NotificationsService,
    NotificationDispatcherService,
    NotificationEventsConsumer,
    NotificationInboxService,
  ],
  exports: [NotificationEventsConsumer],
})
export class NotificationsModule {}
