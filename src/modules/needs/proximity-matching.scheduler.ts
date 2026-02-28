import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProximityMatchingService } from './proximity-matching.service';

@Injectable()
export class ProximityMatchingScheduler {
  private readonly logger = new Logger(ProximityMatchingScheduler.name);

  constructor(
    private readonly proximityMatchingService: ProximityMatchingService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleProximityBroadcasts() {
    this.logger.debug('Processing proximity broadcasts...');
    try {
      await this.proximityMatchingService.processActiveBroadcasts();
    } catch (error: any) {
      this.logger.error(`Proximity broadcast processing failed: ${error?.message}`);
    }
  }
}
