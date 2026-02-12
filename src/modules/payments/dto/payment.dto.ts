import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsObject,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum PaymentProvider {
  PAWAPAY = 'pawapay',
  PAYPAL = 'paypal',
}

export enum PaymentPurpose {
  LICENSE = 'license',
  SERVICE = 'service',
}

// PawaPay supported mobile money operators in Cameroon
export enum MobileMoneyOperator {
  MTN_MOMO = 'MTN_MOMO_CMR',
  ORANGE_MONEY = 'ORANGE_CMR',
}

export class InitiatePaymentDto {
  @ApiProperty({ description: 'Amount to pay' })
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'XAF' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ enum: PaymentProvider })
  @IsEnum(PaymentProvider)
  provider: PaymentProvider;

  @ApiProperty({ enum: PaymentPurpose })
  @IsEnum(PaymentPurpose)
  purpose: PaymentPurpose;

  @ApiPropertyOptional({ description: 'License ID if paying for license' })
  @IsOptional()
  @IsString()
  licenseId?: string;

  @ApiPropertyOptional({ description: 'Description of payment' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class InitiatePawaPayDto extends InitiatePaymentDto {
  @ApiProperty({ description: 'Phone number (e.g., +237670000000)' })
  @IsString()
  phoneNumber: string;

  @ApiProperty({ enum: MobileMoneyOperator })
  @IsEnum(MobileMoneyOperator)
  operator: MobileMoneyOperator;
}

export class InitiatePayPalDto extends InitiatePaymentDto {
  @ApiProperty({ description: 'Return URL after successful payment' })
  @IsString()
  returnUrl: string;

  @ApiProperty({ description: 'Cancel URL if payment is cancelled' })
  @IsString()
  cancelUrl: string;
}

export class PawaPayWebhookDto {
  @ApiProperty()
  @IsString()
  depositId: string;

  @ApiProperty()
  @IsString()
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class PayPalWebhookDto {
  @ApiProperty()
  @IsString()
  event_type: string;

  @ApiProperty()
  @IsObject()
  resource: Record<string, any>;
}

export class QueryPaymentsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: PaymentProvider })
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @ApiPropertyOptional({ enum: PaymentPurpose })
  @IsOptional()
  @IsEnum(PaymentPurpose)
  purpose?: PaymentPurpose;
}

// Response types
export interface PaymentInitiationResponse {
  paymentId: string;
  provider: PaymentProvider;
  status: string;
  amount: number;
  currency: string;
  // PawaPay specific
  depositId?: string;
  // PayPal specific
  approvalUrl?: string;
  orderId?: string;
}
