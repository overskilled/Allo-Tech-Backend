import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
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

class DepositDto {
  @IsNumber() @Min(500) amount: number;
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

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate a wallet top-up via mobile money' })
  async initiateDeposit(
    @CurrentUser('id') userId: string,
    @Body() dto: DepositDto,
  ) {
    return this.walletService.initiateDeposit(userId, dto);
  }

  @Get('deposits')
  @ApiOperation({ summary: 'Get deposit request history' })
  async getDepositHistory(@CurrentUser('id') userId: string) {
    return this.walletService.getDepositHistory(userId);
  }

  @Get('deposit/:depositId')
  @ApiOperation({ summary: 'Check deposit status (polls PawaPay and credits wallet if completed)' })
  async checkDepositStatus(
    @CurrentUser('id') userId: string,
    @Param('depositId') depositId: string,
  ) {
    return this.walletService.checkDepositStatus(userId, depositId);
  }
}
