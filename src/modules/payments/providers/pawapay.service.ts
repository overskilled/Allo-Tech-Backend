import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface PawaPayDepositRequest {
  depositId: string;
  amount: string;
  currency: string;
  correspondent: string; // Mobile operator code
  payer: {
    type: 'MSISDN';
    address: {
      value: string; // Phone number
    };
  };
  customerTimestamp: string;
  statementDescription: string;
  metadata?: Array<{ fieldName: string; fieldValue: string }>;
}

export interface PawaPayDepositResponse {
  depositId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_IGNORED';
  created: string;
  rejectionReason?: {
    rejectionCode: string;
    rejectionMessage: string;
  };
}

export interface PawaPayDepositStatus {
  depositId: string;
  status: 'ACCEPTED' | 'PENDING' | 'COMPLETED' | 'FAILED';
  amount: string;
  currency: string;
  correspondent: string;
  payer: {
    type: string;
    address: { value: string };
  };
  customerTimestamp: string;
  created: string;
  receivedByRecipient?: string;
  correspondentIds?: Record<string, string>;
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

@Injectable()
export class PawaPayService {
  private readonly logger = new Logger(PawaPayService.name);
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    // PawaPay v2 API endpoints
    const sandbox = this.configService.get<string>('PAWAPAY_SANDBOX', 'true') === 'true';
    this.apiUrl = sandbox ? 'https://api.sandbox.pawapay.io' : 'https://api.pawapay.io';

    this.apiToken = this.configService.get<string>('PAWAPAY_API_TOKEN', '');
    this.isEnabled = !!this.apiToken;

    if (this.isEnabled) {
      this.logger.log(`PawaPay service initialized (${sandbox ? 'sandbox' : 'production'})`);
    } else {
      this.logger.warn('PawaPay service disabled - PAWAPAY_API_TOKEN not configured');
    }
  }

  // ==========================================
  // DEPOSIT (Collect money from user)
  // ==========================================

  async initiateDeposit(params: {
    amount: number;
    currency: string;
    phoneNumber: string;
    operator: string;
    description: string;
    metadata?: Record<string, string>;
  }): Promise<PawaPayDepositResponse & { depositId: string }> {
    if (!this.isEnabled) {
      throw new BadRequestException('PawaPay is not configured');
    }

    // Validate phone number format
    const cleanPhone = this.formatPhoneNumber(params.phoneNumber);

    const depositId = randomUUID();

    const request: PawaPayDepositRequest = {
      depositId,
      amount: params.amount.toString(),
      currency: params.currency,
      correspondent: params.operator,
      payer: {
        type: 'MSISDN',
        address: {
          value: cleanPhone,
        },
      },
      customerTimestamp: new Date().toISOString(),
      statementDescription: params.description.substring(0, 22), // Max 22 chars
    };

    if (params.metadata) {
      request.metadata = Object.entries(params.metadata).map(([key, value]) => ({
        fieldName: key,
        fieldValue: value,
      }));
    }

    try {
      const response = await fetch(`${this.apiUrl}/deposits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`PawaPay deposit failed: ${error}`);
        throw new BadRequestException(`Payment initiation failed: ${response.statusText}`);
      }

      const result = (await response.json()) as PawaPayDepositResponse;

      this.logger.log(`PawaPay deposit initiated: ${depositId} - Status: ${result.status}`);

      if (result.status === 'REJECTED') {
        throw new BadRequestException(
          result.rejectionReason?.rejectionMessage || 'Payment was rejected'
        );
      }

      return { ...result, depositId };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PawaPay deposit error: ${(error as any).message}`, (error as any).stack);
      throw new BadRequestException('Failed to process payment');
    }
  }

  async getDepositStatus(depositId: string): Promise<PawaPayDepositStatus> {
    if (!this.isEnabled) {
      throw new BadRequestException('PawaPay is not configured');
    }

    try {
      const response = await fetch(`${this.apiUrl}/deposits/${depositId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new BadRequestException(`Failed to get deposit status: ${response.statusText}`);
      }

      return response.json() as Promise<PawaPayDepositStatus>;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PawaPay status check error: ${(error as any).message}`);
      throw new BadRequestException('Failed to check payment status');
    }
  }

  async resendDepositCallback(depositId: string): Promise<void> {
    if (!this.isEnabled) {
      throw new BadRequestException('PawaPay is not configured');
    }

    try {
      const response = await fetch(`${this.apiUrl}/deposits/${depositId}/resend-callback`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      });

      if (!response.ok) {
        throw new BadRequestException(`Failed to resend callback: ${response.statusText}`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PawaPay resend callback error: ${(error as any).message}`);
      throw new BadRequestException('Failed to resend callback');
    }
  }

  // ==========================================
  // PAYOUT (Send money to user) - For future use
  // ==========================================

  async initiatePayout(params: {
    amount: number;
    currency: string;
    phoneNumber: string;
    operator: string;
    description: string;
  }): Promise<{ payoutId: string; status: string }> {
    if (!this.isEnabled) {
      throw new BadRequestException('PawaPay is not configured');
    }

    const cleanPhone = this.formatPhoneNumber(params.phoneNumber);
    const payoutId = randomUUID();

    const request = {
      payoutId,
      amount: params.amount.toString(),
      currency: params.currency,
      correspondent: params.operator,
      recipient: {
        type: 'MSISDN',
        address: {
          value: cleanPhone,
        },
      },
      customerTimestamp: new Date().toISOString(),
      statementDescription: params.description.substring(0, 22),
    };

    try {
      const response = await fetch(`${this.apiUrl}/payouts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`PawaPay payout failed: ${error}`);
        throw new BadRequestException(`Payout initiation failed`);
      }

      const result = await response.json();
      return { payoutId, status: (result as any).status };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PawaPay payout error: ${(error as any).message}`);
      throw new BadRequestException('Failed to process payout');
    }
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  async checkAvailability(operator: string): Promise<boolean> {
    if (!this.isEnabled) return false;

    try {
      const response = await fetch(`${this.apiUrl}/active-conf`, {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      });

      if (!response.ok) return false;

      const config = await response.json();
      const correspondents = (config as any).correspondents || [];
      return correspondents.some(
        (c: any) => c.correspondent === operator && c.operationTypes?.includes('DEPOSIT')
      );
    } catch {
      return false;
    }
  }

  getOperatorFromPhone(phoneNumber: string): string | null {
    const clean = phoneNumber.replace(/\D/g, '');

    // Cameroon phone number patterns
    if (clean.startsWith('237')) {
      const localNumber = clean.substring(3);

      // MTN: 67, 650-654, 680-681
      if (/^6[78]/.test(localNumber) || /^65[0-4]/.test(localNumber)) {
        return 'MTN_MOMO_CMR';
      }

      // Orange: 69, 655-659
      if (/^69/.test(localNumber) || /^65[5-9]/.test(localNumber)) {
        return 'ORANGE_CMR';
      }
    }

    return null;
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    let clean = phone.replace(/\D/g, '');

    // Add country code if missing
    if (!clean.startsWith('237')) {
      clean = '237' + clean;
    }

    return clean;
  }

  // Webhook signature verification
  verifyWebhookSignature(payload: string, signature: string): boolean {
    // PawaPay uses HMAC-SHA256 for webhook signatures
    const crypto = require('crypto');
    const webhookSecret = this.configService.get<string>('PAWAPAY_WEBHOOK_SECRET', '');

    if (!webhookSecret) {
      this.logger.warn('Webhook secret not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }
}
