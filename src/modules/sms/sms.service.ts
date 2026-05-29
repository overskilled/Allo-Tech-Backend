import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Africa's Talking SMS gateway.
 *
 * Production-readiness notes from the AT docs:
 *
 *  1. Status semantics. The synchronous response only confirms how far AT
 *     pushed the message into its pipeline — it does NOT confirm delivery to
 *     the handset. Useful states (per AT support):
 *       - "Success"   : reached the handset (only seen after the carrier ACKs)
 *       - "Sent"      : handed off to the telco gateway
 *       - "Submitted" : accepted by the telco, queued for delivery
 *       - "Queued"    : queued by AT before reaching the telco
 *       - "Buffered"  : carrier is buffering (slow path)
 *     Real failure strings: "InvalidSenderId", "InvalidPhoneNumber",
 *     "InsufficientBalance", "UserInBlacklist", "CouldNotSend", "NoNetwork",
 *     "RiskHold", "Rejected". Numeric status codes 100/101/102 = OK;
 *     4xx/5xx = failure (see AT docs).
 *     Delivery confirmation only via Delivery Reports webhook (out of scope
 *     here — but trivial to add: POST callback URL configured in the AT
 *     dashboard).
 *
 *  2. Cameroon (+237) deliverability. AT REQUIRES a registered Sender ID for
 *     reliable delivery to MTN / Orange CM (the default short-code
 *     "AFRICASTKNG" is widely filtered). Registration is free in CM (≤11
 *     chars, KYC form). Until that's in place, deliveries are unreliable
 *     even though the API returns Success and bills the message.
 *     Set `AT_SENDER_ID` once the alphanumeric is approved (e.g. "ALLOTECH").
 *
 *  3. Env vars:
 *       AT_USERNAME    — account username ("sandbox" in sandbox mode)
 *       AT_API_KEY     — API key from the AT dashboard
 *       AT_SENDER_ID   — registered alphanumeric (omit to use default)
 *       AT_SANDBOX     — "true" to hit the sandbox endpoint (no real delivery)
 */

const AT_OK_STATUSES = new Set(['Success', 'Sent', 'Submitted', 'Queued', 'Buffered']);
const AT_OK_STATUS_CODES = new Set([100, 101, 102]); // Processed / Sent / Queued

interface AtRecipient {
  statusCode: number;
  number: string;
  status: string;
  cost: string;
  messageId: string;
}

interface AtResponse {
  SMSMessageData?: {
    Message?: string;
    Recipients?: AtRecipient[];
  };
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly username: string;
  private readonly apiKey: string;
  private readonly senderId?: string;
  private readonly endpoint: string;
  private readonly isSandbox: boolean;

  constructor(private readonly config: ConfigService) {
    this.username = this.config.get<string>('AT_USERNAME') ?? '';
    this.apiKey = this.config.get<string>('AT_API_KEY') ?? '';
    this.senderId = this.config.get<string>('AT_SENDER_ID') || undefined;
    this.isSandbox = this.config.get<string>('AT_SANDBOX') === 'true';
    this.endpoint = this.isSandbox
      ? 'https://api.sandbox.africastalking.com/version1/messaging'
      : 'https://api.africastalking.com/version1/messaging';

    if (this.enabled && !this.senderId && !this.isSandbox) {
      // Loud, one-shot startup warning: production sends without a registered
      // sender ID typically fail silently for Cameroon networks.
      this.logger.warn(
        'AT_SENDER_ID is not set. Africa\'s Talking will fall back to its ' +
          'default short-code (AFRICASTKNG), which is often filtered by ' +
          'Cameroon carriers (MTN, Orange). Register an alphanumeric Sender ' +
          'ID for CM (free, ≤11 chars) and set AT_SENDER_ID to its value.',
      );
    }
  }

  /** True when credentials are configured. */
  get enabled(): boolean {
    return !!(this.username && this.apiKey);
  }

  /**
   * Send a single SMS. `to` should be in E.164 format (e.g. "+237680000000").
   * Resolves on a status the AT pipeline considers OK (Success / Sent /
   * Submitted / Queued / Buffered); throws with the AT-reported reason for
   * any real failure (InvalidPhoneNumber, InsufficientBalance, etc.).
   *
   * Note: a resolved Promise does NOT guarantee the handset received the
   * message. Use a Delivery Reports webhook to track final delivery state.
   */
  async sendSms(to: string, message: string): Promise<{ messageId?: string; cost?: string; status: string }> {
    if (!this.enabled) {
      // Surface clearly in logs but don't crash callers — useful in local dev.
      this.logger.warn(
        `SMS not sent (AT credentials missing). to=${to} message="${message}"`,
      );
      return { status: 'Skipped' };
    }

    const body = new URLSearchParams({
      username: this.username,
      to,
      message,
      ...(this.senderId ? { from: this.senderId } : {}),
    });

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          apiKey: this.apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
    } catch (err) {
      this.logger.error(`SMS transport error to=${to}: ${(err as Error).message}`);
      throw err;
    }

    const text = await response.text();

    // HTTP-level error (auth, rate-limit, malformed request, etc.).
    if (!response.ok) {
      this.logger.error(`SMS API HTTP ${response.status} to=${to}: ${text}`);
      throw new Error(`SMS gateway returned HTTP ${response.status}: ${text}`);
    }

    let data: AtResponse;
    try {
      data = JSON.parse(text) as AtResponse;
    } catch {
      this.logger.error(`SMS API non-JSON response to=${to}: ${text}`);
      throw new Error('SMS gateway returned non-JSON response');
    }

    const recipients = data.SMSMessageData?.Recipients ?? [];
    const r = recipients[0];

    // No recipients returned: usually invalid phone format. The top-level
    // Message field carries the human-readable reason.
    if (!r) {
      const why = data.SMSMessageData?.Message ?? 'No recipient returned';
      this.logger.error(`SMS rejected by AT (no recipient) to=${to}: ${why}`);
      throw new Error(`SMS rejected: ${why}`);
    }

    const ok =
      AT_OK_STATUSES.has(r.status) || AT_OK_STATUS_CODES.has(r.statusCode);

    if (!ok) {
      this.logger.error(
        `SMS rejected by AT to=${to} status="${r.status}" code=${r.statusCode} ` +
          `messageId=${r.messageId ?? 'n/a'} cost=${r.cost ?? 'n/a'}`,
      );
      throw new Error(`SMS rejected: ${r.status} (code ${r.statusCode})`);
    }

    // Log accepted sends with full traceability. Note: "accepted" ≠ "delivered".
    // The carrier may still drop the message (esp. CM without a registered
    // sender ID) — track delivery via the AT Delivery Reports webhook.
    this.logger.log(
      `SMS accepted by AT to=${to} status="${r.status}" code=${r.statusCode} ` +
        `messageId=${r.messageId} cost=${r.cost}` +
        (this.isSandbox ? ' [SANDBOX — no real delivery]' : ''),
    );

    return { messageId: r.messageId, cost: r.cost, status: r.status };
  }

  /** Convenience wrapper for the password-reset OTP message. */
  async sendPasswordResetOtp(to: string, otp: string): Promise<void> {
    const message = `Allo-Tech: Votre code de reinitialisation est ${otp}. Valable 10 minutes. Ne le partagez avec personne.`;
    await this.sendSms(to, message);
  }
}
