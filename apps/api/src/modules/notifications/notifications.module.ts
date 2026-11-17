import { Module } from '@nestjs/common';
import { NotificationChannels } from './channels';
import { NotificationsController } from './notifications.controller';
import { NotificationDelivery, NotificationScheduler } from './notification.workers';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationChannels, NotificationScheduler, NotificationDelivery],
  exports: [NotificationScheduler, NotificationDelivery],
})
export class NotificationsModule {}
