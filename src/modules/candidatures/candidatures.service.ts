import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SubmitCandidatureDto,
  UpdateCandidatureDto,
  RespondToCandidatureDto,
  QueryCandidaturesDto,
} from './dto/candidature.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import { CandidatureStatus } from '@prisma/client';

@Injectable()
export class CandidaturesService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Check if already applied
    const existing = await this.prisma.candidature.findUnique({
      where: {
        needId_technicianId: {
          needId: dto.needId,
          technicianId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('You have already applied for this need');
    }

    const candidature = await this.prisma.candidature.create({
      data: {
        needId: dto.needId,
        technicianId,
        message: dto.message,
        proposedDate: dto.proposedDate ? new Date(dto.proposedDate) : null,
        proposedPrice: dto.proposedPrice,
        status: 'PENDING',
      },
      include: {
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
      },
    });

    // TODO: Send notification to client about new candidature

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

    // TODO: Send notification to technician about response

    return {
      candidature: updated,
      message:
        newStatus === 'ACCEPTED'
          ? 'Candidature accepted. You can now contact the technician.'
          : 'Candidature rejected.',
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
