import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PawaPayService } from './providers/pawapay.service';
import { PayPalService } from './providers/paypal.service';
import { LicensesModule } from '../licenses/licenses.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [LicensesModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PawaPayService, PayPalService],
  exports: [PaymentsService, PawaPayService, PayPalService],
})
export class PaymentsModule {}
