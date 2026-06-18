import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { AnalyticsService, ANALYTICS_EVENTS } from '../analytics/analytics.service';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import {
  QueryNeedsDto,
  QueryAdminMissionsDto,
  HealthQueryDto,
  AdminCancelDto,
  ReassignMissionDto,
  ForceCompleteDto,
  EscrowReleaseDto,
  EscrowRefundDto,
} from './dto/admin-ops.dto';

/**
 * AdminOpsService — 360 monitoring + enforcement over Needs (demandes) and
 * Missions. All mutating methods are ADMIN-only (guarded at the controller),
 * write an ActivityLog audit entry, and notify the affected parties.
 *
 * Escrow model reminder: funds are credited to the technician wallet at
 * payment-confirmation time (a MISSION_CREDIT WalletTransaction) and ONLY for
 * quotation-based missions. Candidature-based missions never credit a wallet.
 * Every money action checks for that credit before moving funds.
 */
@Injectable()
export class AdminOpsService {
  private readonly logger = new Logger(AdminOpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Mission statuses where escrow funds are held but not yet released/refunded. */
  private static readonly ESCROW_ACTIVE: Prisma.MissionWhereInput['status'] = {
    in: ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_VALIDATION', 'DISPUTED'],
  };

  /** First (and currently only) writer of ActivityLog. Fire-and-forget safe. */
  private async logAdminAction(p: {
    adminId: string;
    action: string;
    entityType: 'Need' | 'Mission' | 'Payment';
    entityId: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId: p.adminId,
          action: p.action,
          entityType: p.entityType,
          entityId: p.entityId,
          description: p.description,
          metadata: p.metadata ? JSON.stringify(p.metadata) : null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log ${p.action}: ${(err as Error).message}`);
    }
  }

  private clientSelect = {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      profileImage: true,
    },
  };

  private techSelect = {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      profileImage: true,
      technicianProfile: { select: { profession: true } },
    },
  };

  // ==========================================
  // NEEDS (demandes) — monitoring
  // ==========================================

  async listNeeds(query: QueryNeedsDto) {
    const where: Prisma.NeedWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.urgency) where.urgency = query.urgency;
    if (query.city) where.city = { contains: query.city };
    if (query.fromDate || query.toDate) {
      where.createdAt = {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
      };
    }
    if (query.search) {
      where.client = {
        OR: [
          { firstName: { contains: query.search } },
          { lastName: { contains: query.search } },
        ],
      };
    }
    if (query.issuesOnly) {
      where.status = 'OPEN';
      where.candidatures = { none: {} };
    }

    const orderBy = (
      query.sortBy
        ? { [query.sortBy]: query.sortOrder || 'desc' }
        : { createdAt: query.sortOrder || 'desc' }
    ) as Prisma.NeedOrderByWithRelationInput;

    const [data, total] = await Promise.all([
      this.prisma.need.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          title: true,
          status: true,
          urgency: true,
          city: true,
          neighborhood: true,
          budgetMin: true,
          budgetMax: true,
          createdAt: true,
          updatedAt: true,
          publishedAt: true,
          client: this.clientSelect,
          category: { select: { id: true, name: true, icon: true } },
          _count: {
            select: { candidatures: true, quotations: true, missions: true },
          },
        },
      }),
      this.prisma.need.count({ where }),
    ]);

    return createPaginatedResult(data, total, query);
  }

  async getNeed(id: string) {
    const need = await this.prisma.need.findUnique({
      where: { id },
      include: {
        client: this.clientSelect,
        category: { select: { id: true, name: true, icon: true } },
        subCategory: { select: { id: true, name: true } },
        needImages: true,
        candidatures: {
          orderBy: { createdAt: 'desc' },
          include: { technician: this.techSelect },
        },
        quotations: {
          orderBy: { createdAt: 'desc' },
          include: { technician: this.techSelect },
        },
        missions: {
          orderBy: { createdAt: 'desc' },
          include: { technician: this.techSelect },
        },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!need) throw new NotFoundException('Demande introuvable');
    return need;
  }

  async cancelNeed(id: string, adminId: string, dto: AdminCancelDto) {
    const need = await this.prisma.need.findUnique({
      where: { id },
      include: {
        missions: { where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } },
      },
    });
    if (!need) throw new NotFoundException('Demande introuvable');
    if (need.status === 'COMPLETED') {
      throw new BadRequestException('Une demande terminée ne peut pas être annulée');
    }
    if (need.status === 'CANCELLED') {
      throw new BadRequestException('Cette demande est déjà annulée');
    }

    // Cascade-cancel non-terminal missions to avoid orphaned active work.
    const hasHeldFunds = need.missions.some(
      (m) => !!m.heldPaymentId || !!m.clientPaidAt,
    );

    await this.prisma.$transaction([
      this.prisma.need.update({
        where: { id },
        data: { status: 'CANCELLED' },
      }),
      ...need.missions.map((m) =>
        this.prisma.mission.update({
          where: { id: m.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationReason: `Demande annulée par un administrateur : ${dto.reason}`,
          },
        }),
      ),
    ]);

    await this.notificationsService.createNotification({
      userId: need.clientId,
      type: 'NEED',
      title: 'Demande annulée',
      body: `Votre demande « ${need.title} » a été annulée par l'équipe AlloTech. Motif : ${dto.reason}`,
      data: { needId: id },
    });

    await this.logAdminAction({
      adminId,
      action: 'admin.need.cancel',
      entityType: 'Need',
      entityId: id,
      description: dto.reason,
      metadata: { cancelledMissions: need.missions.map((m) => m.id), hasHeldFunds },
    });

    return { id, status: 'CANCELLED', cancelledMissions: need.missions.length, hasHeldFunds };
  }

