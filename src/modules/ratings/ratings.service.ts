import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateRatingDto,
  UpdateRatingDto,
  QueryRatingsDto,
} from './dto/rating.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // CLIENT OPERATIONS
  // ==========================================

  async createRating(clientId: string, dto: CreateRatingDto) {
    // Verify client
    const client = await this.prisma.user.findUnique({
      where: { id: clientId },
    });

    if (!client || client.role !== 'CLIENT') {
      throw new BadRequestException('Only clients can submit ratings');
    }

    // Verify technician
    const technician = await this.prisma.user.findUnique({
      where: { id: dto.technicianId },
      include: { technicianProfile: true },
    });

    if (!technician || technician.role !== 'TECHNICIAN') {
      throw new BadRequestException('Invalid technician');
    }

    // Verify that client had an interaction with this technician
    const hasInteraction = await this.prisma.appointment.findFirst({
      where: {
        clientId,
        technicianId: dto.technicianId,
        status: 'COMPLETED',
      },
    });

    if (!hasInteraction) {
      throw new BadRequestException(
        'You can only rate technicians you have completed an appointment with',
      );
    }

    // Check for existing rating
    const existing = await this.prisma.rating.findUnique({
      where: {
        clientId_technicianId: {
          clientId,
          technicianId: dto.technicianId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('You have already rated this technician');
    }

    // Require comment for low scores
    if (dto.score <= 2 && !dto.comment) {
      throw new BadRequestException('Comment is required for ratings of 2 or below');
    }

    const rating = await this.prisma.rating.create({
      data: {
        clientId,
        technicianId: dto.technicianId,
        score: dto.score,
        comment: dto.comment,
      },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
          },
        },
      },
    });

    // Update technician's average rating
    await this.updateTechnicianRating(dto.technicianId);

    return rating;
  }

  async updateRating(ratingId: string, clientId: string, dto: UpdateRatingDto) {
    const rating = await this.prisma.rating.findUnique({
      where: { id: ratingId },
    });

    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    if (rating.clientId !== clientId) {
      throw new ForbiddenException('Not authorized to update this rating');
    }

    // Require comment for low scores
    const newScore = dto.score ?? rating.score;
    if (newScore <= 2 && !dto.comment && !rating.comment) {
      throw new BadRequestException('Comment is required for ratings of 2 or below');
    }

    const updated = await this.prisma.rating.update({
      where: { id: ratingId },
      data: {
        score: dto.score,
        comment: dto.comment,
      },
    });

    // Update technician's average rating
    await this.updateTechnicianRating(rating.technicianId);

    return updated;
  }

  async deleteRating(ratingId: string, clientId: string) {
    const rating = await this.prisma.rating.findUnique({
      where: { id: ratingId },
    });

    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    if (rating.clientId !== clientId) {
      throw new ForbiddenException('Not authorized to delete this rating');
    }

    const technicianId = rating.technicianId;

    await this.prisma.rating.delete({
      where: { id: ratingId },
    });

    // Update technician's average rating
    await this.updateTechnicianRating(technicianId);

    return { message: 'Rating deleted successfully' };
  }

  async getClientRatings(clientId: string, query: QueryRatingsDto) {
    const where: any = { clientId };

    if (query.minScore) {
      where.score = { gte: query.minScore };
    }

    if (query.maxScore) {
      where.score = { ...where.score, lte: query.maxScore };
    }

    const [ratings, total] = await Promise.all([
      this.prisma.rating.findMany({
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
              technicianProfile: {
                select: {
                  profession: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.rating.count({ where }),
    ]);

    return createPaginatedResult(ratings, total, query);
  }

  // ==========================================
  // TECHNICIAN/PUBLIC OPERATIONS
  // ==========================================

  async getTechnicianRatings(technicianId: string, query: QueryRatingsDto) {
    const where: any = { technicianId };

    if (query.minScore) {
      where.score = { gte: query.minScore };
    }

    if (query.maxScore) {
      where.score = { ...where.score, lte: query.maxScore };
    }

    const [ratings, total] = await Promise.all([
      this.prisma.rating.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
        },
      }),
      this.prisma.rating.count({ where }),
    ]);

    return createPaginatedResult(ratings, total, query);
  }

  async getTechnicianRatingSummary(technicianId: string) {
    const technician = await this.prisma.user.findUnique({
      where: { id: technicianId },
      include: { technicianProfile: true },
    });

    if (!technician || technician.role !== 'TECHNICIAN') {
      throw new NotFoundException('Technician not found');
    }

    const [total, scoreDistribution, avgScore] = await Promise.all([
      this.prisma.rating.count({ where: { technicianId } }),
      this.prisma.rating.groupBy({
        by: ['score'],
        where: { technicianId },
        _count: { score: true },
      }),
      this.prisma.rating.aggregate({
        where: { technicianId },
        _avg: { score: true },
      }),
    ]);

    // Build score distribution
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    scoreDistribution.forEach((item) => {
      distribution[item.score] = item._count.score;
    });

    // Calculate satisfaction metrics
    const satisfiedCount = distribution[4] + distribution[5];
    const unsatisfiedCount = distribution[1] + distribution[2];
    const satisfactionRate = total > 0 ? Math.round((satisfiedCount / total) * 100) : 0;

    return {
      totalRatings: total,
      averageScore: avgScore._avg.score || 0,
      distribution,
      satisfiedCount,
      unsatisfiedCount,
      neutralCount: distribution[3],
      satisfactionRate,
    };
  }

  async getRecentRatings(technicianId: string, limit = 5) {
    return this.prisma.rating.findMany({
      where: { technicianId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
          },
        },
      },
    });
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private async updateTechnicianRating(technicianId: string) {
    const stats = await this.prisma.rating.aggregate({
      where: { technicianId },
      _avg: { score: true },
      _count: { score: true },
    });

    const satisfiedCount = await this.prisma.rating.count({
      where: { technicianId, score: { gte: 4 } },
    });

    const unsatisfiedCount = await this.prisma.rating.count({
      where: { technicianId, score: { lte: 2 } },
    });

    await this.prisma.technicianProfile.update({
      where: { userId: technicianId },
      data: {
        avgRating: stats._avg.score || 0,
        totalRatings: stats._count.score,
        satisfiedClients: satisfiedCount,
        unsatisfiedClients: unsatisfiedCount,
      },
    });
  }
}
