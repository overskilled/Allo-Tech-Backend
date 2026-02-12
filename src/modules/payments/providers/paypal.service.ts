import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PayPalOrderRequest {
  intent: 'CAPTURE' | 'AUTHORIZE';
  purchase_units: Array<{
    reference_id?: string;
    amount: {
      currency_code: string;
      value: string;
    };
    description?: string;
  }>;
  application_context?: {
    brand_name?: string;
    locale?: string;
    return_url?: string;
    cancel_url?: string;
    user_action?: 'PAY_NOW' | 'CONTINUE';
  };
}

export interface PayPalOrderResponse {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export interface PayPalCaptureResponse {
  id: string;
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
  purchase_units: Array<{
    reference_id: string;
    payments: {
      captures: Array<{
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
      }>;
    };
  }>;
}

@Injectable()
export class PayPalService {
  private readonly logger = new Logger(PayPalService.name);
  private readonly apiUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly isEnabled: boolean;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private readonly configService: ConfigService) {
    const sandbox = this.configService.get<string>('PAYPAL_SANDBOX', 'true') === 'true';
    this.apiUrl = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

    this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET', '');
    this.isEnabled = !!(this.clientId && this.clientSecret);

    if (this.isEnabled) {
      this.logger.log(`PayPal service initialized (${sandbox ? 'sandbox' : 'production'})`);
    } else {
      this.logger.warn('PayPal service disabled - credentials not configured');
    }
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await fetch(`${this.apiUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      if (!response.ok) {
        throw new Error(`Token request failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = (data as any).access_token;
      // Set expiry with 5 minute buffer
      this.tokenExpiry = Date.now() + ((data as any).expires_in - 300) * 1000;

      return this.accessToken;
    } catch (error) {
      this.logger.error(`PayPal auth error: ${(error as any).message}`);
      throw new BadRequestException('PayPal authentication failed');
    }
  }

  // ==========================================
  // ORDERS
  // ==========================================

  async createOrder(params: {
    amount: number;
    currency: string;
    description: string;
    returnUrl: string;
    cancelUrl: string;
    referenceId?: string;
  }): Promise<PayPalOrderResponse & { approvalUrl: string }> {
    if (!this.isEnabled) {
      throw new BadRequestException('PayPal is not configured');
    }

    const token = await this.getAccessToken();

    // Convert XAF to USD for PayPal (approximate rate)
    let paypalAmount = params.amount;
    let currency = params.currency;

    if (params.currency === 'XAF') {
      // Convert XAF to USD (approximate rate: 1 USD ≈ 600 XAF)
      paypalAmount = Math.ceil((params.amount / 600) * 100) / 100;
      currency = 'USD';
    }

    const orderRequest: PayPalOrderRequest = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.referenceId,
          amount: {
            currency_code: currency,
            value: paypalAmount.toFixed(2),
          },
          description: params.description,
        },
      ],
      application_context: {
        brand_name: 'AlloTech',
        locale: 'fr-FR',
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
        user_action: 'PAY_NOW',
      },
    };

    try {
      const response = await fetch(`${this.apiUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderRequest),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`PayPal order creation failed: ${error}`);
        throw new BadRequestException('Failed to create PayPal order');
      }

      const order = (await response.json()) as PayPalOrderResponse;

      // Find approval URL
      const approvalLink = order.links.find((l) => l.rel === 'approve');
      if (!approvalLink) {
        throw new BadRequestException('No approval URL in PayPal response');
      }

      this.logger.log(`PayPal order created: ${order.id}`);

      return {
        ...order,
        approvalUrl: approvalLink.href,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PayPal order error: ${(error as any).message}`);
      throw new BadRequestException('Failed to process PayPal payment');
    }
  }

  async captureOrder(orderId: string): Promise<PayPalCaptureResponse> {
    if (!this.isEnabled) {
      throw new BadRequestException('PayPal is not configured');
    }

    const token = await this.getAccessToken();

    try {
      const response = await fetch(`${this.apiUrl}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`PayPal capture failed: ${error}`);
        throw new BadRequestException('Failed to capture PayPal payment');
      }

      const capture = (await response.json()) as PayPalCaptureResponse;
      this.logger.log(`PayPal order captured: ${orderId} - Status: ${capture.status}`);

      return capture;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PayPal capture error: ${(error as any).message}`);
      throw new BadRequestException('Failed to capture payment');
    }
  }

  async getOrderDetails(orderId: string): Promise<any> {
    if (!this.isEnabled) {
      throw new BadRequestException('PayPal is not configured');
    }

    const token = await this.getAccessToken();

    try {
      const response = await fetch(`${this.apiUrl}/v2/checkout/orders/${orderId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new BadRequestException('Failed to get order details');
      }

      return response.json();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PayPal order details error: ${(error as any).message}`);
      throw new BadRequestException('Failed to get order details');
    }
  }

  // ==========================================
  // REFUNDS
  // ==========================================

  async refundCapture(
    captureId: string,
    amount?: { value: string; currency_code: string },
    note?: string
  ): Promise<any> {
    if (!this.isEnabled) {
      throw new BadRequestException('PayPal is not configured');
    }

    const token = await this.getAccessToken();

    const body: any = {};
    if (amount) body.amount = amount;
    if (note) body.note_to_payer = note;

    try {
      const response = await fetch(`${this.apiUrl}/v2/payments/captures/${captureId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`PayPal refund failed: ${error}`);
        throw new BadRequestException('Failed to process refund');
      }

      return response.json();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`PayPal refund error: ${(error as any).message}`);
      throw new BadRequestException('Failed to process refund');
    }
  }

  // ==========================================
  // WEBHOOKS
  // ==========================================

  async verifyWebhookSignature(params: {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSig: string;
    transmissionTime: string;
    webhookId: string;
    webhookEvent: any;
  }): Promise<boolean> {
    if (!this.isEnabled) return false;

    const token = await this.getAccessToken();
    const webhookId = this.configService.get<string>('PAYPAL_WEBHOOK_ID', '');

    try {
      const response = await fetch(`${this.apiUrl}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo: params.authAlgo,
          cert_url: params.certUrl,
          transmission_id: params.transmissionId,
          transmission_sig: params.transmissionSig,
          transmission_time: params.transmissionTime,
          webhook_id: webhookId,
          webhook_event: params.webhookEvent,
        }),
      });

      if (!response.ok) return false;

      const result = await response.json();
      return (result as any).verification_status === 'SUCCESS';
    } catch (error) {
      this.logger.error(`PayPal webhook verification error: ${(error as any).message}`);
      return false;
    }
  }

  // ==========================================
  // UTILITY
  // ==========================================

  convertXAFtoUSD(amountXAF: number): number {
    // Approximate rate: 1 USD ≈ 600 XAF
    return Math.ceil((amountXAF / 600) * 100) / 100;
  }

  convertUSDtoXAF(amountUSD: number): number {
    return Math.round(amountUSD * 600);
  }
}
