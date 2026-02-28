import { Module, forwardRef } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationSigningController } from './quotation-signing.controller';
import { QuotationsService } from './quotations.service';
import { CounterProposalsService } from './counter-proposals.service';
import { MissionsModule } from '../missions/missions.module';

@Module({
  imports: [forwardRef(() => MissionsModule)],
  controllers: [QuotationsController, QuotationSigningController],
  providers: [QuotationsService, CounterProposalsService],
  exports: [QuotationsService, CounterProposalsService],
})
export class QuotationsModule {}
