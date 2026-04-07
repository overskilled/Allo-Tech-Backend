import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PawaPayService } from '../payments/providers/pawapay.service';
import { createPaginatedResult, PaginationDto } from '../../common/dto/pagination.dto';

const MIN_PAYOUT = 1000; // XAF

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pawaPayService: PawaPayService,
  ) {}

  // ==========================================
  // BALANCE & TRANSACTIONS
  // ==========================================

  async getWallet(technicianId: string) {
    const profile = await this.prisma.technicianProfile.findUnique({
      where: { userId: technicianId },
      select: { id: true, walletBalance: true },
    });

    if (!profile) throw new NotFoundException('Profil technicien introuvable');

    const [transactions, pendingPayout] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { technicianProfileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.payoutRequest.findFirst({
        where: { technicianProfileId: profile.id, status: 'PENDING' },
      }),
    ]);

    return {
      balance: profile.walletBalance,
      currency: 'XAF',
      pendingPayout: pendingPayout ? pendingPayout.amount : 0,
      availableBalance: pendingPayout
        ? Math.max(0, profile.walletBalance - pendingPayout.amount)
        : profile.walletBalance,
      recentTransactions: transactions.map(this.formatTransaction),
    };
  }

  async getTransactions(technicianId: string, query: PaginationDto) {
    const profile = await this.prisma.technicianProfile.findUnique({
      where: { userId: technicianId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profil technicien introuvable');

    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { technicianProfileId: profile.id },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.walletTransaction.count({
        where: { technicianProfileId: profile.id },
      }),
    ]);

    return createPaginatedResult(items.map(this.formatTransaction), total, query);
  }

  // ==========================================
  // PAYOUT REQUEST
  // ==========================================

  async requestPayout(
    technicianId: string,
    dto: { amount: number; operator: string; phoneNumber: string },
  ) {
    const profile = await this.prisma.technicianProfile.findUnique({
      where: { userId: technicianId },
      select: { id: true, walletBalance: true },
    });
    if (!profile) throw new NotFoundException('Profil technicien introuvable');

    if (dto.amount < MIN_PAYOUT) {
      throw new BadRequestException(`Montant minimum de retrait: ${MIN_PAYOUT} XAF`);
    }

    if (dto.amount > profile.walletBalance) {
      throw new BadRequestException(
        `Solde insuffisant. Solde disponible: ${profile.walletBalance} XAF`,
      );
    }

    // Check no pending payout already exists
    const existing = await this.prisma.payoutRequest.findFirst({
      where: { technicianProfileId: profile.id, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (existing) {
      throw new BadRequestException('Un retrait est déjà en cours de traitement');
    }

    // Initiate PawaPay payout
    let pawapayPayoutId: string | undefined;
    let payoutStatus: 'PENDING' | 'PROCESSING' = 'PENDING';

    try {
      const result = await this.pawaPayService.initiatePayout({
        amount: dto.amount,
        currency: 'XAF',
        phoneNumber: dto.phoneNumber,
        operator: dto.operator,
        description: 'Retrait portefeuille AlloTech',
      });
      pawapayPayoutId = result.payoutId;
      payoutStatus = 'PROCESSING';
      this.logger.log(`PawaPay payout initiated: ${pawapayPayoutId}`);
    } catch (err) {
      this.logger.error(`PawaPay payout failed: ${(err as Error).message}`);
      // Still create the request — admin can process manually
    }

    const newBalance = profile.walletBalance - dto.amount;

    const [payoutRequest] = await this.prisma.$transaction([
      this.prisma.payoutRequest.create({
        data: {
          technicianProfileId: profile.id,
          amount: dto.amount,
          currency: 'XAF',
          operator: dto.operator,
          phoneNumber: dto.phoneNumber,
          status: payoutStatus,
          pawapayPayoutId,
        },
      }),
      this.prisma.technicianProfile.update({
        where: { id: profile.id },
        data: { walletBalance: newBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          technicianProfileId: profile.id,
          type: 'PAYOUT',
          amount: -dto.amount,
          balanceAfter: newBalance,
          description: `Retrait vers ${dto.operator} ${dto.phoneNumber}`,
          referenceType: 'PAYOUT',
        },
      }),
    ]);

    return {
      success: true,
      payoutId: payoutRequest.id,
      amount: dto.amount,
      newBalance,
      status: payoutStatus,
      message:
        payoutStatus === 'PROCESSING'
          ? 'Retrait initié. Vous recevrez les fonds sous peu.'
          : 'Retrait enregistré. Un administrateur va traiter votre demande.',
    };
  }

  async getPayoutHistory(technicianId: string, query: PaginationDto) {
    const profile = await this.prisma.technicianProfile.findUnique({
      where: { userId: technicianId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profil technicien introuvable');

    const [items, total] = await Promise.all([
      this.prisma.payoutRequest.findMany({
        where: { technicianProfileId: profile.id },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.payoutRequest.count({ where: { technicianProfileId: profile.id } }),
    ]);

    return createPaginatedResult(items, total, query);
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private formatTransaction(tx: any) {
    return {
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      description: tx.description,
      referenceId: tx.referenceId,
      referenceType: tx.referenceType,
      createdAt: tx.createdAt,
      isCredit: tx.amount > 0,
    };
  }
}
