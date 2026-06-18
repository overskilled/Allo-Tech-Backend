import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MissionsService } from '../missions/missions.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  SubmitCandidatureDto,
  UpdateCandidatureDto,
  RespondToCandidatureDto,
  QueryCandidaturesDto,
} from './dto/candidature.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import { CandidatureStatus } from '@prisma/client';
import { AnalyticsService, ANALYTICS_EVENTS } from '../analytics/analytics.service';

/**
 * Time-slot windows the client picks on their need. Kept in sync with
 * mobile/src/screens/client/CreateNeedScreen.tsx timeSlotOptions.
 */
const TIME_SLOT_RANGES: Record<string, { start: number; end: number; label: string }> = {
  morning:   { start: 8,  end: 12, label: 'matin (8h–12h)' },
  afternoon: { start: 12, end: 17, label: 'après-midi (12h–17h)' },
  evening:   { start: 17, end: 21, label: 'soir (17h–21h)' },
};

@Injectable()
export class CandidaturesService {
  private readonly logger = new Logger(CandidaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly missionsService: MissionsService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly analytics: AnalyticsService,
  ) {}

  /**
   * Validate a technician's proposed date/time against the client's need.
   * Rules:
   *  - Must not be in the past (no point proposing a time that already passed).
   *  - Must not be after the client's `preferredDate` deadline (compared by
   *    calendar day in Africa/Douala, so the proposal can land on the same
   *    day at any time within the client's slot).
   *  - The hour must fall within the client's `preferredTimeSlot` window.
   * Returns silently when valid; throws BadRequestException otherwise.
   */
  private validateProposedDateTime(
    proposedIso: string | undefined,
    need: { preferredDate: Date | null; preferredTimeSlot: string | null },
  ) {
    if (!proposedIso) return; // proposedDate is optional

    const proposed = new Date(proposedIso);
    if (Number.isNaN(proposed.getTime())) {
      throw new BadRequestException('La date proposée est invalide.');
    }

    const now = new Date();
    if (proposed.getTime() < now.getTime()) {
      throw new BadRequestException(
        'La date proposée ne peut pas être dans le passé.',
      );
    }

    if (need.preferredDate) {
      // Compare on calendar-day so a same-day proposal is allowed at any hour
      // within the slot. End-of-day of the deadline = upper bound.
      const deadlineEod = new Date(need.preferredDate);
      deadlineEod.setHours(23, 59, 59, 999);
      if (proposed.getTime() > deadlineEod.getTime()) {
        const human = need.preferredDate.toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        throw new BadRequestException(
          `La date proposée ne peut pas être après le ${human} (date souhaitée par le client).`,
        );
      }
    }

    if (need.preferredTimeSlot) {
      const range = TIME_SLOT_RANGES[need.preferredTimeSlot];
      if (range) {
        const hour = proposed.getHours();
        const minute = proposed.getMinutes();
        // Allow [start, end) — minute 0 of `end` is already out of slot.
        const minutesFromMidnight = hour * 60 + minute;
        const startMin = range.start * 60;
        const endMin = range.end * 60;
        if (minutesFromMidnight < startMin || minutesFromMidnight >= endMin) {
          throw new BadRequestException(
            `L'heure proposée doit être dans le créneau du client : ${range.label}.`,
          );
        }
      }
    }
  }

  // ==========================================
  // TECHNICIAN OPERATIONS
  // ==========================================

