import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { PawaPayService } from './providers/pawapay.service';
import { PayPalService } from './providers/paypal.service';
import {
  InitiatePawaPayDto,
  InitiatePayPalDto,
  QueryPaymentsDto,
} from './dto/payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly pawaPayService: PawaPayService,
    private readonly paypalService: PayPalService,
  ) {}

  // ==========================================
  // USER ENDPOINTS
  // ==========================================

  @Post('pawapay')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate PawaPay mobile money payment' })
  @ApiResponse({ status: 201, description: 'Payment initiated' })
  initiatePawaPayPayment(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiatePawaPayDto,
  ) {
    return this.paymentsService.initiatePawaPayPayment(userId, dto);
  }

  @Post('paypal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate PayPal payment' })
  @ApiResponse({ status: 201, description: 'Payment initiated with approval URL' })
  initiatePayPalPayment(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiatePayPalDto,
  ) {
    return this.paymentsService.initiatePayPalPayment(userId, dto);
  }

  @Post('paypal/:paymentId/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm PayPal payment after approval' })
  @ApiResponse({ status: 200, description: 'Payment confirmed' })
  confirmPayPalPayment(
    @Param('paymentId') paymentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentsService.confirmPayPalPayment(paymentId, userId);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my payments' })
  @ApiResponse({ status: 200, description: 'Returns user payments' })
  getMyPayments(
    @CurrentUser('id') userId: string,
    @Query() query: QueryPaymentsDto,
  ) {
    return this.paymentsService.getMyPayments(userId, query);
  }

  @Get('my/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment by ID' })
  @ApiResponse({ status: 200, description: 'Returns the payment' })
  getPaymentById(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentsService.getPaymentById(id, userId);
  }

  @Get('my/:id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check payment status with provider' })
  @ApiResponse({ status: 200, description: 'Returns current status' })
  checkPaymentStatus(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentsService.checkPaymentStatus(id, userId);
  }

  // ==========================================
  // WEBHOOKS (Public - called by payment providers)
  // ==========================================

  @Post('webhooks/pawapay')
  @Public()
  @ApiOperation({ summary: 'PawaPay webhook endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handlePawaPayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-pawapay-signature') signature: string,
    @Body() payload: any,
  ) {
    // Verify signature in production
    if (signature && req.rawBody) {
      const isValid = this.pawaPayService.verifyWebhookSignature(
        req.rawBody.toString(),
        signature,
      );
      if (!isValid) {
        return { error: 'Invalid signature' };
      }
    }

    return this.paymentsService.handlePawaPayWebhook(payload);
  }

  @Post('webhooks/paypal')
  @Public()
  @ApiOperation({ summary: 'PayPal webhook endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handlePayPalWebhook(
    @Headers('paypal-auth-algo') authAlgo: string,
    @Headers('paypal-cert-url') certUrl: string,
    @Headers('paypal-transmission-id') transmissionId: string,
    @Headers('paypal-transmission-sig') transmissionSig: string,
    @Headers('paypal-transmission-time') transmissionTime: string,
    @Body() payload: any,
  ) {
    // Verify webhook in production
    if (authAlgo && transmissionSig) {
      const isValid = await this.paypalService.verifyWebhookSignature({
        authAlgo,
        certUrl,
        transmissionId,
        transmissionSig,
        transmissionTime,
        webhookId: '', // Will be fetched from config in service
        webhookEvent: payload,
      });

      if (!isValid) {
        return { error: 'Invalid signature' };
      }
    }

    return this.paymentsService.handlePayPalWebhook(
      payload.event_type,
      payload.resource,
    );
  }

  // ==========================================
  // ADMIN ENDPOINTS
  // ==========================================

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all payments (admin)' })
  @ApiResponse({ status: 200, description: 'Returns all payments' })
  getAllPayments(@Query() query: QueryPaymentsDto & { userId?: string }) {
    return this.paymentsService.getAllPayments(query);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment statistics (admin)' })
  @ApiResponse({ status: 200, description: 'Returns payment stats' })
  getPaymentStats() {
    return this.paymentsService.getPaymentStats();
  }

  @Post(':id/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refund a payment (admin)' })
  @ApiResponse({ status: 200, description: 'Payment refunded' })
  refundPayment(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.paymentsService.refundPayment(id, reason);
  }

  // ==========================================
  // UTILITY ENDPOINTS
  // ==========================================

  @Get('operators')
  @Public()
  @ApiOperation({ summary: 'Get supported mobile money operators' })
  @ApiResponse({ status: 200, description: 'Returns supported operators' })
  getSupportedOperators() {
    return {
      pawapay: [
        {
          code: 'MTN_MOMO_CMR',
          name: 'MTN Mobile Money',
          country: 'Cameroon',
          currency: 'XAF',
        },
        {
          code: 'ORANGE_CMR',
          name: 'Orange Money',
          country: 'Cameroon',
          currency: 'XAF',
        },
      ],
      paypal: {
        currencies: ['USD', 'EUR'],
        note: 'XAF payments are converted to USD',
      },
    };
  }

  @Get('detect-operator')
  @Public()
  @ApiOperation({ summary: 'Detect mobile money operator from phone number' })
  @ApiResponse({ status: 200, description: 'Returns detected operator' })
  detectOperator(@Query('phone') phone: string) {
    const operator = this.pawaPayService.getOperatorFromPhone(phone);
    return {
      phone,
      operator,
      supported: !!operator,
    };
  }
}
