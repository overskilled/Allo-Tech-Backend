import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MissionsService } from './missions.service';

/**
 * §6.2 — Drives the RDV timing rules: pre-appointment reminders and the
 * auto-cancel/reopen at 30 min past the rendez-vous. Runs every 5 minutes.
 */
@Injectable()
export class MissionTimingScheduler {
  private readonly logger = new Logger(MissionTimingScheduler.name);

  constructor(private readonly missionsService: MissionsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleRdvTiming() {
    try {
      await this.missionsService.runScheduledTimeouts();
    } catch (error: any) {
      this.logger.error(`RDV timing job failed: ${error?.message}`);
    }
  }
}
