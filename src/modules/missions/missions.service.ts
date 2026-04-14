import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { MailService } from '../mail/mail.service';
import { PawaPayService } from '../payments/providers/pawapay.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ScheduleMissionDto,
  ValidateMissionDto,
  CancelMissionDto,
  RequestCompletionDto,
  AddMissionDocumentDto,
  CreateAdditionalQuotationDto,
  QueryMissionsDto,
} from './dto/mission.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import { MissionStatus } from '@prisma/client';

@Injectable()
export class MissionsService {
  private readonly logger = new Logger(MissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
    private readonly mailService: MailService,
    private readonly pawaPayService: PawaPayService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==========================================
  // MISSION CREATION (from signed quotation)
  // ==========================================

  async createMissionFromSignedQuotation(quotationId: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        need: true,
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (quotation.status !== 'ACCEPTED') {
      throw new BadRequestException('Quotation must be accepted to create a mission');
    }

    // Check if mission already exists for this quotation
    const existing = await this.prisma.mission.findUnique({
      where: { quotationId },
    });

    if (existing) {
      return existing;
    }

    const mission = await this.prisma.mission.create({
      data: {
        needId: quotation.needId,
        quotationId: quotation.id,
        clientId: quotation.need.clientId,
        technicianId: quotation.technicianId,
        status: 'PENDING',
        address: quotation.need.address,
        latitude: quotation.need.latitude,
        longitude: quotation.need.longitude,
      },
      include: this.missionIncludes(),
    });

    // Transition need to IN_PROGRESS
    await this.prisma.need.update({
      where: { id: quotation.needId },
      data: { status: 'IN_PROGRESS' },
    });

    // Auto-create conversation for this mission
    try {
      await this.messagingService.createConversationForMission(
        mission.id,
        quotation.need.clientId,
        quotation.technicianId,
      );
    } catch (err) {
      this.logger.warn(`Failed to auto-create conversation for mission ${mission.id}: ${err}`);
    }

    // Notify both parties about mission creation
    const client = await this.prisma.user.findUnique({ where: { id: quotation.need.clientId }, select: { email: true, firstName: true } });
    if (client?.email) {
      await this.mailService.sendMissionCreated(client.email, {
        name: client.firstName || 'Client',
        needTitle: quotation.need.title,
        otherPartyName: `${quotation.technician.firstName} ${quotation.technician.lastName}`,
        role: 'client',
      });
    }
    const techUser = await this.prisma.user.findUnique({ where: { id: quotation.technicianId }, select: { email: true } });
    if (techUser?.email) {
      await this.mailService.sendMissionCreated(techUser.email, {
        name: quotation.technician.firstName,
        needTitle: quotation.need.title,
        otherPartyName: client?.firstName || 'Client',
        role: 'technician',
      });
    }

    return mission;
  }

  // ==========================================
  // MISSION CREATION (from accepted candidature — direct flow)
  // ==========================================

  async createMissionFromCandidature(
    candidatureId: string,
    options?: { proposedDate: string; proposedTime: string },
  ) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id: candidatureId },
      include: {
        need: true,
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!candidature) {
      throw new NotFoundException('Candidature introuvable');
    }

    if (candidature.status !== 'ACCEPTED') {
      throw new BadRequestException('La candidature doit être acceptée pour créer une mission');
    }

    // Check if mission already exists for this need + technician
    const existing = await this.prisma.mission.findFirst({
      where: {
        needId: candidature.needId,
        technicianId: candidature.technicianId,
        status: { notIn: ['CANCELLED'] },
      },
    });

    if (existing) {
      return existing;
    }

    const mission = await this.prisma.mission.create({
      data: {
        needId: candidature.needId,
        clientId: candidature.need.clientId,
        technicianId: candidature.technicianId,
        status: 'PENDING',
        scheduledDate: options?.proposedDate ? new Date(options.proposedDate) : null,
        scheduledTime: options?.proposedTime || null,
        address: candidature.need.address,
        latitude: candidature.need.latitude,
        longitude: candidature.need.longitude,
        proposedAmount: candidature.proposedPrice ?? null,
      },
      include: this.missionIncludes(),
    });