  async submitCandidature(technicianId: string, dto: SubmitCandidatureDto) {
    // Verify user is a technician
    const technician = await this.prisma.user.findUnique({
      where: { id: technicianId },
      include: { technicianProfile: true },
    });

    if (!technician || technician.role !== 'TECHNICIAN') {
      throw new BadRequestException('Only technicians can submit candidatures');
    }

    if (!technician.technicianProfile) {
      throw new BadRequestException('Please complete your technician profile first');
    }

    // Verify need exists and is open
    const need = await this.prisma.need.findUnique({
      where: { id: dto.needId },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    if (need.status !== 'OPEN') {
      throw new BadRequestException('This need is no longer accepting candidatures');
    }

    // Date / time constraints (not past, not after client's deadline, within slot).
    this.validateProposedDateTime(dto.proposedDate, need);

    // Already applied? Re-application is allowed only when the prior attempt was
    // withdrawn or rejected — we revive that row (the (needId, technicianId) pair
    // is unique, so a second candidature can't be inserted). An active
    // application (pending / accepted / in-progress) still blocks re-applying.
    const existing = await this.prisma.candidature.findUnique({
      where: {
        needId_technicianId: {
          needId: dto.needId,
          technicianId,
        },
      },
    });

    const REAPPLYABLE_STATUSES = ['WITHDRAWN', 'REJECTED'];
    if (existing && !REAPPLYABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException('You have already applied for this need');
    }

    const candidatureInclude = {
      need: {
        select: {
          id: true,
          title: true,
          category: { select: { name: true } },
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    };

    const CANDIDATURE_FEE = 500;
    let candidature: any;
    let feeCharged = 0;

    if (existing) {
      // Reviving a withdrawn/rejected application: the fee was already paid for
      // this need on the first attempt, so it is NOT charged again.
      candidature = await this.prisma.candidature.update({
        where: { id: existing.id },
        data: {
          message: dto.message,
          proposedDate: dto.proposedDate ? new Date(dto.proposedDate) : null,
          proposedPrice: dto.proposedPrice,
          status: 'PENDING',
        },
        include: candidatureInclude,
      });
    } else {
      // ---- Wallet: deduct 500 XAF candidature fee ----
      const profile = technician.technicianProfile!;

      if (profile.walletBalance < CANDIDATURE_FEE) {
        throw new BadRequestException(
          `Solde insuffisant. Vous avez besoin de ${CANDIDATURE_FEE} XAF pour postuler. Solde actuel: ${profile.walletBalance} XAF`,
        );
      }

      const newBalance = profile.walletBalance - CANDIDATURE_FEE;
      feeCharged = CANDIDATURE_FEE;

      [candidature] = await this.prisma.$transaction([
        this.prisma.candidature.create({
          data: {
            needId: dto.needId,
            technicianId,
            message: dto.message,
            proposedDate: dto.proposedDate ? new Date(dto.proposedDate) : null,
            proposedPrice: dto.proposedPrice,
            status: 'PENDING',
          },
          include: candidatureInclude,
        }),
        this.prisma.technicianProfile.update({
          where: { id: profile.id },
          data: { walletBalance: newBalance },
        }),
        this.prisma.walletTransaction.create({
          data: {
            technicianProfileId: profile.id,
            type: 'CANDIDATURE_FEE',
            amount: -CANDIDATURE_FEE,
            balanceAfter: newBalance,
            description: `Frais de candidature pour le besoin "${dto.needId}"`,
            referenceId: dto.needId,
            referenceType: 'need',
          },
        }),
      ]);
    }

    // Notify client about new candidature
    if (candidature.need?.client?.id) {
      const clientId = candidature.need.client.id;
      const technicianName = `${technician.firstName} ${technician.lastName}`;
      const clientUser = await this.prisma.user.findUnique({ where: { id: clientId }, select: { email: true, firstName: true } });

      // Email
      if (clientUser?.email) {
        await this.mailService.sendNewCandidature(clientUser.email, {
          clientName: clientUser.firstName || 'Client',
          technicianName,
          needTitle: candidature.need.title,
          message: dto.message,
          proposedPrice: dto.proposedPrice,
        });
      }

      // Push + in-app notification
      await this.notificationsService.notifyNewCandidature({
        clientId,
        technicianName,
        needTitle: candidature.need.title,
        needId: candidature.need.id,
        candidatureId: candidature.id,
      });
    }

    this.analytics.capture({
      distinctId: technicianId,
      event: ANALYTICS_EVENTS.CANDIDATURE_CREATED,
      properties: {
        candidature_id: candidature.id,
        need_id: dto.needId,
        proposed_price: dto.proposedPrice,
        fee_xaf: feeCharged,
      },
      groups: { technician: technicianId },
    });

    // NOTE: Applying never auto-accepts. Every candidature stays PENDING and the
    // need stays OPEN until the client reviews the applicants and accepts one
    // manually (see respondToCandidature).

    return candidature;
  }

  async updateCandidature(
    candidatureId: string,
    technicianId: string,
    dto: UpdateCandidatureDto,
  ) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id: candidatureId },
    });

    if (!candidature) {
      throw new NotFoundException('Candidature not found');
    }

    if (candidature.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized to update this candidature');
    }

    if (candidature.status !== 'PENDING') {
      throw new BadRequestException('Can only update pending candidatures');
    }

    // Re-validate the proposed date/time against the (possibly updated) need.
    if (dto.proposedDate) {
      const need = await this.prisma.need.findUnique({
        where: { id: candidature.needId },
        select: { preferredDate: true, preferredTimeSlot: true },
      });
      if (need) this.validateProposedDateTime(dto.proposedDate, need);
    }

    return this.prisma.candidature.update({
      where: { id: candidatureId },
      data: {
        message: dto.message,
        proposedDate: dto.proposedDate ? new Date(dto.proposedDate) : undefined,
        proposedPrice: dto.proposedPrice,
      },
      include: {
        need: {
          select: {
            id: true,
            title: true,
            category: { select: { name: true } },
          },
        },
      },
    });
  }

