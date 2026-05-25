import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';
import { ANALYTICS_EVENTS, type AnalyticsEvent } from '../../common/analytics/events';

export { ANALYTICS_EVENTS };

/**
 * Server-side analytics — the source of truth for state-transition and revenue
 * events (see src/common/analytics/events.ts). Every method is a no-op when
 * POSTHOG_KEY is unset, so local/test environments run without analytics.
 *
 * Capture is fire-and-forget and batched by posthog-node; we flush on shutdown.
 */
@Injectable()
export class AnalyticsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AnalyticsService.name);
  private client?: PostHog;
  private environment = 'development';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const key = this.config.get<string>('POSTHOG_KEY');
    this.environment = this.config.get<string>('NODE_ENV', 'development');
    if (!key) {
      this.logger.warn('POSTHOG_KEY not set — analytics disabled');
      return;
    }
    this.client = new PostHog(key, {
      host: this.config.get<string>('POSTHOG_HOST', 'https://us.i.posthog.com'),
      flushAt: 20,
      flushInterval: 10_000,
    });
    this.logger.log('PostHog analytics initialised');
  }

  /**
   * Emit an event attributed to a known user (the backend always knows the
   * UUID, so there is no anonymous→identified merge to worry about here).
   * `groups` lets us attribute to the `technician` group for supply analytics.
   */
  capture(params: {
    distinctId: string;
    event: AnalyticsEvent;
    properties?: Record<string, unknown>;
    groups?: Record<string, string>;
  }) {
    if (!this.client) return;
    try {
      this.client.capture({
        distinctId: params.distinctId,
        event: params.event,
        properties: {
          platform: 'backend',
          environment: this.environment,
          ...params.properties,
        },
        groups: params.groups,
      });
    } catch (err) {
      this.logger.error(`capture failed: ${(err as Error).message}`);
    }
  }

  /** Set/refresh person properties for a user. */
  identify(distinctId: string, properties: Record<string, unknown>) {
    if (!this.client) return;
    try {
      this.client.identify({ distinctId, properties });
    } catch (err) {
      this.logger.error(`identify failed: ${(err as Error).message}`);
    }
  }

  /** Set properties on a group (e.g. a `technician` for supply-side analytics). */
  groupIdentify(type: string, key: string, properties: Record<string, unknown>) {
    if (!this.client) return;
    try {
      this.client.groupIdentify({ groupType: type, groupKey: key, properties });
    } catch (err) {
      this.logger.error(`groupIdentify failed: ${(err as Error).message}`);
    }
  }

  async onApplicationShutdown() {
    await this.client?.shutdown();
  }
}
