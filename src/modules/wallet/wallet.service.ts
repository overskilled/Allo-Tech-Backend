import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PawaPayService } from '../payments/providers/pawapay.service';
import { createPaginatedResult, PaginationDto } from '../../common/dto/pagination.dto';

const MIN_PAYOUT = 1000;    // XAF
const MIN_DEPOSIT = 500;    // XAF — minimum wallet top-up

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

  // ==========================================
  // WALLET DEPOSIT (top-up via mobile money)
  // ==========================================

  async initiateDeposit(
    technicianId: string,
    dto: { amount: number; operator: string; phoneNumber: string },
  ) {
    const profile = await this.prisma.technicianProfile.findUnique({
      where: { userId: technicianId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profil technicien introuvable');

    if (dto.amount < MIN_DEPOSIT) {
      throw new BadRequestException(`Montant minimum de rechargement: ${MIN_DEPOSIT} XAF`);
    }

    const result = await this.pawaPayService.initiateDeposit({
      amount: dto.amount,
      currency: 'XAF',
      phoneNumber: dto.phoneNumber,
      operator: dto.operator,
      description: 'Rechargement portefeuille AlloTech',
      metadata: { technicianProfileId: profile.id, purpose: 'wallet_deposit' },
    });

    this.logger.log(`Wallet deposit initiated: ${result.depositId} for tech ${profile.id}`);

    // Persist the pending deposit so we can track / poll it later
    await this.prisma.depositRequest.create({
      data: {
        technicianProfileId: profile.id,
        amount: dto.amount,
        currency: 'XAF',
        operator: dto.operator,
        phoneNumber: dto.phoneNumber,
        pawapayDepositId: result.depositId,
        status: 'PENDING',
      },
    });

    return {
      depositId: result.depositId,
      amount: dto.amount,
      status: result.status,
      message: 'Veuillez confirmer le paiement sur votre téléphone.',
    };
  }

  async checkDepositStatus(technicianId: string, depositId: string) {
    const profile = await this.prisma.technicianProfile.findUnique({
      where: { userId: technicianId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profil technicien introuvable');

    const deposit = await this.prisma.depositRequest.findUnique({
      where: { pawapayDepositId: depositId },
    });
    if (!deposit) throw new NotFoundException('Rechargement introuvable');
    if (deposit.technicianProfileId !== profile.id) throw new NotFoundException('Rechargement introuvable');

    // If already finalized, return current status without hitting PawaPay
    if (deposit.status === 'COMPLETED' || deposit.status === 'FAILED') {
      return {
        depositId,
        status: deposit.status,
        amount: deposit.amount,
        failureReason: deposit.failureReason ?? undefined,
      };
    }

    // Poll PawaPay for current status
    const pawaStatus = await this.pawaPayService.getDepositStatus(depositId);

    // PawaPay sandbox returns 'FOUND' for successfully processed deposits
    if (pawaStatus.status === 'COMPLETED' || pawaStatus.status === 'FOUND') {
      await this.completeDeposit(deposit.technicianProfileId, deposit.amount, depositId);
      return { depositId, status: 'COMPLETED' as const, amount: deposit.amount };
    }

    if (pawaStatus.status === 'FAILED' || pawaStatus.status === 'IN_RECONCILIATION') {
      const reason = pawaStatus.failureReason?.failureMessage ?? 'Paiement échoué';
      await this.prisma.depositRequest.update({
        where: { pawapayDepositId: depositId },
        data: { status: 'FAILED', failureReason: reason, completedAt: new Date() },
      });
      return { depositId, status: 'FAILED' as const, amount: deposit.amount, failureReason: reason };
    }

    // Still pending / processing
    return { depositId, status: pawaStatus.status, amount: deposit.amount };
  }

  async getDepositHistory(technicianId: string) {
    const profile = await this.prisma.technicianProfile.findUnique({
      where: { userId: technicianId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profil technicien introuvable');

    const deposits = await this.prisma.depositRequest.findMany({
      where: { technicianProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return deposits.map((d) => ({
      id: d.id,
      depositId: d.pawapayDepositId,
      amount: d.amount,
      currency: d.currency,
      operator: d.operator,
      phoneNumber: d.phoneNumber,
      status: d.status,
      failureReason: d.failureReason,
      createdAt: d.createdAt,
      completedAt: d.completedAt,
    }));
  }

  /** Called by PaymentsService webhook once PawaPay confirms the deposit */
  async completeDeposit(technicianProfileId: string, amount: number, depositId: string) {
    const profile = await this.prisma.technicianProfile.findUnique({
      where: { id: technicianProfileId },
      select: { id: true, walletBalance: true },
    });
    if (!profile) return;

    // Guard against double-crediting
    const existing = await this.prisma.depositRequest.findUnique({
      where: { pawapayDepositId: depositId },
      select: { status: true },
    });
    if (existing?.status === 'COMPLETED') {
      this.logger.warn(`Deposit ${depositId} already completed, skipping duplicate credit`);
      return;
    }

    const newBalance = profile.walletBalance + amount;

    await this.prisma.$transaction([
      this.prisma.technicianProfile.update({
        where: { id: profile.id },
        data: { walletBalance: newBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          technicianProfileId: profile.id,
          type: 'WALLET_DEPOSIT',
          amount,
          balanceAfter: newBalance,
          description: `Rechargement portefeuille`,
          referenceId: depositId,
          referenceType: 'DEPOSIT',
        },
      }),
      this.prisma.depositRequest.updateMany({
        where: { pawapayDepositId: depositId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
    ]);

    this.logger.log(`Wallet credited +${amount} XAF for tech ${technicianProfileId} (deposit ${depositId})`);
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
