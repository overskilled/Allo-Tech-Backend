import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Serverless Postgres (Neon) auto-suspends when idle; the first connect
    // after a cold start can time out (P1001). Retry with backoff so boot
    // survives the wake-up instead of crashing the whole app.
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        if (attempt > 1) this.logger.log(`Database connected on attempt ${attempt}`);
        return;
      } catch (err) {
        const last = attempt === maxAttempts;
        this.logger.warn(
          `Database connect attempt ${attempt}/${maxAttempts} failed${last ? '' : ', retrying…'}: ${(err as Error).message.split('\n')[0]}`,
        );
        if (last) throw err;
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