  async withdrawCandidature(candidatureId: string, technicianId: string) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id: candidatureId },
    });

    if (!candidature) {
      throw new NotFoundException('Candidature not found');
    }

    if (candidature.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized to withdraw this candidature');
    }

    if (candidature.status !== 'PENDING') {
      throw new BadRequestException('Can only withdraw pending candidatures');
    }

    await this.prisma.candidature.update({
      where: { id: candidatureId },
      data: { status: 'WITHDRAWN' },
    });

    return { message: 'Candidature withdrawn successfully' };
  }

  async getTechnicianCandidatures(technicianId: string, query: QueryCandidaturesDto) {
    const where: any = { technicianId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.needId) {
      where.needId = query.needId;
    }

    const [candidatures, total] = await Promise.all([
      this.prisma.candidature.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          need: {
            select: {
              id: true,
              title: true,
              description: true,
              urgency: true,
              status: true,
              city: true,
              neighborhood: true,
              budgetMin: true,
              budgetMax: true,
              preferredDate: true,
              category: { select: { id: true, name: true, icon: true } },
              client: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  profileImage: true,
                },
              },
              _count: { select: { candidatures: true } },
            },
          },
        },
      }),
      this.prisma.candidature.count({ where }),
    ]);

    return createPaginatedResult(candidatures, total, query);
  }

  // ==========================================
  // CLIENT OPERATIONS
  // ==========================================

  async getCandidaturesForNeed(needId: string, clientId: string, query: QueryCandidaturesDto) {
    // Verify ownership
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    if (need.clientId !== clientId) {
      throw new ForbiddenException('Not authorized to view candidatures for this need');
    }

    const where: any = { needId };

    if (query.status) {
      where.status = query.status;
    }

    const [candidatures, total] = await Promise.all([
      this.prisma.candidature.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          technician: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
              phone: true,
              technicianProfile: {
                select: {
                  profession: true,
                  specialties: true,
                  yearsExperience: true,
                  avgRating: true,
                  totalJobs: true,
                  completedJobs: true,
                  isVerified: true,
                  city: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.candidature.count({ where }),
    ]);

    // Format technician profiles
    const formatted = candidatures.map((c) => ({
      ...c,
      technician: {
        ...c.technician,
        technicianProfile: c.technician.technicianProfile
          ? {
              ...c.technician.technicianProfile,
              specialties: this.parseJsonField(c.technician.technicianProfile.specialties),
            }
          : null,
      },
    }));

    return createPaginatedResult(formatted, total, query);
  }

  async respondToCandidature(
    candidatureId: string,
    clientId: string,
    dto: RespondToCandidatureDto,
  ) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id: candidatureId },
      include: {
        need: true,
        technician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!candidature) {
      throw new NotFoundException('Candidature not found');
    }

    if (candidature.need.clientId !== clientId) {
      throw new ForbiddenException('Not authorized to respond to this candidature');
    }

    if (candidature.status !== 'PENDING') {
      throw new BadRequestException('Can only respond to pending candidatures');
    }

    const newStatus: CandidatureStatus = dto.response === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED';

    // No date required from the client. The handshake is bounded:
    //   1) Client picks date/time at need creation.
    //   2) Technician approves it (proposedDate = client's) OR counter-proposes
    //      a different one — exactly once, at postulation.
    //   3) Client accepts/rejects this candidature. Accepting = mission
    //      scheduled at the candidature's proposedDate. No third pick, no
    //      tech confirmation step.
    // Acceptance therefore needs nothing more than `response: ACCEPTED`.

    // If accepting, reject all other pending candidatures for this need
    if (newStatus === 'ACCEPTED') {
      await this.prisma.candidature.updateMany({
        where: {
          needId: candidature.needId,
          id: { not: candidatureId },
          status: 'PENDING',
        },
        data: { status: 'REJECTED' },
      });

      // Update need status to IN_PROGRESS
      await this.prisma.need.update({
        where: { id: candidature.needId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    const updated = await this.prisma.candidature.update({
      where: { id: candidatureId },
      data: { status: newStatus },
      include: {
        technician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            phone: true,
          },
        },
        need: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Auto-create mission when candidature is accepted. We deliberately do
    // NOT forward dto.proposedDate / dto.proposedTime — the mission service
    // falls back to candidature.proposedDate (the tech's commitment, which
    // the client just accepted) and the mission goes straight to SCHEDULED.
    let mission = null;
    if (newStatus === 'ACCEPTED') {
      try {
        mission = await this.missionsService.createMissionFromCandidature(candidatureId);
        this.logger.log(
          `Mission ${mission.id} auto-created from candidature ${candidatureId}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to auto-create mission from candidature ${candidatureId}: ${err}`,
          (err as Error).stack,
        );
      }
    }

    // Notify technician about response
    const techUser = await this.prisma.user.findUnique({ where: { id: candidature.technicianId }, select: { email: true } });
    const clientUser = await this.prisma.user.findUnique({ where: { id: clientId }, select: { firstName: true, lastName: true } });
    if (techUser?.email) {
      if (newStatus === 'ACCEPTED') {
        // Derive date/time the same way the mission service does so the
        // email matches the actual mission schedule.
        const scheduled = candidature.proposedDate ? new Date(candidature.proposedDate) : null;
        const dateStr = scheduled
          ? scheduled.toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : '';
        const timeStr = scheduled
          ? scheduled.toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          : '';
        await this.mailService.sendCandidatureAccepted(techUser.email, {
          technicianName: candidature.technician.firstName,
          needTitle: candidature.need.title,
          clientName: `${clientUser?.firstName || ''} ${clientUser?.lastName || ''}`.trim(),
          date: dateStr,
          time: timeStr,
        });
      } else {
        await this.mailService.sendCandidatureRejected(techUser.email, {
          technicianName: candidature.technician.firstName,
          needTitle: candidature.need.title,
        });
      }
    }

    // Push + in-app notification to technician
    await this.notificationsService.notifyCandidatureResponse({
      technicianId: candidature.technicianId,
      needTitle: updated.need.title,
      accepted: newStatus === 'ACCEPTED',
      needId: updated.need.id,
    });

    this.analytics.capture({
      distinctId: clientId,
      event:
        newStatus === 'ACCEPTED'
          ? ANALYTICS_EVENTS.CANDIDATURE_ACCEPTED
          : ANALYTICS_EVENTS.CANDIDATURE_REJECTED,
      properties: {
        candidature_id: candidatureId,
        need_id: candidature.needId,
        technician_id: candidature.technicianId,
      },
      groups: { technician: candidature.technicianId },
    });

    return {
      candidature: updated,
      mission,
      message:
        newStatus === 'ACCEPTED'
          ? 'Candidature acceptée. En attente de confirmation du technicien.'
          : 'Candidature refusée.',
    };
  }

  async getClientCandidatures(clientId: string, query: QueryCandidaturesDto) {
    const where: any = {
      need: { clientId },
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.needId) {
      where.needId = query.needId;
    }

    const [candidatures, total] = await Promise.all([
      this.prisma.candidature.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          need: {
            select: {
              id: true,
              title: true,
              status: true,
              category: { select: { name: true } },
            },
          },
          technician: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
              technicianProfile: {
                select: {
                  profession: true,
                  avgRating: true,
                  isVerified: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.candidature.count({ where }),
    ]);

    return createPaginatedResult(candidatures, total, query);
  }

  // ==========================================
  // GENERAL OPERATIONS
  // ==========================================

  async getCandidatureById(candidatureId: string, userId: string) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id: candidatureId },
      include: {
        need: {
          select: {
            id: true,
            title: true,
            description: true,
            urgency: true,
            status: true,
            city: true,
            neighborhood: true,
            address: true,
            budgetMin: true,
            budgetMax: true,
            preferredDate: true,
            clientId: true,
            category: { select: { id: true, name: true, icon: true } },
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileImage: true,
              },
            },
          },
        },
        technician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            phone: true,
            email: true,
            technicianProfile: {
              select: {
                profession: true,
                specialties: true,
                yearsExperience: true,
                avgRating: true,
                totalJobs: true,
                completedJobs: true,
                isVerified: true,
                bio: true,
              },
            },
          },
        },
      },
    });

    if (!candidature) {
      throw new NotFoundException('Candidature not found');
    }

    // Verify access - either the technician who applied or the client who owns the need
    if (candidature.technicianId !== userId && candidature.need.clientId !== userId) {
      throw new ForbiddenException('Not authorized to view this candidature');
    }

    return {
      ...candidature,
      technician: {
        ...candidature.technician,
        technicianProfile: candidature.technician.technicianProfile
          ? {
              ...candidature.technician.technicianProfile,
              specialties: this.parseJsonField(
                candidature.technician.technicianProfile.specialties,
              ),
            }
          : null,
      },
    };
  }

  async getCandidatureStats(technicianId: string) {
    const [total, pending, accepted, rejected] = await Promise.all([
      this.prisma.candidature.count({ where: { technicianId } }),
      this.prisma.candidature.count({ where: { technicianId, status: 'PENDING' } }),
      this.prisma.candidature.count({ where: { technicianId, status: 'ACCEPTED' } }),
      this.prisma.candidature.count({ where: { technicianId, status: 'REJECTED' } }),
    ]);

    const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

    return {
      total,
      pending,
      accepted,
      rejected,
      acceptanceRate,
    };
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private parseJsonField(field: string | null): any {
    if (!field) return [];
    try {
      return JSON.parse(field);
    } catch {
      return [];
    }
  }
}
