import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, Min, MaxLength } from 'class-validator';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { MobileMoneyOperator } from '../payments/dto/payment.dto';

class RequestPayoutDto {
  @IsNumber() @Min(1000) amount: number;
  @IsEnum(MobileMoneyOperator) operator: string;
  @IsString() @MaxLength(20) phoneNumber: string;
}

@ApiTags('Wallet')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'wallet', version: '1' })
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get technician wallet (balance + recent transactions)' })
  async getWallet(@CurrentUser('id') userId: string) {
    return this.walletService.getWallet(userId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get paginated wallet transaction history' })
  async getTransactions(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationDto,
  ) {
    return this.walletService.getTransactions(userId, query);
  }

  @Post('payout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a payout to mobile money' })
  async requestPayout(
    @CurrentUser('id') userId: string,
    @Body() dto: RequestPayoutDto,
  ) {
    return this.walletService.requestPayout(userId, dto);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Get payout request history' })
  async getPayoutHistory(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationDto,
  ) {
    return this.walletService.getPayoutHistory(userId, query);
  }
}
