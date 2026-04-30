import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { AdminKycController } from './admin-kyc.controller';
import { KycService } from './kyc.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [KycController, AdminKycController],
  providers: [KycService],
  exports: [KycService],
})
export class TechniciansModule {}
