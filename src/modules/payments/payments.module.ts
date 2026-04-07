import { Module, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PawaPayService } from './providers/pawapay.service';
import { PayPalService } from './providers/paypal.service';
import { LicensesModule } from '../licenses/licenses.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotationsModule } from '../quotations/quotations.module';

@Module({
  imports: [
    LicensesModule,
    NotificationsModule,
    forwardRef(() => QuotationsModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PawaPayService, PayPalService],
  exports: [PaymentsService, PawaPayService, PayPalService],
})
export class PaymentsModule {}
