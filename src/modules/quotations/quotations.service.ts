import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateQuotationDto,
  UpdateQuotationDto,
  RespondToQuotationDto,
  AddQuotationImageDto,
  QueryQuotationsDto,
} from './dto/quotation.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import { QuotationStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { MissionsService } from '../missions/missions.service';
import { MailService } from '../mail/mail.service';
import { PawaPayService } from '../payments/providers/pawapay.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MissionsService))
    private readonly missionsService: MissionsService,
    private readonly mailService: MailService,
    private readonly pawaPayService: PawaPayService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==========================================
  // TECHNICIAN OPERATIONS
  // ==========================================

  async createQuotation(technicianId: string, dto: CreateQuotationDto) {
    // Verify user is a technician
    const technician = await this.prisma.user.findUnique({
      where: { id: technicianId },
      include: { technicianProfile: true },
    });

    if (!technician || technician.role !== 'TECHNICIAN') {
      throw new BadRequestException('Only technicians can create quotations');
    }

    // Verify need exists and technician has an accepted candidature
    const need = await this.prisma.need.findUnique({
      where: { id: dto.needId },
      include: {
        candidatures: {
          where: { technicianId, status: 'ACCEPTED' },
        },
      },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    if (need.candidatures.length === 0) {
      throw new BadRequestException(
        'You must have an accepted candidature to create a quotation',
      );
    }

    // Check for existing quotation
    const existing = await this.prisma.quotation.findFirst({
      where: { needId: dto.needId, technicianId },
    });

    if (existing) {
      throw new BadRequestException('You already have a quotation for this need');
    }

    // Calculate costs
    const materialsCost = dto.materials.reduce(
      (sum, m) => sum + m.quantity * m.unitPrice,
      0,
    );
    const totalCost = materialsCost + dto.laborCost;

    const quotation = await this.prisma.quotation.create({
      data: {
        needId: dto.needId,
        technicianId,
        stateOfWork: dto.stateOfWork,
        urgencyLevel: dto.urgencyLevel,
        proposedSolution: dto.proposedSolution,
        materials: JSON.stringify(dto.materials),
        laborCost: dto.laborCost,
        materialsCost,
        totalCost,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        status: 'DRAFT',
      },
      include: {
        need: {
          select: {
            id: true,
            title: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    // Add images if provided
    if (dto.images && dto.images.length > 0) {
      await this.prisma.quotationImage.createMany({
        data: dto.images.map((url) => ({
          quotationId: quotation.id,
          imageUrl: url,
          type: 'site',
        })),
      });
    }

    return this.formatQuotation(quotation);
  }

  async updateQuotation(
    quotationId: string,
    technicianId: string,
    dto: UpdateQuotationDto,
  ) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (quotation.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized to update this quotation');
    }

    if (!['DRAFT', 'SENT'].includes(quotation.status)) {
      throw new BadRequestException('Cannot update quotation in current status');
    }

    // Recalculate costs if materials or labor changed
    let materialsCost = Number(quotation.materialsCost);
    let laborCost = Number(quotation.laborCost);

    if (dto.materials) {
      materialsCost = dto.materials.reduce(
        (sum, m) => sum + m.quantity * m.unitPrice,
        0,
      );
    }

    if (dto.laborCost !== undefined) {
      laborCost = dto.laborCost;
    }

    const totalCost = materialsCost + laborCost;

    return this.prisma.quotation.update({
      where: { id: quotationId },
      data: {
        stateOfWork: dto.stateOfWork,
        urgencyLevel: dto.urgencyLevel,
        proposedSolution: dto.proposedSolution,
        materials: dto.materials ? JSON.stringify(dto.materials) : undefined,
        laborCost: dto.laborCost,
        materialsCost,
        totalCost,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
    });
  }

  async submitQuotation(quotationId: string, technicianId: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (quotation.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized');
    }

    if (quotation.status !== 'DRAFT') {
      throw new BadRequestException('Only draft quotations can be submitted');
    }

    const signatureToken = uuidv4();
    const signatureTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const updated = await this.prisma.quotation.update({
      where: { id: quotationId },
      data: {
        status: 'SENT',
        signatureToken,
        signatureTokenExpiresAt,
      },
      include: {
        need: {
          select: {
            id: true,
            title: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    // Notify client with quotation details and signing link
    if (updated.need?.client?.id) {
      const clientUser = await this.prisma.user.findUnique({ where: { id: updated.need.client.id }, select: { email: true, firstName: true } });
      const techUser = await this.prisma.user.findUnique({ where: { id: technicianId }, select: { firstName: true, lastName: true } });
      if (clientUser?.email) {
        await this.mailService.sendNewQuotation(clientUser.email, {
          clientName: clientUser.firstName || 'Client',
          technicianName: `${techUser?.firstName || ''} ${techUser?.lastName || ''}`.trim(),
          needTitle: updated.need.title,
          totalCost: `${Number(updated.totalCost).toLocaleString('fr-FR')}`,
          currency: 'XAF',
        });
      }
    }

    return this.formatQuotation(updated);
  }

  async getTechnicianQuotations(technicianId: string, query: QueryQuotationsDto) {
    const where: any = { technicianId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.needId) {
      where.needId = query.needId;
    }

    const [quotations, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          need: {
            select: {
              id: true,
              title: true,
              urgency: true,
              status: true,
              category: { select: { name: true } },
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
          images: true,
        },
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return createPaginatedResult(
      quotations.map((q) => this.formatQuotation(q)),
      total,
      query,
    );
  }

  // ==========================================
  // CLIENT OPERATIONS
  // ==========================================

  async respondToQuotation(
    quotationId: string,
    clientId: string,
    dto: RespondToQuotationDto,
  ) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
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

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (quotation.need.clientId !== clientId) {
      throw new ForbiddenException('Not authorized');
    }

    if (quotation.status !== 'SENT') {
      throw new BadRequestException('Can only respond to sent quotations');
    }

    const newStatus: QuotationStatus =
      dto.response === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED';

    const updated = await this.prisma.quotation.update({
      where: { id: quotationId },
      data: {
        status: newStatus,
        clientResponse: dto.message,
        respondedAt: new Date(),
      },
    });

    // Notify technician about the response
    const techUser = await this.prisma.user.findUnique({ where: { id: quotation.technicianId }, select: { email: true } });
    if (techUser?.email) {
      if (newStatus === 'ACCEPTED') {
        await this.mailService.sendQuotationAccepted(techUser.email, {
          technicianName: quotation.technician.firstName,
          needTitle: quotation.need.title,
          totalCost: `${Number(quotation.totalCost).toLocaleString('fr-FR')}`,
          currency: 'XAF',
        });
      } else {
        await this.mailService.sendQuotationRejected(techUser.email, {
          technicianName: quotation.technician.firstName,
          needTitle: quotation.need.title,
          reason: dto.message,
        });
      }
    }

    return {
      quotation: this.formatQuotation(updated),
      message:
        newStatus === 'ACCEPTED'
          ? 'Quotation accepted. The technician will proceed with the work.'
          : 'Quotation rejected.',
    };
  }

  async getClientQuotations(clientId: string, query: QueryQuotationsDto) {
    const where: any = {
      need: { clientId },
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.needId) {
      where.needId = query.needId;
    }

    const [quotations, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          need: {
            select: {
              id: true,
              title: true,
              urgency: true,
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
          images: true,
        },
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return createPaginatedResult(
      quotations.map((q) => this.formatQuotation(q)),
      total,
      query,
    );
  }

  async getQuotationsForNeed(needId: string, clientId: string) {
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    if (need.clientId !== clientId) {
      throw new ForbiddenException('Not authorized');
    }

    const quotations = await this.prisma.quotation.findMany({
      where: { needId, status: { not: 'DRAFT' } },
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
                avgRating: true,
                totalJobs: true,
                isVerified: true,
              },
            },
          },
        },
        images: true,
      },
    });

    return quotations.map((q) => this.formatQuotation(q));
  }

  // ==========================================
  // GENERAL OPERATIONS
  // ==========================================

  async getQuotationById(quotationId: string, userId: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
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
            clientId: true,
            category: { select: { name: true, icon: true } },
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileImage: true,
                phone: true,
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
                avgRating: true,
                totalJobs: true,
                isVerified: true,
              },
            },
          },
        },
        images: true,
      },
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    // Verify access
    if (quotation.technicianId !== userId && quotation.need.clientId !== userId) {
      throw new ForbiddenException('Not authorized to view this quotation');
    }

    return this.formatQuotation(quotation);
  }

  // ==========================================
  // IMAGE OPERATIONS
  // ==========================================

  async addImage(
    quotationId: string,
    technicianId: string,
    dto: AddQuotationImageDto,
  ) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (quotation.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized');
    }

    const image = await this.prisma.quotationImage.create({
      data: {
        quotationId,
        imageUrl: dto.imageUrl,
        caption: dto.caption,
        type: dto.type || 'site',
      },
    });

    return image;
  }

  async removeImage(imageId: string, technicianId: string) {
    const image = await this.prisma.quotationImage.findUnique({
      where: { id: imageId },
      include: { quotation: true },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (image.quotation.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized');
    }

    await this.prisma.quotationImage.delete({
      where: { id: imageId },
    });

    return { message: 'Image removed successfully' };
  }

  // ==========================================
  // PUBLIC SIGNING OPERATIONS
  // ==========================================

  async getQuotationByToken(token: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { signatureToken: token },
      include: {
        need: {
          select: {
            id: true,
            title: true,
            description: true,
            urgency: true,
            address: true,
            city: true,
            neighborhood: true,
            category: { select: { name: true, icon: true } },
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
        images: true,
      },
    });

    if (!quotation) {
      throw new NotFoundException('Devis introuvable ou lien invalide');
    }

    if (quotation.clientSignedAt) {
      throw new BadRequestException('Ce devis a déjà été signé');
    }

    if (
      quotation.signatureTokenExpiresAt &&
      quotation.signatureTokenExpiresAt < new Date()
    ) {
      throw new BadRequestException('Ce lien de signature a expiré');
    }

    if (quotation.status !== 'SENT') {
      throw new BadRequestException('Ce devis ne peut plus être signé');
    }

    return this.formatQuotation(quotation);
  }

  async signQuotation(token: string, signature: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { signatureToken: token },
    });

    if (!quotation) {
      throw new NotFoundException('Devis introuvable ou lien invalide');
    }

    if (quotation.clientSignedAt) {
      throw new BadRequestException('Ce devis a déjà été signé');
    }

    if (
      quotation.signatureTokenExpiresAt &&
      quotation.signatureTokenExpiresAt < new Date()
    ) {
      throw new BadRequestException('Ce lien de signature a expiré');
    }

    if (quotation.status !== 'SENT') {
      throw new BadRequestException('Ce devis ne peut plus être signé');
    }

    const updated = await this.prisma.quotation.update({
      where: { id: quotation.id },
      data: {
        clientSignature: signature,
        clientSignedAt: new Date(),
        status: 'ACCEPTED',
        respondedAt: new Date(),
      },
    });

    // Auto-create mission from signed quotation
    let mission = null;
    try {
      mission = await this.missionsService.createMissionFromSignedQuotation(updated.id);
    } catch {
      // Mission creation is best-effort from token signing
    }

    // Notify technician about accepted quotation
    const techUser = await this.prisma.user.findUnique({ where: { id: quotation.technicianId }, select: { email: true, firstName: true } });
    const need = await this.prisma.need.findUnique({ where: { id: quotation.needId }, select: { title: true } });
    if (techUser?.email) {
      await this.mailService.sendQuotationAccepted(techUser.email, {
        technicianName: techUser.firstName || 'Technicien',
        needTitle: need?.title || 'Besoin',
        totalCost: `${Number(quotation.totalCost).toLocaleString('fr-FR')}`,
        currency: 'XAF',
      });
    }

    return {
      message: 'Devis signé avec succès',
      quotation: this.formatQuotation(updated),
      mission,
    };
  }

  // ==========================================
  // AUTHENTICATED SIGNING (in-app)
  // ==========================================

  async signQuotationAuthenticated(quotationId: string, clientId: string, signature: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { need: true },
    });

    if (!quotation) {
      throw new NotFoundException('Devis introuvable');
    }

    if (quotation.need.clientId !== clientId) {
      throw new ForbiddenException('Seul le client peut signer ce devis');
    }

    if (quotation.clientSignedAt) {
      throw new BadRequestException('Ce devis a déjà été signé');
    }

    if (quotation.status !== 'SENT') {
      throw new BadRequestException('Ce devis ne peut plus être signé');
    }

    const updated = await this.prisma.quotation.update({
      where: { id: quotationId },
      data: {
        clientSignature: signature,
        clientSignedAt: new Date(),
        status: 'ACCEPTED',
        respondedAt: new Date(),
      },
    });

    // Auto-create mission from signed quotation
    const mission = await this.missionsService.createMissionFromSignedQuotation(updated.id);

    // Notify technician about accepted quotation
    const techUser = await this.prisma.user.findUnique({ where: { id: quotation.technicianId }, select: { email: true, firstName: true } });
    if (techUser?.email) {
      await this.mailService.sendQuotationAccepted(techUser.email, {
        technicianName: techUser.firstName || 'Technicien',
        needTitle: quotation.need.title,
        totalCost: `${Number(quotation.totalCost).toLocaleString('fr-FR')}`,
        currency: 'XAF',
      });
    }

    return {
      message: 'Devis signé avec succès',
      quotation: this.formatQuotation(updated),
      mission,
    };
  }

  // ==========================================
  // PAYMENT HOLD / RELEASE FLOW
  // ==========================================

  /**
   * Client initiates payment for an accepted quotation.
   * Creates a PawaPay deposit and marks quotation as AWAITING_PAYMENT.
   */
  async payQuotation(
    quotationId: string,
    clientId: string,
    dto: { phoneNumber: string; operator: string },
  ) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        need: { select: { id: true, title: true, clientId: true } },
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!quotation) throw new NotFoundException('Devis introuvable');
    if (quotation.need.clientId !== clientId) throw new ForbiddenException('Non autorisé');
    if (quotation.status !== 'ACCEPTED') {
      throw new BadRequestException(
        'Le devis doit être accepté avant de procéder au paiement',
      );
    }

    const amount = Number(quotation.totalCost);

    // Initiate PawaPay deposit
    const pawapayResult = await this.pawaPayService.initiateDeposit({
      amount,
      currency: quotation.currency,
      phoneNumber: dto.phoneNumber,
      operator: dto.operator,
      description: `Paiement devis AlloTech`,
      metadata: { quotationId, needId: quotation.need.id },
    });

    const depositId = pawapayResult.depositId;

    // Persist Payment record for tracking
    const payment = await this.prisma.payment.create({
      data: {
        clientId,
        technicianId: quotation.technicianId,
        amount: amount,
        currency: quotation.currency,
        paymentMethod: 'mobile_money',
        transactionId: depositId,
        status: 'PENDING',
        paymentDetails: JSON.stringify({
          purpose: 'quotation_payment',
          quotationId,
          needId: quotation.need.id,
          operator: dto.operator,
          phoneNumber: dto.phoneNumber,
          pawapayDepositId: depositId,
        }),
      },
    });

    // Update quotation status
    await this.prisma.quotation.update({
      where: { id: quotationId },
      data: {
        status: 'AWAITING_PAYMENT',
        heldPaymentId: payment.id,
        heldAmount: amount,
      },
    });

    return {
      paymentId: payment.id,
      depositId,
      amount,
      currency: quotation.currency,
      status: pawapayResult.status,
      message: 'Paiement initié. Validez sur votre téléphone.',
    };
  }

  /**
   * Called by the PawaPay webhook when quotation payment is confirmed.
   * Marks quotation as PAID — funds are now held by AlloTech.
   */
  async onQuotationPaymentConfirmed(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) return;

    const details = payment.paymentDetails ? JSON.parse(payment.paymentDetails as string) : {};
    if (details.purpose !== 'quotation_payment') return;

    const { quotationId } = details;

    const quotation = await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'PAID' },
      include: {
        need: { select: { id: true, title: true, clientId: true } },
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify technician — funds held, work can start
    await this.notificationsService.createNotification({
      userId: quotation.technicianId,
      type: 'PAYMENT',
      title: 'Paiement reçu — démarrez les travaux',
      body: `Le client a payé ${Number(quotation.totalCost).toLocaleString('fr-FR')} XAF pour "${quotation.need.title}". Vous pouvez démarrer les travaux.`,
      data: { quotationId, needId: quotation.need.id },
    });

    // Notify client — payment held
    await this.notificationsService.createNotification({
      userId: quotation.need.clientId,
      type: 'PAYMENT',
      title: 'Paiement confirmé',
      body: `Votre paiement de ${Number(quotation.totalCost).toLocaleString('fr-FR')} XAF est sécurisé. ${quotation.technician.firstName} peut démarrer les travaux.`,
      data: { quotationId, needId: quotation.need.id },
    });

    this.logger.log(`Quotation ${quotationId} payment confirmed. Funds held.`);
  }

  /**
   * Client approves completion of work.
   * Releases held funds to technician's wallet.
   */
  async approveCompletion(quotationId: string, clientId: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        need: { select: { id: true, title: true, clientId: true } },
        technician: {
          include: { technicianProfile: true },
        },
        primaryMission: true,
      },
    });

    if (!quotation) throw new NotFoundException('Devis introuvable');
    if (quotation.need.clientId !== clientId) throw new ForbiddenException('Non autorisé');
    if (quotation.status !== 'PAID') {
      throw new BadRequestException(
        'Les fonds ne peuvent être libérés que pour un devis dont le paiement est confirmé',
      );
    }

    const techProfile = quotation.technician.technicianProfile;
    if (!techProfile) throw new BadRequestException('Profil technicien introuvable');

    const releaseAmount = Number(quotation.heldAmount ?? quotation.totalCost);
    const newBalance = techProfile.walletBalance + releaseAmount;

    await this.prisma.$transaction([
      // Credit tech wallet
      this.prisma.technicianProfile.update({
        where: { id: techProfile.id },
        data: { walletBalance: newBalance },
      }),
      // Wallet transaction record
      this.prisma.walletTransaction.create({
        data: {
          technicianProfileId: techProfile.id,
          type: 'MISSION_CREDIT',
          amount: releaseAmount,
          balanceAfter: newBalance,
          description: `Paiement libéré — "${quotation.need.title}"`,
          referenceId: quotationId,
          referenceType: 'QUOTATION',
        },
      }),
      // Mark payment as completed
      ...(quotation.heldPaymentId
        ? [this.prisma.payment.update({
            where: { id: quotation.heldPaymentId },
            data: { status: 'COMPLETED' },
          })]
        : []),
      // Complete the associated mission if exists
      ...(quotation.primaryMission
        ? [this.prisma.mission.update({
            where: { id: quotation.primaryMission.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          })]
        : []),
    ]);

    // Notify technician
    await this.notificationsService.createNotification({
      userId: quotation.technicianId,
      type: 'PAYMENT',
      title: 'Fonds libérés 🎉',
      body: `${releaseAmount.toLocaleString('fr-FR')} XAF ont été ajoutés à votre portefeuille pour "${quotation.need.title}".`,
      data: { quotationId, amount: releaseAmount },
    });

    this.logger.log(
      `Quotation ${quotationId} completion approved. ${releaseAmount} XAF released to tech ${quotation.technicianId}`,
    );

    return {
      success: true,
      amountReleased: releaseAmount,
      newTechnicianBalance: newBalance,
    };
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private formatQuotation(quotation: any) {
    return {
      ...quotation,
      materials: this.parseJsonField(quotation.materials),
      laborCost: Number(quotation.laborCost),
      materialsCost: Number(quotation.materialsCost),
      totalCost: Number(quotation.totalCost),
    };
  }

  private parseJsonField(field: string | null): any {
    if (!field) return [];
    try {
      return JSON.parse(field);
    } catch {
      return [];
    }
  }
}
