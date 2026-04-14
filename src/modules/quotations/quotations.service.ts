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

    // Calculate costs — enrich each material with computed totalPrice
    const enrichedMaterials = dto.materials.map((m) => ({
      ...m,
      totalPrice: m.quantity * m.unitPrice,
    }));
    const materialsCost = enrichedMaterials.reduce((sum, m) => sum + m.totalPrice, 0);
    const totalCost = materialsCost + dto.laborCost;

    const quotation = await this.prisma.quotation.create({
      data: {
        needId: dto.needId,
        technicianId,
        stateOfWork: dto.stateOfWork,
        urgencyLevel: dto.urgencyLevel,
        proposedSolution: dto.proposedSolution,
        materials: JSON.stringify(enrichedMaterials),
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

    let enrichedMaterialsForUpdate: any[] | undefined;
    if (dto.materials) {
      enrichedMaterialsForUpdate = dto.materials.map((m) => ({
        ...m,
        totalPrice: m.quantity * m.unitPrice,
      }));
      materialsCost = enrichedMaterialsForUpdate.reduce((sum, m) => sum + m.totalPrice, 0);
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
        materials: enrichedMaterialsForUpdate ? JSON.stringify(enrichedMaterialsForUpdate) : undefined,
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
        primaryMission: { select: { id: true, status: true } },
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

    const payableStatuses = ['ACCEPTED', 'AWAITING_PAYMENT'];
    if (!payableStatuses.includes(quotation.status)) {
      throw new BadRequestException(
        `Le devis doit être accepté avant de procéder au paiement (statut actuel: ${quotation.status})`,
      );
    }

    // If already AWAITING_PAYMENT, check the real PawaPay status before deciding
    if (quotation.status === 'AWAITING_PAYMENT' && quotation.heldPaymentId) {
      const existingPayment = await this.prisma.payment.findUnique({
        where: { id: quotation.heldPaymentId },
      });

      if (existingPayment?.status === 'PENDING' && existingPayment.transactionId) {
        try {
          const depositStatus = await this.pawaPayService.getDepositStatus(
            existingPayment.transactionId,
          );

          // Already completed on PawaPay side — trigger confirmation now
          if (depositStatus.status === 'COMPLETED' || depositStatus.status === 'FOUND') {
            await this.onQuotationPaymentConfirmed(existingPayment.id);
            return {
              paymentId: existingPayment.id,
              depositId: existingPayment.transactionId,
              amount: Number(existingPayment.amount),
              currency: existingPayment.currency,
              status: 'COMPLETED',
              message: 'Paiement confirmé. Le devis est maintenant payé.',
            };
          }

          // Still genuinely processing — tell the client to wait
          if (depositStatus.status === 'PROCESSING' || depositStatus.status === 'ACCEPTED') {
            return {
              paymentId: existingPayment.id,
              depositId: existingPayment.transactionId,
              amount: Number(existingPayment.amount),
              currency: existingPayment.currency,
              status: 'PENDING',
              message: 'Paiement en cours de traitement sur le réseau mobile. Patientez encore quelques secondes.',
            };
          }

          // FAILED or unknown → fall through to reset + new payment
        } catch (_) {
          // PawaPay unreachable — still reset so user can retry
        }
      }

      // Previous payment failed or unreachable — reset and allow a fresh attempt
      await this.prisma.payment.updateMany({
        where: { id: quotation.heldPaymentId, status: 'PENDING' },
        data: { status: 'FAILED', paymentDetails: JSON.stringify({ failureReason: 'RESTARTED_BY_CLIENT' }) },
      });
      await this.prisma.quotation.update({
        where: { id: quotationId },
        data: { status: 'ACCEPTED', heldPaymentId: null, heldAmount: null },
      });
    }

    const amount = Number(quotation.totalCost ?? 0);

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
        paymentMethod: 'PAWAPAY',
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
   * Marks quotation as PAID and credits technician wallet directly.
   * Sends invoice email to both client and technician.
   */
  async onQuotationPaymentConfirmed(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) return;

    const details = payment.paymentDetails ? JSON.parse(payment.paymentDetails as string) : {};
    if (details.purpose !== 'quotation_payment') return;

    const { quotationId } = details;

    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        need: { select: { id: true, title: true, clientId: true } },
        technician: { include: { technicianProfile: true } },
      },
    });
    if (!quotation) return;

    const amount = Number(quotation.totalCost);
    const techProfile = quotation.technician.technicianProfile;
    const newBalance = techProfile ? techProfile.walletBalance + amount : amount;

    // Generate invoice number from quotation id
    const invoiceNumber = `INV-${quotationId.slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-6)}`;

    // Atomic: mark PAID + mark payment completed + credit tech wallet
    await this.prisma.$transaction([
      this.prisma.quotation.update({
        where: { id: quotationId },
        data: { status: 'PAID' },
      }),
      this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'COMPLETED' },
      }),
      ...(techProfile ? [
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
            description: `Paiement devis — « ${quotation.need.title} »`,
            referenceId: quotationId,
            referenceType: 'QUOTATION',
          },
        }),
      ] : []),
    ]);

    // Fetch client info for emails
    const clientUser = await this.prisma.user.findUnique({
      where: { id: quotation.need.clientId },
      select: { email: true, firstName: true, lastName: true },
    });

    const paymentDate = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    const operatorLabel = details.operator === 'MTN_MOMO_CMR' ? 'MTN Mobile Money' : 'Orange Money';
    const techName = `${quotation.technician.firstName} ${quotation.technician.lastName}`;
    const clientName = clientUser ? `${clientUser.firstName} ${clientUser.lastName}` : 'Client';
    const laborCost = Number(quotation.laborCost ?? 0).toLocaleString('fr-FR');
    const materialsCost = Number(quotation.materialsCost ?? 0).toLocaleString('fr-FR');
    const totalAmount = amount.toLocaleString('fr-FR');

    const invoiceBase = {
      invoiceNumber,
      needTitle: quotation.need.title,
      clientName,
      technicianName: techName,
      laborCost,
      materialsCost,
      totalAmount,
      currency: quotation.currency,
      paymentDate,
      operator: operatorLabel,
      phoneNumber: details.phoneNumber ?? '',
    };

    // Send invoice to client
    if (clientUser?.email) {
      await this.mailService.sendInvoice(clientUser.email, {
        ...invoiceBase,
        recipientName: clientName,
        role: 'client',
      });
    }

    // Send invoice to technician
    const techUser = await this.prisma.user.findUnique({
      where: { id: quotation.technicianId },
      select: { email: true },
    });
    if (techUser?.email) {
      await this.mailService.sendInvoice(techUser.email, {
        ...invoiceBase,
        recipientName: techName,
        role: 'technician',
      });
    }

    // Notify technician — funds credited
    await this.notificationsService.createNotification({
      userId: quotation.technicianId,
      type: 'PAYMENT',
      title: 'Paiement reçu 🎉',
      body: `${amount.toLocaleString('fr-FR')} XAF ont été crédités sur votre portefeuille pour « ${quotation.need.title} ». Démarrez les travaux !`,
      data: { quotationId, needId: quotation.need.id, invoiceNumber },
    });

    // Notify client — payment confirmed
    await this.notificationsService.createNotification({
      userId: quotation.need.clientId,
      type: 'PAYMENT',
      title: 'Paiement confirmé',
      body: `Votre paiement de ${amount.toLocaleString('fr-FR')} XAF pour « ${quotation.need.title} » est confirmé. Une facture vous a été envoyée par email.`,
      data: { quotationId, needId: quotation.need.id, invoiceNumber },
    });

    this.logger.log(`Quotation ${quotationId} paid. ${amount} XAF credited to tech ${quotation.technicianId}. Invoice ${invoiceNumber} sent.`);
  }

  /**
   * Client pays with cash — marks quotation as PAID immediately and creates a CASH Payment record.
   * Cash payments do NOT credit the technician wallet (funds are collected directly on-site).
   * They are tracked as platform-generated revenue only.
   */
  async confirmCashPayment(quotationId: string, clientId: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        need: { select: { id: true, title: true, clientId: true } },
      },
    });

    if (!quotation) throw new NotFoundException('Devis introuvable');
    if (quotation.need.clientId !== clientId) throw new ForbiddenException('Non autorisé');
    if (quotation.status !== 'ACCEPTED') {
      throw new BadRequestException(
        `Le devis doit être accepté pour un paiement en espèces (statut actuel: ${quotation.status})`,
      );
    }

    const amount = Number(quotation.totalCost ?? 0);
    const invoiceNumber = `INV-${quotationId.slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-6)}`;

    // Create CASH payment record (revenue tracking only — no wallet credit)
    const payment = await this.prisma.payment.create({
      data: {
        clientId,
        technicianId: quotation.technicianId,
        amount,
        currency: quotation.currency,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        paymentDetails: JSON.stringify({
          purpose: 'quotation_payment',
          quotationId,
          needId: quotation.need.id,
          paymentMethod: 'CASH',
        }),
      },
    });

    // Mark quotation as PAID (no wallet transaction for cash)
    await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'PAID', heldPaymentId: payment.id, heldAmount: amount },
    });

    // Notify technician — cash collected on-site, no wallet credit
    await this.notificationsService.createNotification({
      userId: quotation.technicianId,
      type: 'PAYMENT',
      title: 'Paiement en espèces confirmé',
      body: `Le client a confirmé le paiement de ${amount.toLocaleString('fr-FR')} XAF en espèces pour « ${quotation.need.title} ».`,
      data: { quotationId, needId: quotation.need.id, invoiceNumber },
    });

    this.logger.log(`Quotation ${quotationId} paid in cash (${amount} XAF). Revenue tracked, no wallet credit.`);

    return { paymentId: payment.id, amount, currency: quotation.currency, status: 'COMPLETED' };
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
        primaryMission: { select: { id: true, technicianValidatedAt: true } },
      },
    });

    if (!quotation) throw new NotFoundException('Devis introuvable');
    if (quotation.need.clientId !== clientId) throw new ForbiddenException('Non autorisé');
    if (quotation.status !== 'PAID') {
      throw new BadRequestException(
        'La validation ne peut se faire que pour un devis dont le paiement est confirmé',
      );
    }

    const techProfile = quotation.technician.technicianProfile;
    if (!techProfile) throw new BadRequestException('Profil technicien introuvable');

    // Funds already credited at payment time — just complete the mission
    const releaseAmount = Number(quotation.heldAmount ?? quotation.totalCost);
    const newBalance = techProfile.walletBalance; // no additional credit

    await this.prisma.$transaction([
      // Mark payment as completed if still pending
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
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              clientValidatedAt: new Date(),
              // Preserve technicianValidatedAt if already set, otherwise stamp it too
              ...(!quotation.primaryMission.technicianValidatedAt
                ? { technicianValidatedAt: new Date() }
                : {}),
            },
          })]
        : []),
    ]);

    // Notify technician — client validated work
    await this.notificationsService.createNotification({
      userId: quotation.technicianId,
      type: 'MISSION',
      title: 'Travaux validés par le client ✅',
      body: `Le client a confirmé la fin des travaux pour « ${quotation.need.title} ». Mission terminée.`,
      data: { quotationId },
    });

    // Notify client
    await this.notificationsService.createNotification({
      userId: quotation.need.clientId,
      type: 'MISSION',
      title: 'Mission terminée ✅',
      body: `Vous avez validé la fin des travaux pour « ${quotation.need.title} ». Merci d'utiliser AlloTech !`,
      data: { quotationId },
    });

    this.logger.log(`Quotation ${quotationId} completion approved by client ${clientId}`);

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
