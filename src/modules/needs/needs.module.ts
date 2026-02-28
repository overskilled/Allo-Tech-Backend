import { Module } from '@nestjs/common';
import { NeedsController } from './needs.controller';
import { NeedsService } from './needs.service';
import { ProximityMatchingService } from './proximity-matching.service';
import { ProximityMatchingScheduler } from './proximity-matching.scheduler';

@Module({
  controllers: [NeedsController],
  providers: [NeedsService, ProximityMatchingService, ProximityMatchingScheduler],
  exports: [NeedsService, ProximityMatchingService],
})
export class NeedsModule {}
