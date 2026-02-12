import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LicensesService } from '../licenses/licenses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PawaPayService } from './providers/pawapay.service';
import { PayPalService } from './providers/paypal.service';
import {
  InitiatePawaPayDto,
  InitiatePayPalDto,
  PaymentProvider,
  PaymentPurpose,
  QueryPaymentsDto,
  PaymentInitiationResponse,
} from './dto/payment.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import { LicensePlan } from '../licenses/dto/license.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly licensesService: LicensesService,
    private readonly notificationsService: NotificationsService,
    private readonly pawaPayService: PawaPayService,
    private readonly paypalService: PayPalService
  ) {}

  // ==========================================
  // INITIATE PAYMENTS
  // ==========================================

  async initiatePawaPayPayment(
    userId: string,
    dto: InitiatePawaPayDto
  ): Promise<PaymentInitiationResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate license ID if provided
    let license = null;
    if (dto.purpose === PaymentPurpose.LICENSE) {
      license = await this.prisma.license.findFirst({
        where: { userId },
      });

      if (!license) {
        throw new BadRequestException('No license found for this user');
      }
    }

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        clientId: userId,
        licenseId: license?.id,
        amount: dto.amount,
        currency: dto.currency || 'XAF',
        status: 'PENDING',
        paymentMethod: PaymentProvider.PAWAPAY,
        paymentDetails: JSON.stringify({
          phoneNumber: dto.phoneNumber,
          operator: dto.operator,
          purpose: dto.purpose,
          description: dto.description,
        }),
      },
    });

    try {
      // Initiate PawaPay deposit
      const result = await this.pawaPayService.initiateDeposit({
        amount: dto.amount,
        currency: dto.currency || 'XAF',
        phoneNumber: dto.phoneNumber,
        operator: dto.operator,
        description: dto.description || `AlloTech - ${dto.purpose}`,
        metadata: {
          paymentId: payment.id,
          userId,
          purpose: dto.purpose,
        },
      });

      // Update payment with deposit ID
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          transactionId: result.depositId,
        },
      });

      this.logger.log(`PawaPay payment initiated: ${payment.id} - Deposit: ${result.depositId}`);

      return {
        paymentId: payment.id,
        provider: PaymentProvider.PAWAPAY,
        status: result.status,
        amount: dto.amount,
        currency: dto.currency || 'XAF',
        depositId: result.depositId,
      };
    } catch (error) {
      // Mark payment as failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          paymentDetails: JSON.stringify({
            ...(payment.paymentDetails ? JSON.parse(payment.paymentDetails as string) : {}),
            error: (error as any).message,
          }),
        },
      });

      throw error;
    }
  }

  async initiatePayPalPayment(
    userId: string,
    dto: InitiatePayPalDto
  ): Promise<PaymentInitiationResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate license ID if provided
    let license = null;
    if (dto.purpose === PaymentPurpose.LICENSE) {
      license = await this.prisma.license.findFirst({
        where: { userId },
      });

      if (!license) {
        throw new BadRequestException('No license found for this user');
      }
    }

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        clientId: userId,
        licenseId: license?.id,
        amount: dto.amount,
        currency: dto.currency || 'XAF',
        status: 'PENDING',
        paymentMethod: PaymentProvider.PAYPAL,
        paymentDetails: JSON.stringify({
          purpose: dto.purpose,
          description: dto.description,
        }),
      },
    });

    try {
      // Create PayPal order
      const order = await this.paypalService.createOrder({
        amount: dto.amount,
        currency: dto.currency || 'XAF',
        description: dto.description || `AlloTech - ${dto.purpose}`,
        returnUrl: `${dto.returnUrl}?paymentId=${payment.id}`,
        cancelUrl: `${dto.cancelUrl}?paymentId=${payment.id}`,
        referenceId: payment.id,
      });

      // Update payment with PayPal order ID
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          transactionId: order.id,
        },
      });

      this.logger.log(`PayPal payment initiated: ${payment.id} - Order: ${order.id}`);

      return {
        paymentId: payment.id,
        provider: PaymentProvider.PAYPAL,
        status: order.status,
        amount: dto.amount,
        currency: dto.currency || 'XAF',
        orderId: order.id,
        approvalUrl: order.approvalUrl,
      };
    } catch (error) {
      // Mark payment as failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          paymentDetails: JSON.stringify({
            ...(payment.paymentDetails ? JSON.parse(payment.paymentDetails as string) : {}),
            error: (error as any).message,
          }),
        },
      });

      throw error;
    }
  }

  // ==========================================
  // PAYMENT CONFIRMATION
  // ==========================================

  async confirmPayPalPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        client: true,
        license: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.clientId !== userId) {
      throw new ForbiddenException('Not authorized to confirm this payment');
    }

    if (payment.status !== 'PENDING') {
      throw new BadRequestException('Payment already processed');
    }

    if (!payment.transactionId) {
      throw new BadRequestException('No PayPal order ID found');
    }

    try {
      // Capture the PayPal order
      const capture = await this.paypalService.captureOrder(payment.transactionId);

      if (capture.status === 'COMPLETED') {
        await this.completePayment(payment.id, {
          captureId: capture.purchase_units[0]?.payments?.captures[0]?.id,
        });

        return {
          success: true,
          status: 'COMPLETED',
          paymentId: payment.id,
        };
      } else {
        throw new BadRequestException(`Payment not completed: ${capture.status}`);
      }
    } catch (error) {
      this.logger.error(`PayPal confirmation failed: ${(error as any).message}`);

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
        },
      });

      throw error;
    }
  }

  // ==========================================
  // WEBHOOK HANDLERS
  // ==========================================

  async handlePawaPayWebhook(payload: any) {
    this.logger.log(`PawaPay webhook received: ${JSON.stringify(payload)}`);

    const { depositId, status, failureReason, metadata } = payload;

    // Find payment by deposit ID
    const payment = await this.prisma.payment.findFirst({
      where: { transactionId: depositId },
    });

    if (!payment) {
      this.logger.warn(`Payment not found for deposit: ${depositId}`);
      return { received: true };
    }

    if (status === 'COMPLETED') {
      await this.completePayment(payment.id, { pawaPayStatus: status });
    } else if (status === 'FAILED') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          paymentDetails: JSON.stringify({
            ...(payment.paymentDetails ? JSON.parse(payment.paymentDetails as string) : {}),
            failureReason,
          }),
        },
      });
    }

    return { received: true };
  }

  async handlePayPalWebhook(eventType: string, resource: any) {
    this.logger.log(`PayPal webhook: ${eventType}`);

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = resource.supplementary_data?.related_ids?.order_id;

      if (orderId) {
        const payment = await this.prisma.payment.findFirst({
          where: { transactionId: orderId },
        });

        if (payment && payment.status === 'PENDING') {
          await this.completePayment(payment.id, { captureId: resource.id });
        }
      }
    }

    return { received: true };
  }

  // ==========================================
  // COMPLETE PAYMENT
  // ==========================================

  private async completePayment(paymentId: string, details: Record<string, any>) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        client: true,
        license: true,
      },
    });

    if (!payment) return;

    // Update payment status
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        paidAt: new Date(),
        paymentDetails: JSON.stringify({
          ...(payment.paymentDetails ? JSON.parse(payment.paymentDetails as string) : {}),
          ...details,
        }),
      },
    });

    // Process based on purpose
    const paymentDetails = payment.paymentDetails
      ? JSON.parse(payment.paymentDetails as string)
      : {};

    if (paymentDetails.purpose === PaymentPurpose.LICENSE && payment.licenseId) {
      // Activate/renew license
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // Add 1 month

      await this.licensesService.activateLicense(payment.licenseId, {
        plan: (payment.license?.plan as LicensePlan) || LicensePlan.BASIC,
        endDate: endDate.toISOString(),
      });
    }

    // Send confirmation email
    if (payment.client) {
      await this.mailService.sendPaymentReceived(payment.client.email, {
        name: `${payment.client.firstName} ${payment.client.lastName}`,
        amount: payment.amount.toString(),
        currency: payment.currency,
        transactionId: payment.transactionId || payment.id,
        date: new Date().toLocaleDateString('fr-FR'),
      });

      // Send notification
      await this.notificationsService.notifyPaymentReceived({
        userId: payment.clientId!,
        amount: Number(payment.amount),
        currency: payment.currency,
        paymentId: paymentId,
      });
    }

    this.logger.log(`Payment completed: ${paymentId}`);
  }

  // ==========================================
  // QUERIES
  // ==========================================

  async getMyPayments(userId: string, query: QueryPaymentsDto) {
    const where: any = { clientId: userId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.provider) {
      where.paymentMethod = query.provider;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return createPaginatedResult(payments, total, query);
  }

  async getPaymentById(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        license: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.clientId !== userId) {
      throw new ForbiddenException('Not authorized to view this payment');
    }

    return payment;
  }

  async checkPaymentStatus(paymentId: string, userId: string) {
    const payment = await this.getPaymentById(paymentId, userId);

    if (payment.status !== 'PENDING' || !payment.transactionId) {
      return { status: payment.status };
    }

    // Check with provider
    if (payment.paymentMethod === PaymentProvider.PAWAPAY) {
      const status = await this.pawaPayService.getDepositStatus(payment.transactionId);

      if (status.status === 'COMPLETED' && payment.status === 'PENDING') {
        await this.completePayment(payment.id, { pawaPayStatus: status.status });
        return { status: 'COMPLETED' };
      }

      return { status: status.status };
    } else if (payment.paymentMethod === PaymentProvider.PAYPAL) {
      const order = await this.paypalService.getOrderDetails(payment.transactionId);
      return { status: order.status };
    }

    return { status: payment.status };
  }

  // ==========================================
  // ADMIN OPERATIONS
  // ==========================================

  async getAllPayments(query: QueryPaymentsDto & { userId?: string }) {
    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.provider) {
      where.paymentMethod = query.provider;
    }

    if (query.userId) {
      where.clientId = query.userId;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          license: true,
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return createPaginatedResult(payments, total, query);
  }

  async getPaymentStats() {
    const [total, completed, pending, failed, revenue] = await Promise.all([
      this.prisma.payment.count(),
      this.prisma.payment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.payment.count({ where: { status: 'FAILED' } }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    return {
      total,
      completed,
      pending,
      failed,
      revenue: revenue._sum.amount || 0,
    };
  }

  async refundPayment(paymentId: string, reason: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { client: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed payments can be refunded');
    }

    // Handle refund based on provider
    if (payment.paymentMethod === PaymentProvider.PAYPAL && payment.transactionId) {
      const details = payment.paymentDetails ? JSON.parse(payment.paymentDetails as string) : {};

      if (details.captureId) {
        await this.paypalService.refundCapture(details.captureId, undefined, reason);
      }
    }

    // Update payment status
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'REFUNDED',
        paymentDetails: JSON.stringify({
          ...(payment.paymentDetails ? JSON.parse(payment.paymentDetails as string) : {}),
          refundReason: reason,
          refundedAt: new Date().toISOString(),
        }),
      },
    });

    this.logger.log(`Payment refunded: ${paymentId}`);

    return { success: true, message: 'Payment refunded successfully' };
  }
}
