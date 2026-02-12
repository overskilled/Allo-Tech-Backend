import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
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

@Injectable()
export class QuotationsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const updated = await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'SENT' },
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

    // TODO: Send notification to client

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

    // TODO: Send notification to technician

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
