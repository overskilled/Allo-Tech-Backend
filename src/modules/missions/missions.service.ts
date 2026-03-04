import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
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

    return mission;
  }

  // ==========================================
  // MISSION CREATION (from accepted candidature — direct flow)
  // ==========================================

  async createMissionFromCandidature(candidatureId: string) {
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
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        address: candidature.need.address,
        latitude: candidature.need.latitude,
        longitude: candidature.need.longitude,
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

    return mission;
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

    return mission;
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

    return this.prisma.mission.update({
      where: { id: missionId },
      data: {
        scheduledDate: new Date(dto.scheduledDate),
        scheduledTime: dto.scheduledTime,
        status: 'SCHEDULED',
      },
      include: this.missionIncludes(),
    });
  }

  async startMission(missionId: string, technicianId: string) {
    const mission = await this.getMissionForTechnician(missionId, technicianId);

    if (mission.status !== 'SCHEDULED' && mission.status !== 'PENDING') {
      throw new BadRequestException('La mission doit être planifiée ou en attente pour démarrer');
    }

    return this.prisma.mission.update({
      where: { id: missionId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
      include: this.missionIncludes(),
    });
  }

  async requestCompletion(missionId: string, technicianId: string, dto: RequestCompletionDto) {
    const mission = await this.getMissionForTechnician(missionId, technicianId);

    if (mission.status !== 'IN_PROGRESS') {
      throw new BadRequestException('La mission doit être en cours pour demander la complétion');
    }

    return this.prisma.mission.update({
      where: { id: missionId },
      data: {
        status: 'PENDING_VALIDATION',
        technicianValidatedAt: new Date(),
        technicianNotes: dto.notes,
      },
      include: this.missionIncludes(),
    });
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

    return this.prisma.mission.update({
      where: { id: missionId },
      data: updateData,
      include: this.missionIncludes(),
    });
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

    return this.prisma.mission.update({
      where: { id: missionId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
      include: this.missionIncludes(),
    });
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

    const materialsCost = dto.materials.reduce(
      (sum, m) => sum + m.quantity * m.unitPrice,
      0,
    );
    const totalCost = materialsCost + dto.laborCost;

    return this.prisma.quotation.create({
      data: {
        needId: mission.needId,
        technicianId,
        missionId,
        stateOfWork: dto.stateOfWork,
        urgencyLevel: dto.urgencyLevel,
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
}
