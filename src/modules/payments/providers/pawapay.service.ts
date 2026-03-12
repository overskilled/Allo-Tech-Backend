import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';

// ==========================================
// pawaPay V2 API Interfaces
// ==========================================

export interface PawaPayDepositRequest {
  depositId: string;
  amount: string;
  currency: string;
  payer: {
    type: 'MMO';
    accountDetails: {
      provider: string;
      phoneNumber: string;
    };
  };
  customerMessage?: string;
  preAuthorisationCode?: string;
  clientReferenceId?: string;
  metadata?: Array<Record<string, any>>;
}

export interface PawaPayPayoutRequest {
  payoutId: string;
  amount: string;
  currency: string;
  recipient: {
    type: 'MMO';
    accountDetails: {
      provider: string;
      phoneNumber: string;
    };
  };
  customerMessage?: string;
  metadata?: Array<Record<string, any>>;
}

export interface PawaPayRefundRequest {
  refundId: string;
  depositId: string;
  amount: string;
  currency: string;
  metadata?: Array<Record<string, any>>;
}

export interface PawaPayDepositResponse {
  depositId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_IGNORED';
  created?: string;
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

export interface PawaPayPayoutResponse {
  payoutId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_IGNORED';
  created?: string;
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

export interface PawaPayRefundResponse {
  refundId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_IGNORED';
  created?: string;
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

export interface PawaPayDepositStatus {
  depositId: string;
  status: 'ACCEPTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'IN_RECONCILIATION' | 'FOUND';
  amount: string;
  currency: string;
  payer: {
    type: string;
    accountDetails: {
      provider: string;
      phoneNumber: string;
    };
  };
  created: string;
  receivedByRecipient?: string;
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

export interface PawaPayPayoutStatus {
  payoutId: string;
  status: 'ACCEPTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'IN_RECONCILIATION';
  amount: string;
  currency: string;
  recipient: {
    type: string;
    accountDetails: {
      provider: string;
      phoneNumber: string;
    };
  };
  created: string;
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

export interface PawaPayRefundStatus {
  refundId: string;
  status: 'ACCEPTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'IN_RECONCILIATION';
  amount: string;
  currency: string;
  depositId: string;
  created: string;
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

export interface PawaPayPredictProviderResponse {
  provider: string;
  country: string;
  operationTypes: string[];
}

@Injectable()
export class PawaPayService {
  private readonly logger = new Logger(PawaPayService.name);
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const sandbox = this.configService.get<string>('PAWAPAY_SANDBOX', 'true') === 'true';
    this.baseUrl = sandbox
      ? 'https://api.sandbox.pawapay.io/v2'
      : 'https://api.pawapay.io/v2';

    this.apiToken = this.configService.get<string>('PAWAPAY_API_TOKEN', '');
    this.isEnabled = !!this.apiToken;

