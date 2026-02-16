import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationSigningController } from './quotation-signing.controller';
import { QuotationsService } from './quotations.service';

@Module({
  controllers: [QuotationsController, QuotationSigningController],
  providers: [QuotationsService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
