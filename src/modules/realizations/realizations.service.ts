import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateRealizationDto,
  UpdateRealizationDto,
  AddImagesDto,
  QueryRealizationsDto,
} from './dto/realization.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class RealizationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // TECHNICIAN OPERATIONS
  // ==========================================

  async create(technicianId: string, dto: CreateRealizationDto) {
    // Verify user is a technician
    const user = await this.prisma.user.findUnique({
      where: { id: technicianId },
    });

    if (!user || user.role !== 'TECHNICIAN') {
      throw new ForbiddenException('Only technicians can create realizations');
    }

    return this.prisma.realization.create({
      data: {
        technicianId,
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        category: dto.category,
        beforeImages: dto.beforeImages ? JSON.stringify(dto.beforeImages) : null,
        afterImages: dto.afterImages ? JSON.stringify(dto.afterImages) : null,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
        isPublic: dto.isPublic ?? true,
      },
    });
  }

  async update(realizationId: string, technicianId: string, dto: UpdateRealizationDto) {
    const realization = await this.prisma.realization.findUnique({
      where: { id: realizationId },
    });

    if (!realization) {
      throw new NotFoundException('Realization not found');
    }

    if (realization.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized to update this realization');
    }

    const updateData: any = {};

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.completedAt !== undefined) {
      updateData.completedAt = dto.completedAt ? new Date(dto.completedAt) : null;
    }
    if (dto.isPublic !== undefined) updateData.isPublic = dto.isPublic;
    if (dto.beforeImages !== undefined) {
      updateData.beforeImages = JSON.stringify(dto.beforeImages);
    }
    if (dto.afterImages !== undefined) {
      updateData.afterImages = JSON.stringify(dto.afterImages);
    }

    return this.prisma.realization.update({
      where: { id: realizationId },
      data: updateData,
    });
  }

  async delete(realizationId: string, technicianId: string) {
    const realization = await this.prisma.realization.findUnique({
      where: { id: realizationId },
    });

    if (!realization) {
      throw new NotFoundException('Realization not found');
    }

    if (realization.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized to delete this realization');
    }

    await this.prisma.realization.delete({
      where: { id: realizationId },
    });

    return { message: 'Realization deleted successfully' };
  }

  async addImages(realizationId: string, technicianId: string, dto: AddImagesDto) {
    const realization = await this.prisma.realization.findUnique({
      where: { id: realizationId },
    });

    if (!realization) {
      throw new NotFoundException('Realization not found');
    }

    if (realization.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized to update this realization');
    }

    if (!dto.beforeImages?.length && !dto.afterImages?.length) {
      throw new BadRequestException('At least one image must be provided');
    }

    const updateData: any = {};

    if (dto.beforeImages?.length) {
      const existingBefore = realization.beforeImages
        ? JSON.parse(realization.beforeImages)
        : [];
      updateData.beforeImages = JSON.stringify([...existingBefore, ...dto.beforeImages]);
    }

    if (dto.afterImages?.length) {
      const existingAfter = realization.afterImages
        ? JSON.parse(realization.afterImages)
        : [];
      updateData.afterImages = JSON.stringify([...existingAfter, ...dto.afterImages]);
    }

    return this.prisma.realization.update({
      where: { id: realizationId },
      data: updateData,
    });
  }

  async removeImage(
    realizationId: string,
    technicianId: string,
    imageUrl: string,
    type: 'before' | 'after',
  ) {
    const realization = await this.prisma.realization.findUnique({
      where: { id: realizationId },
    });

    if (!realization) {
      throw new NotFoundException('Realization not found');
    }

    if (realization.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized to update this realization');
    }

    const field = type === 'before' ? 'beforeImages' : 'afterImages';
    const existingImages = realization[field] ? JSON.parse(realization[field]) : [];
    const updatedImages = existingImages.filter((url: string) => url !== imageUrl);

    return this.prisma.realization.update({
      where: { id: realizationId },
      data: {
        [field]: JSON.stringify(updatedImages),
      },
    });
  }

  async getMyRealizations(technicianId: string, query: QueryRealizationsDto) {
    const where: any = { technicianId };

    if (query.category) {
      where.category = query.category;
    }

    if (query.isPublic !== undefined) {
      where.isPublic = query.isPublic;
    }

    const [realizations, total] = await Promise.all([
      this.prisma.realization.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.realization.count({ where }),
    ]);

    // Parse JSON fields
    const parsed = realizations.map(this.parseRealization);

    return createPaginatedResult(parsed, total, query);
  }

  // ==========================================
  // PUBLIC OPERATIONS
  // ==========================================

  async getTechnicianRealizations(technicianId: string, query: QueryRealizationsDto) {
    const where: any = {
      technicianId,
      isPublic: true, // Only public realizations
    };

    if (query.category) {
      where.category = query.category;
    }

    const [realizations, total] = await Promise.all([
      this.prisma.realization.findMany({
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
      this.prisma.realization.count({ where }),
    ]);

    const parsed = realizations.map(this.parseRealization);

    return createPaginatedResult(parsed, total, query);
  }

  async getById(realizationId: string, requesterId?: string) {
    const realization = await this.prisma.realization.findUnique({
      where: { id: realizationId },
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
                avgRating: true,
                totalRatings: true,
              },
            },
          },
        },
      },
    });

    if (!realization) {
      throw new NotFoundException('Realization not found');
    }

    // If not public, only owner can view
    if (!realization.isPublic && realization.technicianId !== requesterId) {
      throw new ForbiddenException('This realization is private');
    }

    return this.parseRealization(realization);
  }

  async getCategories(technicianId?: string) {
    const where: any = { isPublic: true };
    if (technicianId) {
      where.technicianId = technicianId;
    }

    const categories = await this.prisma.realization.groupBy({
      by: ['category'],
      where: {
        ...where,
        category: { not: null },
      },
      _count: { category: true },
    });

    return categories
      .filter((c) => c.category)
      .map((c) => ({
        name: c.category,
        count: c._count.category,
      }));
  }

  async getRecentRealizations(limit = 10) {
    const realizations = await this.prisma.realization.findMany({
      where: { isPublic: true },
      take: limit,
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
    });

    return realizations.map(this.parseRealization);
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private parseRealization(realization: any) {
    return {
      ...realization,
      beforeImages: realization.beforeImages
        ? JSON.parse(realization.beforeImages)
        : [],
      afterImages: realization.afterImages
        ? JSON.parse(realization.afterImages)
        : [],
    };
  }
}