    if (this.isEnabled) {
      this.logger.log(`PawaPay service initialized (${sandbox ? 'sandbox' : 'production'})`);
    } else {
      this.logger.warn('PawaPay service disabled - PAWAPAY_API_TOKEN not configured');
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
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

    const cleanPhone = this.formatPhoneNumber(params.phoneNumber);
    const depositId = randomUUID();

    const request: PawaPayDepositRequest = {
      depositId,
      amount: params.amount.toString(),
      currency: params.currency,
      payer: {
        type: 'MMO',
        accountDetails: {
          provider: params.operator,
          phoneNumber: cleanPhone,
        },
      },
      customerMessage: params.description.substring(0, 22).padEnd(4, ' '), // 4-22 chars
    };

    if (params.metadata) {
      request.metadata = Object.entries(params.metadata).map(([key, value]) => ({
        [key]: value,
      }));
    }

    try {
      const response = await fetch(`${this.baseUrl}/deposits`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`PawaPay deposit failed: ${error}`);
        throw new BadRequestException(
          `Payment initiation failed: ${this.parseErrorMessage(error)}`
        );
      }

      const result = (await response.json()) as PawaPayDepositResponse;

      this.logger.log(`PawaPay deposit initiated: ${depositId} - Status: ${result.status}`);

      if (result.status === 'REJECTED') {
        throw new BadRequestException(
          result.failureReason?.failureMessage || 'Payment was rejected'
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
      const response = await fetch(`${this.baseUrl}/deposits/${depositId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`PawaPay deposit status failed [${depositId}]: ${error}`);
        throw new BadRequestException(`Failed to get deposit status: ${response.statusText}`);
      }

      const result = (await response.json()) as PawaPayDepositStatus;
      this.logger.log(
        `PawaPay deposit status [${depositId}]: ${result.status}${result.failureReason ? ` - ${result.failureReason.failureCode}: ${result.failureReason.failureMessage}` : ''}`
      );
      return result;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PawaPay status check error [${depositId}]: ${(error as any).message}`);
      throw new BadRequestException('Failed to check payment status');
    }
  }

  async resendDepositCallback(depositId: string): Promise<void> {
    if (!this.isEnabled) {
      throw new BadRequestException('PawaPay is not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/deposits/${depositId}/resend-callback`, {
        method: 'POST',
        headers: this.getHeaders(),
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
  // PAYOUT (Send money to user)
  // ==========================================

  async initiatePayout(params: {
    amount: number;
    currency: string;
    phoneNumber: string;
    operator: string;
    description: string;
    metadata?: Record<string, string>;
  }): Promise<PawaPayPayoutResponse & { payoutId: string }> {
    if (!this.isEnabled) {
      throw new BadRequestException('PawaPay is not configured');
    }

    const cleanPhone = this.formatPhoneNumber(params.phoneNumber);
    const payoutId = randomUUID();

    const request: PawaPayPayoutRequest = {
      payoutId,
      amount: params.amount.toString(),
      currency: params.currency,
      recipient: {
        type: 'MMO',
        accountDetails: {
          provider: params.operator,
          phoneNumber: cleanPhone,
        },
      },
      customerMessage: params.description.substring(0, 22).padEnd(4, ' '),
    };

    if (params.metadata) {
      request.metadata = Object.entries(params.metadata).map(([key, value]) => ({
        [key]: value,
      }));
    }

    try {
      const response = await fetch(`${this.baseUrl}/payouts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`PawaPay payout failed: ${error}`);
        throw new BadRequestException(
          `Payout initiation failed: ${this.parseErrorMessage(error)}`
        );
      }

      const result = (await response.json()) as PawaPayPayoutResponse;

      this.logger.log(`PawaPay payout initiated: ${payoutId} - Status: ${result.status}`);

      if (result.status === 'REJECTED') {
        throw new BadRequestException(
          result.failureReason?.failureMessage || 'Payout was rejected'
        );
      }

      return { ...result, payoutId };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PawaPay payout error: ${(error as any).message}`);
      throw new BadRequestException('Failed to process payout');
    }
  }

  async getPayoutStatus(payoutId: string): Promise<PawaPayPayoutStatus> {
    if (!this.isEnabled) {
      throw new BadRequestException('PawaPay is not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/payouts/${payoutId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new BadRequestException(`Failed to get payout status: ${response.statusText}`);
      }

      return response.json() as Promise<PawaPayPayoutStatus>;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PawaPay payout status error: ${(error as any).message}`);
      throw new BadRequestException('Failed to check payout status');
    }
  }

  // ==========================================
  // REFUND
  // ==========================================

  async initiateRefund(params: {
    depositId: string;
    amount: number;
    currency: string;
    metadata?: Record<string, string>;
  }): Promise<PawaPayRefundResponse & { refundId: string }> {
    if (!this.isEnabled) {
      throw new BadRequestException('PawaPay is not configured');
    }

    const refundId = randomUUID();

    const request: PawaPayRefundRequest = {
      refundId,
      depositId: params.depositId,
      amount: params.amount.toString(),
      currency: params.currency,
    };

    if (params.metadata) {
      request.metadata = Object.entries(params.metadata).map(([key, value]) => ({
        [key]: value,
      }));
    }

    try {
      const response = await fetch(`${this.baseUrl}/refunds`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`PawaPay refund failed: ${error}`);
        throw new BadRequestException(
          `Refund initiation failed: ${this.parseErrorMessage(error)}`
        );
      }

      const result = (await response.json()) as PawaPayRefundResponse;

      this.logger.log(`PawaPay refund initiated: ${refundId} - Status: ${result.status}`);

      if (result.status === 'REJECTED') {
        throw new BadRequestException(
          result.failureReason?.failureMessage || 'Refund was rejected'
        );
      }

      return { ...result, refundId };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PawaPay refund error: ${(error as any).message}`);
      throw new BadRequestException('Failed to process refund');
    }
  }

  async getRefundStatus(refundId: string): Promise<PawaPayRefundStatus> {
    if (!this.isEnabled) {
      throw new BadRequestException('PawaPay is not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/refunds/${refundId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new BadRequestException(`Failed to get refund status: ${response.statusText}`);
      }

      return response.json() as Promise<PawaPayRefundStatus>;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PawaPay refund status error: ${(error as any).message}`);
      throw new BadRequestException('Failed to check refund status');
    }
  }

  // ==========================================
  // TOOLKIT / UTILITY METHODS
  // ==========================================

  async checkAvailability(operator: string): Promise<boolean> {
    if (!this.isEnabled) return false;

    try {
      const response = await fetch(`${this.baseUrl}/active-conf`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) return false;

      const config = (await response.json()) as any;
      // V2 structure: { countries: [{ providers: [{ provider, currencies: [{ operationTypes }] }] }] }
      const countries = config.countries || [];
      for (const country of countries) {
        for (const provider of country.providers || []) {
          if (provider.provider === operator) {
            return true;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async predictProvider(phoneNumber: string): Promise<PawaPayPredictProviderResponse | null> {
    if (!this.isEnabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/predict-provider`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ phoneNumber }),
      });

      if (!response.ok) return null;

      return response.json() as Promise<PawaPayPredictProviderResponse>;
    } catch {
      return null;
    }
  }

  async getWalletBalances(country?: string): Promise<any> {
    if (!this.isEnabled) {
      throw new BadRequestException('PawaPay is not configured');
    }

    const url = country
      ? `${this.baseUrl}/wallet-balances?country=${country}`
      : `${this.baseUrl}/wallet-balances`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new BadRequestException(`Failed to get wallet balances: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PawaPay wallet balance error: ${(error as any).message}`);
      throw new BadRequestException('Failed to get wallet balances');
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
    let clean = phone.replace(/\D/g, '');

    if (!clean.startsWith('237')) {
      clean = '237' + clean;
    }

    return clean;
  }

  private parseErrorMessage(errorBody: string): string {
    try {
      const parsed = JSON.parse(errorBody);
      return (
        parsed.failureReason?.failureMessage ||
        parsed.errorMessage ||
        parsed.message ||
        'Unknown error'
      );
    } catch {
      return errorBody || 'Unknown error';
    }
  }

  // Webhook signature verification
  verifyWebhookSignature(payload: string, signature: string): boolean {
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