  // ==========================================
  // MISSIONS — monitoring
  // ==========================================

  async listMissions(query: QueryAdminMissionsDto) {
    const where: Prisma.MissionWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.city) where.need = { is: { city: { contains: query.city } } };
    if (query.fromDate || query.toDate) {
      where.createdAt = {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { client: { firstName: { contains: query.search } } },
        { client: { lastName: { contains: query.search } } },
        { technician: { firstName: { contains: query.search } } },
        { technician: { lastName: { contains: query.search } } },
      ];
    }
    if (query.escrowOnly) {
      where.clientPaidAt = { not: null };
      where.status = AdminOpsService.ESCROW_ACTIVE;
    }
    if (query.issuesOnly) {
      where.OR = this.missionIssuesOr();
    }

    const orderBy = (
      query.sortBy
        ? { [query.sortBy]: query.sortOrder || 'desc' }
        : { createdAt: query.sortOrder || 'desc' }
    ) as Prisma.MissionOrderByWithRelationInput;

    const [data, total] = await Promise.all([
      this.prisma.mission.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          status: true,
          scheduledDate: true,
          scheduledTime: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          clientPaidAt: true,
          heldAmount: true,
          proposedAmount: true,
          clientValidatedAt: true,
          technicianValidatedAt: true,
          need: { select: { id: true, title: true, city: true, urgency: true } },
          client: this.clientSelect,
          technician: this.techSelect,
          quotation: { select: { id: true, totalCost: true, status: true, currency: true } },
        },
      }),
      this.prisma.mission.count({ where }),
    ]);

    return createPaginatedResult(data, total, query);
  }

  async getMission(id: string) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: {
        need: {
          select: {
            id: true,
            title: true,
            description: true,
            urgency: true,
            status: true,
            address: true,
            city: true,
            neighborhood: true,
            latitude: true,
            longitude: true,
            category: { select: { id: true, name: true, icon: true } },
          },
        },
        client: this.clientSelect,
        technician: this.techSelect,
        quotation: {
          select: {
            id: true,
            status: true,
            totalCost: true,
            laborCost: true,
            materialsCost: true,
            currency: true,
            heldPaymentId: true,
            heldAmount: true,
          },
        },
        appointment: {
          select: { id: true, scheduledDate: true, scheduledTime: true, status: true },
        },
        documents: true,
        ratings: true,
        conversation: { select: { id: true } },
      },
    });

    if (!mission) throw new NotFoundException('Mission introuvable');

    // Surface whether a wallet credit exists (money already with the tech).
    const creditTxn = mission.quotationId
      ? await this.findMissionCredit(mission.quotationId)
      : null;

    return { ...mission, walletCredited: !!creditTxn };
  }

  // ==========================================
  // MISSIONS — enforcement
  // ==========================================

  async cancelMission(id: string, adminId: string, dto: AdminCancelDto) {
    const mission = await this.prisma.mission.findUnique({ where: { id } });
    if (!mission) throw new NotFoundException('Mission introuvable');
    if (mission.status === 'COMPLETED' || mission.status === 'CANCELLED') {
      throw new BadRequestException('Cette mission ne peut plus être annulée');
    }

    const hasHeldFunds = !!mission.heldPaymentId || !!mission.clientPaidAt;

    const updated = await this.prisma.mission.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
    });

    await this.notifyBoth(mission.clientId, mission.technicianId, {
      type: 'MISSION',
      title: 'Mission annulée',
      body: `La mission a été annulée par l'équipe AlloTech. Motif : ${dto.reason}`,
      data: { missionId: id },
    });

    this.analytics.capture({
      distinctId: adminId,
      event: ANALYTICS_EVENTS.MISSION_CANCELLED,
      properties: { mission_id: id, need_id: mission.needId, cancelled_by: 'admin', reason: dto.reason },
    });

    await this.logAdminAction({
      adminId,
      action: 'admin.mission.cancel',
      entityType: 'Mission',
      entityId: id,
      description: dto.reason,
      metadata: { hasHeldFunds },
    });

    return { ...updated, hasHeldFunds };
  }

  async reassignMission(id: string, adminId: string, dto: ReassignMissionDto) {
    const mission = await this.prisma.mission.findUnique({ where: { id } });
    if (!mission) throw new NotFoundException('Mission introuvable');

    if (mission.status !== 'PENDING' && mission.status !== 'SCHEDULED') {
      throw new BadRequestException(
        'Seules les missions non démarrées (à venir / planifiées) peuvent être réassignées',
      );
    }
    if (mission.clientPaidAt) {
      throw new BadRequestException(
        "Cette mission a déjà été payée. Remboursez l'acompte puis annulez-la avant de réassigner.",
      );
    }
    // Quotation-based missions are tech-specific (pricing + signed devis): a
    // simple swap would leave money/quotation with the wrong technician.
    const creditTxn = mission.quotationId ? await this.findMissionCredit(mission.quotationId) : null;
    if (mission.quotationId || creditTxn) {
      throw new BadRequestException(
        'Mission issue d’un devis : la réassignation directe est impossible. Remboursez l’escrow, annulez la mission, puis laissez le client ré-engager un technicien.',
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: dto.technicianId },
      select: { id: true, role: true, status: true, firstName: true, lastName: true },
    });
    if (!target || target.role !== 'TECHNICIAN') {
      throw new BadRequestException('Technicien cible introuvable');
    }
    if (target.status === 'SUSPENDED' || target.status === 'INACTIVE') {
      throw new BadRequestException("Le technicien cible n'est pas actif");
    }
    if (target.id === mission.technicianId) {
      throw new BadRequestException('Le technicien cible est déjà assigné à cette mission');
    }

    const previousTechnicianId = mission.technicianId;

    const updated = await this.prisma.mission.update({
      where: { id },
      data: {
        technicianId: dto.technicianId,
        ...(dto.newAmount !== undefined ? { proposedAmount: dto.newAmount } : {}),
      },
      include: { need: { select: { title: true } } },
    });

    // Re-point the mission conversation participants (one-to-one with mission).
    await this.prisma.conversation
      .update({
        where: { missionId: id },
        data: { participantIds: JSON.stringify([mission.clientId, dto.technicianId]) },
      })
      .catch(() => undefined);

    const needTitle = updated.need?.title || 'Mission';
    await this.notificationsService.createNotification({
      userId: previousTechnicianId,
      type: 'MISSION',
      title: 'Mission réassignée',
      body: `La mission « ${needTitle} » vous a été retirée par l'équipe AlloTech. Motif : ${dto.reason}`,
      data: { missionId: id },
    });
    await this.notificationsService.createNotification({
      userId: dto.technicianId,
      type: 'MISSION',
      title: 'Nouvelle mission assignée',
      body: `L'équipe AlloTech vous a assigné la mission « ${needTitle} ».`,
      data: { missionId: id },
    });
    await this.notificationsService.createNotification({
      userId: mission.clientId,
      type: 'MISSION',
      title: 'Technicien réassigné',
      body: `Un nouveau technicien a été assigné à votre mission « ${needTitle} ».`,
      data: { missionId: id },
    });

    await this.logAdminAction({
      adminId,
      action: 'admin.mission.reassign',
      entityType: 'Mission',
      entityId: id,
      description: dto.reason,
      metadata: { fromTechnicianId: previousTechnicianId, toTechnicianId: dto.technicianId, newAmount: dto.newAmount },
    });

    return updated;
  }

  async forceCompleteMission(id: string, adminId: string, dto: ForceCompleteDto) {
    const mission = await this.prisma.mission.findUnique({ where: { id } });
    if (!mission) throw new NotFoundException('Mission introuvable');
    if (mission.status === 'COMPLETED' || mission.status === 'CANCELLED') {
      throw new BadRequestException('Cette mission ne peut plus être clôturée');
    }

    const updated = await this.completeMissionInternal(mission, dto.note);

    this.analytics.capture({
      distinctId: adminId,
      event: ANALYTICS_EVENTS.MISSION_COMPLETED,
      properties: { mission_id: id, need_id: mission.needId, technician_id: mission.technicianId, forced_by: 'admin' },
      groups: { technician: mission.technicianId },
    });

    await this.notifyBoth(mission.clientId, mission.technicianId, {
      type: 'MISSION',
      title: 'Mission clôturée ✅',
      body: "La mission a été clôturée par l'équipe AlloTech.",
      data: { missionId: id },
    });

    await this.logAdminAction({
      adminId,
      action: 'admin.mission.force_complete',
      entityType: 'Mission',
      entityId: id,
      description: dto.reason,
      metadata: { previousStatus: mission.status },
    });

    return { ...updated, walletCredited: false };
  }

  async releaseEscrow(id: string, adminId: string, dto: EscrowReleaseDto) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: {
        quotation: { select: { id: true, totalCost: true } },
        need: { select: { title: true } },
        technician: { select: { technicianProfile: { select: { id: true, walletBalance: true } } } },
      },
    });
    if (!mission) throw new NotFoundException('Mission introuvable');
    if (mission.status === 'CANCELLED') {
      throw new BadRequestException('Impossible de libérer les fonds d’une mission annulée');
    }

    let walletCredited = false;

    // Credit-gap fill: quotation-based mission whose webhook never credited.
    if (mission.quotationId) {
      const creditTxn = await this.findMissionCredit(mission.quotationId);
      const techProfile = mission.technician?.technicianProfile;
      if (!creditTxn && techProfile && mission.quotation) {
        const amount = Number(mission.quotation.totalCost);
        const newBalance = techProfile.walletBalance + amount;
        await this.prisma.$transaction([
          this.prisma.technicianProfile.update({
            where: { id: techProfile.id },
            data: { walletBalance: newBalance },
          }),
          this.prisma.walletTransaction.create({
            data: {
              technicianProfileId: techProfile.id,
              type: 'MISSION_CREDIT',
              amount,
              balanceAfter: newBalance,
              description: `Libération escrow (admin) « ${mission.need?.title || 'Mission'} »`,
              referenceId: mission.quotationId,
              referenceType: 'QUOTATION',
            },
          }),
        ]);
        walletCredited = true;
      }
    }

    // Finalize the mission (mirrors force-complete).
    if (mission.status !== 'COMPLETED') {
      await this.completeMissionInternal(mission, undefined);
    }

    await this.notifyBoth(mission.clientId, mission.technicianId, {
      type: 'MISSION',
      title: 'Fonds libérés',
      body: "L'équipe AlloTech a confirmé la clôture et la libération des fonds de la mission.",
      data: { missionId: id },
    });

    await this.logAdminAction({
      adminId,
      action: 'admin.mission.escrow_release',
      entityType: 'Mission',
      entityId: id,
      description: dto.reason,
      metadata: { walletCredited },
    });

    return { missionId: id, status: 'COMPLETED', walletCredited };
  }

  async refundEscrow(id: string, adminId: string, dto: EscrowRefundDto) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: {
        quotation: { select: { id: true, heldPaymentId: true, heldAmount: true } },
        technician: { select: { technicianProfile: { select: { id: true, walletBalance: true } } } },
      },
    });
    if (!mission) throw new NotFoundException('Mission introuvable');

    const paymentId = mission.heldPaymentId ?? mission.quotation?.heldPaymentId ?? null;
    if (!paymentId) {
      throw new BadRequestException('Aucun paiement bloqué (escrow) à rembourser pour cette mission');
    }

    // Idempotency: refuse if we already issued an admin debit for this mission.
    const priorDebit = await this.prisma.walletTransaction.findFirst({
      where: { type: 'ADMIN_DEBIT', referenceType: 'MISSION', referenceId: id },
    });
    if (priorDebit) {
      throw new BadRequestException('Un remboursement a déjà été effectué pour cette mission');
    }

    // 1) PSP refund FIRST (network; throws on non-COMPLETED payment → abort
    //    before any wallet/DB mutation).
    await this.paymentsService.refundPayment(paymentId, dto.reason);

    // 2) Reverse the technician wallet credit if one exists (quotation missions).
    const creditTxn = mission.quotationId ? await this.findMissionCredit(mission.quotationId) : null;
    const techProfile = mission.technician?.technicianProfile;
    let walletDebited = false;

    const txnOps: Prisma.PrismaPromise<any>[] = [
      this.prisma.mission.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: `Remboursement escrow (admin) : ${dto.reason}`,
          heldPaymentId: null,
          heldAmount: null,
        },
      }),
    ];

    if (creditTxn && techProfile) {
      const amount = Number(creditTxn.amount);
      const newBalance = techProfile.walletBalance - amount;
      txnOps.push(
        this.prisma.technicianProfile.update({
          where: { id: techProfile.id },
          data: { walletBalance: newBalance },
        }),
        this.prisma.walletTransaction.create({
          data: {
            technicianProfileId: techProfile.id,
            type: 'ADMIN_DEBIT',
            amount: -amount,
            balanceAfter: newBalance,
            description: `Remboursement escrow au client (admin) : ${dto.reason}`,
            referenceId: id,
            referenceType: 'MISSION',
          },
        }),
      );
      walletDebited = true;
    }

    await this.prisma.$transaction(txnOps);

    await this.notifyBoth(mission.clientId, mission.technicianId, {
      type: 'PAYMENT',
      title: 'Mission remboursée',
      body: `L'équipe AlloTech a remboursé l'acompte de la mission. Motif : ${dto.reason}`,
      data: { missionId: id },
    });

    await this.logAdminAction({
      adminId,
      action: 'admin.mission.escrow_refund',
      entityType: 'Payment',
      entityId: paymentId,
      description: dto.reason,
      metadata: { missionId: id, walletDebited, amount: creditTxn ? Number(creditTxn.amount) : null },
    });

    return { paymentId, refunded: true, walletDebited };
  }

  // ==========================================
  // HEALTH / ISSUES SUMMARY
  // ==========================================

  async getOpsHealth(_query?: HealthQueryDto) {
    // Current-state operational counts (no aging window) — these are the live
    // worklist an admin acts on, so they must reflect reality, not a stale subset.
    const [
      stuckInProgress,
      stuckPendingValidation,
      disputed,
      openNeedsNoCandidatures,
      paidNotAdvancing,
      escrowHeldNoMovement,
    ] = await Promise.all([
      this.prisma.mission.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.mission.count({ where: { status: 'PENDING_VALIDATION' } }),
      this.prisma.mission.count({ where: { status: 'DISPUTED' } }),
      this.prisma.need.count({ where: { status: 'OPEN', candidatures: { none: {} } } }),
      this.prisma.quotation.count({
        where: { status: 'PAID', primaryMission: { is: { status: { in: ['PENDING', 'SCHEDULED'] } } } },
      }),
      this.prisma.mission.count({
        where: { clientPaidAt: { not: null }, status: AdminOpsService.ESCROW_ACTIVE },
      }),
    ]);

    return {
      staleDays: 0,
      stuckInProgress,
      stuckPendingValidation,
      disputed,
      openNeedsNoCandidatures,
      paidNotAdvancing,
      escrowHeldNoMovement,
    };
  }

  // ==========================================
  // INTERNAL HELPERS
  // ==========================================

  /** OR predicates that define an "at-risk" mission (current state). */
  private missionIssuesOr(): Prisma.MissionWhereInput[] {
    return [
      { status: 'IN_PROGRESS' },
      { status: 'PENDING_VALIDATION' },
      { status: 'DISPUTED' },
      { clientPaidAt: { not: null }, status: AdminOpsService.ESCROW_ACTIVE },
    ];
  }

  private findMissionCredit(quotationId: string) {
    return this.prisma.walletTransaction.findFirst({
      where: { type: 'MISSION_CREDIT', referenceType: 'QUOTATION', referenceId: quotationId },
    });
  }

  /** Mark a mission COMPLETED (both-party stamps preserved) + complete the need. */
  private async completeMissionInternal(
    mission: { id: string; needId: string | null; clientValidatedAt: Date | null; technicianValidatedAt: Date | null },
    adminNote?: string,
  ) {
    const now = new Date();
    const updated = await this.prisma.mission.update({
      where: { id: mission.id },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        clientValidatedAt: mission.clientValidatedAt ?? now,
        technicianValidatedAt: mission.technicianValidatedAt ?? now,
        ...(adminNote ? { clientNotes: adminNote } : {}),
      },
    });

    if (mission.needId) {
      await this.prisma.need.update({
        where: { id: mission.needId },
        data: { status: 'COMPLETED', completedAt: now },
      });
    }

    return updated;
  }

  private async notifyBoth(
    clientId: string,
    technicianId: string,
    payload: { type: 'MISSION' | 'PAYMENT' | 'NEED'; title: string; body: string; data?: Record<string, unknown> },
  ) {
    await this.notificationsService.createNotification({ userId: clientId, ...payload });
    await this.notificationsService.createNotification({ userId: technicianId, ...payload });
  }
}
