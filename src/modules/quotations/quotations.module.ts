import { Module, forwardRef } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationSigningController } from './quotation-signing.controller';
import { QuotationsService } from './quotations.service';
import { CounterProposalsService } from './counter-proposals.service';
import { MissionsModule } from '../missions/missions.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    forwardRef(() => MissionsModule),
    forwardRef(() => PaymentsModule),
    NotificationsModule,
  ],
  controllers: [QuotationsController, QuotationSigningController],
  providers: [QuotationsService, CounterProposalsService],
  exports: [QuotationsService, CounterProposalsService],
})
export class QuotationsModule {}
