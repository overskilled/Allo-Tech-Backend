import { Module, forwardRef } from '@nestjs/common';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import { MissionTimingScheduler } from './mission-timing.scheduler';
import { MessagingModule } from '../messaging/messaging.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotationsModule } from '../quotations/quotations.module';

@Module({
  imports: [
    MessagingModule,
    forwardRef(() => PaymentsModule),
    NotificationsModule,
    forwardRef(() => QuotationsModule),
  ],
  controllers: [MissionsController],
  providers: [MissionsService, MissionTimingScheduler],
  exports: [MissionsService],
})
export class MissionsModule {}