    // Auto-create conversation for this mission
    try {
      await this.messagingService.createConversationForMission(
        mission.id,
        candidature.need.clientId,
        candidature.technicianId,
      );
    } catch (err) {
      this.logger.error(
        `Failed to auto-create conversation for mission ${mission.id}: ${err}`,
        (err as Error).stack,
      );
    }

    // Notify both parties about mission creation
    const client = await this.prisma.user.findUnique({ where: { id: candidature.need.clientId }, select: { email: true, firstName: true } });
    if (client?.email) {
      await this.mailService.sendMissionCreated(client.email, {
        name: client.firstName || 'Client',
        needTitle: candidature.need.title,
        otherPartyName: `${candidature.technician.firstName} ${candidature.technician.lastName}`,
        role: 'client',
      });
    }
    const techUser = await this.prisma.user.findUnique({ where: { id: candidature.technicianId }, select: { email: true } });
    if (techUser?.email) {
      await this.mailService.sendMissionCreated(techUser.email, {
        name: candidature.technician.firstName,
        needTitle: candidature.need.title,
        otherPartyName: client?.firstName || 'Client',
        role: 'technician',
      });
    }

    return mission;
  }

  async confirmMissionSchedule(missionId: string, technicianId: string) {
    const mission = await this.prisma.mission.findFirst({
      where: { id: missionId, technicianId, status: 'PENDING' },
    });

    if (!mission) {
      throw new NotFoundException('Mission non trouvée ou non en attente de confirmation');
    }

    return this.prisma.mission.update({
      where: { id: missionId },
      data: { status: 'SCHEDULED' },
      include: this.missionIncludes(),
    });
  }

  // ==========================================
  // MISSION CREATION (from started appointment)
  // ==========================================

  async createMissionFromAppointment(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        need: true,
        client: { select: { id: true, firstName: true, lastName: true } },
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Rendez-vous introuvable');
    }

    // Check if mission already exists for this appointment
    const existing = await this.prisma.mission.findUnique({
      where: { appointmentId },
    });

    if (existing) {
      return existing;
    }

    // Also check if a mission already exists for this need + technician
    if (appointment.needId) {
      const existingByNeed = await this.prisma.mission.findFirst({
        where: {
          needId: appointment.needId,
          technicianId: appointment.technicianId,
          status: { notIn: ['CANCELLED'] },
        },
      });
      if (existingByNeed) {
        return existingByNeed;
      }
    }

    const mission = await this.prisma.mission.create({
      data: {
        appointmentId: appointment.id,
        needId: appointment.needId || undefined,
        clientId: appointment.clientId,
        technicianId: appointment.technicianId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        scheduledDate: appointment.scheduledDate,
        scheduledTime: appointment.scheduledTime,
        address: appointment.need?.address || appointment.address,
        latitude: appointment.need?.latitude || appointment.latitude,
        longitude: appointment.need?.longitude || appointment.longitude,
      },
      include: this.missionIncludes(),
    });

    // If linked to a need, update need status to IN_PROGRESS
    if (appointment.needId) {
      await this.prisma.need.update({
        where: { id: appointment.needId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    // Auto-create conversation for this mission
    try {
      await this.messagingService.createConversationForMission(
        mission.id,
        appointment.clientId,
        appointment.technicianId,
      );
    } catch (err) {
      this.logger.warn(`Failed to auto-create conversation for mission ${mission.id}: ${err}`);
    }

    return mission;
  }

  // ==========================================
  // READ OPERATIONS
  // ==========================================

  async getMission(missionId: string, userId: string) {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      include: this.missionDetailIncludes(),
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    if (mission.clientId !== userId && mission.technicianId !== userId) {
      throw new ForbiddenException('Accès non autorisé à cette mission');
    }

    return this.parseMissionQuotation(mission);
  }

  async getClientMissions(clientId: string, query: QueryMissionsDto) {
    const where: any = { clientId };
    if (query.status) {
      where.status = query.status;
    }

    const [missions, total] = await Promise.all([
      this.prisma.mission.findMany({
        where,
        include: this.missionIncludes(),
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.mission.count({ where }),
    ]);

    return createPaginatedResult(missions, total, query);
  }

  async getTechnicianMissions(technicianId: string, query: QueryMissionsDto) {
    const where: any = { technicianId };
    if (query.status) {
      where.status = query.status;
    }

    const [missions, total] = await Promise.all([
      this.prisma.mission.findMany({
        where,
        include: this.missionIncludes(),
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.mission.count({ where }),
    ]);

    return createPaginatedResult(missions, total, query);
  }

  // ==========================================
  // LIFECYCLE OPERATIONS
  // ==========================================

  async scheduleMission(missionId: string, technicianId: string, dto: ScheduleMissionDto) {
    const mission = await this.getMissionForTechnician(missionId, technicianId);

    if (mission.status !== 'PENDING') {
      throw new BadRequestException('La mission doit être en attente pour être planifiée');
    }

    const updated = await this.prisma.mission.update({
      where: { id: missionId },
      data: {
        scheduledDate: new Date(dto.scheduledDate),
        scheduledTime: dto.scheduledTime,
        status: 'SCHEDULED',
      },
      include: this.missionIncludes(),
    });

    // Notify client about scheduling
    const client = await this.prisma.user.findUnique({ where: { id: mission.clientId }, select: { email: true, firstName: true } });
    const tech = await this.prisma.user.findUnique({ where: { id: technicianId }, select: { firstName: true, lastName: true } });
    if (client?.email) {
      await this.mailService.sendMissionScheduled(client.email, {
        clientName: client.firstName || 'Client',
        technicianName: `${tech?.firstName || ''} ${tech?.lastName || ''}`.trim(),
        needTitle: updated.need?.title || 'Mission',
        date: dto.scheduledDate,
        time: dto.scheduledTime,
      });
    }

    return updated;
  }

  async startMission(missionId: string, technicianId: string) {
    const mission = await this.getMissionForTechnician(missionId, technicianId);

    if (mission.status !== 'SCHEDULED' && mission.status !== 'PENDING') {
      throw new BadRequestException('La mission doit être planifiée ou en attente pour démarrer');
    }

    // Enforce payment before mission start when a quotation is linked
    if (mission.quotationId) {
      const quotation = await this.prisma.quotation.findUnique({
        where: { id: mission.quotationId },
        select: { status: true },
      });
      if (!quotation || quotation.status !== 'PAID') {
        throw new BadRequestException(
          'Le devis associé doit être payé par le client avant de pouvoir démarrer cette mission',
        );
      }
    }

    // Enforce payment before mission start for candidature-based missions with a proposedAmount
    if (!mission.quotationId && mission.proposedAmount && Number(mission.proposedAmount) > 0) {
      if (!mission.clientPaidAt) {
        throw new BadRequestException(
          'Le client doit effectuer le paiement avant que vous puissiez démarrer cette mission',
        );
      }
    }

    const updated = await this.prisma.mission.update({
      where: { id: missionId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
      include: this.missionIncludes(),
    });

    // Notify client that mission has started
    const client = await this.prisma.user.findUnique({ where: { id: mission.clientId }, select: { email: true, firstName: true } });
    const tech = await this.prisma.user.findUnique({ where: { id: technicianId }, select: { firstName: true, lastName: true } });
    if (client?.email) {
      await this.mailService.sendMissionStarted(client.email, {
        clientName: client.firstName || 'Client',
        technicianName: `${tech?.firstName || ''} ${tech?.lastName || ''}`.trim(),
        needTitle: updated.need?.title || 'Mission',
      });
    }

    return updated;
  }

  async requestCompletion(missionId: string, technicianId: string, dto: RequestCompletionDto) {
    const mission = await this.getMissionForTechnician(missionId, technicianId);

    if (mission.status !== 'IN_PROGRESS') {
      throw new BadRequestException('La mission doit être en cours pour demander la complétion');
    }

    const updated = await this.prisma.mission.update({
      where: { id: missionId },
      data: {
        status: 'PENDING_VALIDATION',
        technicianValidatedAt: new Date(),
        technicianNotes: dto.notes,
      },
      include: this.missionIncludes(),
    });

    // Notify client to validate the mission
    const client = await this.prisma.user.findUnique({ where: { id: mission.clientId }, select: { email: true, firstName: true } });
    const tech = await this.prisma.user.findUnique({ where: { id: technicianId }, select: { firstName: true, lastName: true } });
    const techName = `${tech?.firstName || ''} ${tech?.lastName || ''}`.trim();
    const needTitle = updated.need?.title || 'Mission';

    if (client?.email) {
      await this.mailService.sendMissionValidationRequested(client.email, {
        clientName: client.firstName || 'Client',
        technicianName: techName,
        needTitle,
      });
    }

    // Push notification — ensures the client sees the prompt even if not checking email
    await this.notificationsService.createNotification({
      userId: mission.clientId,
      type: 'MISSION',
      title: 'Travaux terminés — validation requise',
      body: `${techName} a terminé les travaux pour « ${needTitle} ». Ouvrez la mission pour confirmer.`,
      data: { missionId, needTitle },
    });

    return updated;
  }

  async validateMission(missionId: string, userId: string, dto: ValidateMissionDto) {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    if (mission.clientId !== userId && mission.technicianId !== userId) {
      throw new ForbiddenException('Accès non autorisé');
    }

    if (mission.status !== 'PENDING_VALIDATION' && mission.status !== 'IN_PROGRESS') {
      throw new BadRequestException('La mission doit être en attente de validation');
    }

    const isClient = mission.clientId === userId;
    const isTechnician = mission.technicianId === userId;

    const updateData: any = {};

    if (isClient) {
      if (mission.clientValidatedAt) {
        throw new BadRequestException('Vous avez déjà validé cette mission');
      }
      updateData.clientValidatedAt = new Date();
      updateData.clientNotes = dto.notes;
    }

    if (isTechnician) {
      if (mission.technicianValidatedAt) {
        throw new BadRequestException('Vous avez déjà validé cette mission');
      }
      updateData.technicianValidatedAt = new Date();
      updateData.technicianNotes = dto.notes;
    }

    // Check if both have now validated
    const clientValidated = isClient ? true : !!mission.clientValidatedAt;
    const techValidated = isTechnician ? true : !!mission.technicianValidatedAt;

    if (clientValidated && techValidated) {
      updateData.status = 'COMPLETED';
      updateData.completedAt = new Date();

      // Also complete the need (if linked)
      if (mission.needId) {
        await this.prisma.need.update({
          where: { id: mission.needId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }
    } else if (mission.status === 'IN_PROGRESS') {
      // If first validation, move to PENDING_VALIDATION
      updateData.status = 'PENDING_VALIDATION';
    }

    const updated = await this.prisma.mission.update({
      where: { id: missionId },
      data: updateData,
      include: this.missionIncludes(),
    });

    const needTitle = updated.need?.title || 'Mission';

    if (updated.status === 'COMPLETED') {
      // Both parties validated — notify both with push + email
      const clientUser = await this.prisma.user.findUnique({ where: { id: mission.clientId }, select: { email: true, firstName: true } });
      const techUser = await this.prisma.user.findUnique({ where: { id: mission.technicianId }, select: { email: true, firstName: true } });
      if (clientUser?.email) {
        await this.mailService.sendMissionCompleted(clientUser.email, { name: clientUser.firstName || 'Client', needTitle });
      }
      if (techUser?.email) {
        await this.mailService.sendMissionCompleted(techUser.email, { name: techUser.firstName || 'Technicien', needTitle });
      }
      await this.notificationsService.createNotification({
        userId: mission.clientId,
        type: 'MISSION',
        title: 'Mission terminée ✅',
        body: `La mission « ${needTitle} » est clôturée. Merci d'utiliser AlloTech !`,
        data: { missionId },
      });
      await this.notificationsService.createNotification({
        userId: mission.technicianId,
        type: 'MISSION',
        title: 'Mission terminée ✅',
        body: `La mission « ${needTitle} » est clôturée avec succès.`,
        data: { missionId },
      });
    } else {
      // One party validated — notify the other party to do their part
      const otherUserId = isClient ? mission.technicianId : mission.clientId;
      const validatorLabel = isClient ? 'Le client' : 'Le technicien';
      await this.notificationsService.createNotification({
        userId: otherUserId,
        type: 'MISSION',
        title: 'Validation en attente',
        body: `${validatorLabel} a validé la fin des travaux pour « ${needTitle} ». À votre tour de confirmer.`,
        data: { missionId },
      });
    }

    return updated;
  }

  async cancelMission(missionId: string, userId: string, dto: CancelMissionDto) {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    if (mission.clientId !== userId && mission.technicianId !== userId) {
      throw new ForbiddenException('Accès non autorisé');
    }

    if (mission.status === 'COMPLETED' || mission.status === 'CANCELLED') {
      throw new BadRequestException('Cette mission ne peut plus être annulée');
    }

    const updated = await this.prisma.mission.update({
      where: { id: missionId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
      include: this.missionIncludes(),
    });

    // Notify the other party about cancellation
    const isClient = mission.clientId === userId;
    const otherUserId = isClient ? mission.technicianId : mission.clientId;
    const otherUser = await this.prisma.user.findUnique({ where: { id: otherUserId }, select: { email: true, firstName: true } });
    if (otherUser?.email) {
      await this.mailService.sendMissionCancelled(otherUser.email, {
        name: otherUser.firstName || 'Utilisateur',
        needTitle: updated.need?.title || 'Mission',
        reason: dto.reason,
        cancelledBy: isClient ? 'le client' : 'le technicien',
      });
    }

    return updated;
  }

  // ==========================================
  // DOCUMENT OPERATIONS
  // ==========================================

  async addDocument(missionId: string, userId: string, dto: AddMissionDocumentDto) {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    if (mission.clientId !== userId && mission.technicianId !== userId) {
      throw new ForbiddenException('Accès non autorisé');
    }

    if (mission.status === 'COMPLETED' || mission.status === 'CANCELLED') {
      throw new BadRequestException('Impossible d\'ajouter des documents à une mission terminée');
    }

    return this.prisma.missionDocument.create({
      data: {
        missionId,
        uploadedBy: userId,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        fileType: dto.fileType,
        caption: dto.caption,
      },
    });
  }

  async getDocuments(missionId: string, userId: string) {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    if (mission.clientId !== userId && mission.technicianId !== userId) {
      throw new ForbiddenException('Accès non autorisé');
    }

    return this.prisma.missionDocument.findMany({
      where: { missionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeDocument(documentId: string, userId: string) {
    const doc = await this.prisma.missionDocument.findUnique({
      where: { id: documentId },
      include: { mission: true },
    });

    if (!doc) {
      throw new NotFoundException('Document introuvable');
    }

    if (doc.uploadedBy !== userId) {
      throw new ForbiddenException('Seul l\'auteur peut supprimer ce document');
    }

    await this.prisma.missionDocument.delete({
      where: { id: documentId },
    });

    return { message: 'Document supprimé' };
  }

  // ==========================================
  // ADDITIONAL QUOTATION DURING MISSION
  // ==========================================

  async createAdditionalQuotation(
    missionId: string,
    technicianId: string,
    dto: CreateAdditionalQuotationDto,
  ) {
    const mission = await this.getMissionForTechnician(missionId, technicianId);

    if (mission.status !== 'IN_PROGRESS') {
      throw new BadRequestException('La mission doit être en cours pour créer un devis additionnel');
    }

    // Default urgencyLevel to the need's urgency if not provided
    let urgencyLevel = dto.urgencyLevel;
    if (!urgencyLevel) {
      const need = await this.prisma.need.findUnique({ where: { id: mission.needId }, select: { urgency: true } });
      urgencyLevel = need?.urgency ?? 'NORMAL';
    }

    const materialsCost = dto.materials.reduce(
      (sum, m) => sum + m.quantity * m.unitPrice,
      0,
    );
    const totalCost = materialsCost + dto.laborCost;

    const quotation = await this.prisma.quotation.create({
      data: {
        needId: mission.needId,
        technicianId,
        missionId,
        stateOfWork: dto.stateOfWork,
        urgencyLevel,
        proposedSolution: dto.proposedSolution,
        materials: JSON.stringify(dto.materials),
        laborCost: dto.laborCost,
        materialsCost,
        totalCost,
        currency: 'XAF',
        status: 'SENT',
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      },
      include: {
        images: true,
      },
    });

    // Notify client about additional quotation
    const client = await this.prisma.user.findUnique({ where: { id: mission.clientId }, select: { email: true, firstName: true } });
    const tech = await this.prisma.user.findUnique({ where: { id: technicianId }, select: { firstName: true, lastName: true } });
    const need = await this.prisma.need.findUnique({ where: { id: mission.needId }, select: { title: true } });
    if (client?.email) {
      await this.mailService.sendAdditionalQuotation(client.email, {
        clientName: client.firstName || 'Client',
        technicianName: `${tech?.firstName || ''} ${tech?.lastName || ''}`.trim(),
        needTitle: need?.title || 'Mission',
        totalCost: `${totalCost.toLocaleString('fr-FR')} XAF`,
      });
    }

    return quotation;
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private async getMissionForTechnician(missionId: string, technicianId: string) {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
    });

    if (!mission) {
      throw new NotFoundException('Mission introuvable');
    }

    if (mission.technicianId !== technicianId) {
      throw new ForbiddenException('Accès non autorisé à cette mission');
    }

    return mission;
  }

  /** Parse quotation.materials from JSON string → array (stored as string in DB) */
  private parseMissionQuotation(mission: any) {
    if (mission?.quotation?.materials && typeof mission.quotation.materials === 'string') {
      try {
        mission = {
          ...mission,
          quotation: {
            ...mission.quotation,
            materials: JSON.parse(mission.quotation.materials),
          },
        };
      } catch {
        mission = {
          ...mission,
          quotation: { ...mission.quotation, materials: [] },
        };
      }
    }
    return mission;
  }

  private missionIncludes() {
    return {
      need: {
        select: {
          id: true,
          title: true,
          description: true,
          urgency: true,
          status: true,
          address: true,
          city: true,
          latitude: true,
          longitude: true,
          category: { select: { id: true, name: true, icon: true } },
        },
      },
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImage: true,
          phone: true,
        },
      },
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
              latitude: true,
              longitude: true,
            },
          },
        },
      },
      quotation: {
        select: {
          id: true,
          totalCost: true,
          status: true,
          currency: true,
        },
      },
      appointment: {
        select: {
          id: true,
          scheduledDate: true,
          scheduledTime: true,
          duration: true,
          status: true,
          notes: true,
        },
      },
      _count: {
        select: {
          documents: true,
          additionalQuotations: true,
        },
      },
    } as const;
  }

  private missionDetailIncludes() {
    return {
      need: {
        include: {
          category: true,
          subCategory: true,
          needImages: true,
        },
      },
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImage: true,
          phone: true,
          email: true,
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
              avgRating: true,
              completedJobs: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      },
      quotation: {
        include: { images: true },
      },
      appointment: {
        select: {
          id: true,
          scheduledDate: true,
          scheduledTime: true,
          duration: true,
          status: true,
          notes: true,
          address: true,
        },
      },
      documents: {
        orderBy: { createdAt: 'desc' as const },
      },
      additionalQuotations: {
        include: { images: true },
        orderBy: { createdAt: 'desc' as const },
      },
      ratings: true,
    } as const;
  }

  // ==========================================
  // MISSION PAYMENT (candidature-based missions)
  // ==========================================

  async payMission(
    missionId: string,
    clientId: string,
    dto: { phoneNumber: string; operator: string },
  ) {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      include: { need: { select: { id: true, title: true } } },
    });

    if (!mission) throw new NotFoundException('Mission introuvable');
    if (mission.clientId !== clientId) throw new ForbiddenException('Non autorisé');

    if (!mission.proposedAmount || Number(mission.proposedAmount) <= 0) {
      throw new BadRequestException('Aucun montant de paiement défini pour cette mission');
    }

    if (mission.clientPaidAt) {
      throw new BadRequestException('Cette mission a déjà été payée');
    }

    // If already AWAITING_PAYMENT, check the real PawaPay status
    if (mission.heldPaymentId) {
      const existingPayment = await this.prisma.payment.findUnique({
        where: { id: mission.heldPaymentId },
      });

      if (existingPayment?.status === 'PENDING' && existingPayment.transactionId) {
        try {
          const depositStatus = await this.pawaPayService.getDepositStatus(
            existingPayment.transactionId,
          );

          if (depositStatus.status === 'COMPLETED' || depositStatus.status === 'FOUND') {
            await this.onMissionPaymentConfirmed(existingPayment.id);
            return {
              paymentId: existingPayment.id,
              depositId: existingPayment.transactionId,
              amount: Number(existingPayment.amount),
              currency: existingPayment.currency,
              status: 'COMPLETED',
              message: 'Paiement confirmé. La mission peut démarrer.',
            };
          }

          if (depositStatus.status === 'PROCESSING' || depositStatus.status === 'ACCEPTED') {
            return {
              paymentId: existingPayment.id,
              depositId: existingPayment.transactionId,
              amount: Number(existingPayment.amount),
              currency: existingPayment.currency,
              status: 'PENDING',
              message: 'Paiement en cours de traitement. Patientez encore quelques secondes.',
            };
          }
        } catch (_) {
          // PawaPay unreachable — reset and allow retry
        }
      }

      // Previous attempt failed — reset
      await this.prisma.payment.updateMany({
        where: { id: mission.heldPaymentId, status: 'PENDING' },
        data: { status: 'FAILED', paymentDetails: JSON.stringify({ failureReason: 'RESTARTED_BY_CLIENT' }) },
      });
      await this.prisma.mission.update({
        where: { id: missionId },
        data: { heldPaymentId: null, heldAmount: null },
      });
    }

    const amount = Number(mission.proposedAmount);
    const currency = 'XAF';

    const metadata: Record<string, string> = { missionId };
    if (mission.need?.id) metadata.needId = mission.need.id;

    const pawapayResult = await this.pawaPayService.initiateDeposit({
      amount,
      currency,
      phoneNumber: dto.phoneNumber,
      operator: dto.operator,
      description: `Mission AlloTech`,
      metadata,
    });

    const depositId = pawapayResult.depositId;

    const payment = await this.prisma.payment.create({
      data: {
        clientId,
        technicianId: mission.technicianId,
        amount,
        currency,
        paymentMethod: 'PAWAPAY',
        transactionId: depositId,
        status: 'PENDING',
        paymentDetails: JSON.stringify({
          purpose: 'mission_payment',
          missionId,
          needId: mission.need?.id,
          operator: dto.operator,
          phoneNumber: dto.phoneNumber,
          pawapayDepositId: depositId,
        }),
      },
    });

    await this.prisma.mission.update({
      where: { id: missionId },
      data: {
        heldPaymentId: payment.id,
        heldAmount: amount,
      },
    });

    return {
      paymentId: payment.id,
      depositId,
      amount,
      currency,
      status: pawapayResult.status,
      message: 'Paiement initié. Validez sur votre téléphone.',
    };
  }

  /**
   * Called by the PawaPay webhook when mission payment is confirmed.
   * Marks the mission as paid so the technician can start.
   */
  async onMissionPaymentConfirmed(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) return;

    const details = payment.paymentDetails ? JSON.parse(payment.paymentDetails as string) : {};
    if (details.purpose !== 'mission_payment') return;

    const { missionId } = details;

    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      include: { need: { select: { title: true } } },
    });
    if (!mission) return;

    // Update mission to mark as paid
    await this.prisma.mission.update({
      where: { id: missionId },
      data: {
        clientPaidAt: new Date(),
        heldAmount: Number(payment.amount),
      },
    });

    this.logger.log(`Mission payment confirmed: mission=${missionId}, payment=${paymentId}`);
  }
}
