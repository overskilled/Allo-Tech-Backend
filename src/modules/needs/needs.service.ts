import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNeedDto, UpdateNeedDto, AddNeedImageDto } from './dto/create-need.dto';
import { QueryNeedsDto, QueryClientNeedsDto } from './dto/query-needs.dto';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateSubCategoryDto,
  UpdateSubCategoryDto,
} from './dto/category.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import { NeedStatus } from '@prisma/client';

@Injectable()
export class NeedsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // CATEGORY OPERATIONS
  // ==========================================

  async createCategory(dto: CreateCategoryDto) {
    const existing = await this.prisma.needCategory.findFirst({
      where: { name: dto.name },
    });

    if (existing) {
      throw new BadRequestException('Category with this name already exists');
    }

    return this.prisma.needCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        imageUrl: dto.imageUrl,
        order: dto.order || 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateCategory(categoryId: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.needCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (dto.name && dto.name !== category.name) {
      const existing = await this.prisma.needCategory.findFirst({
        where: { name: dto.name, id: { not: categoryId } },
      });
      if (existing) {
        throw new BadRequestException('Category with this name already exists');
      }
    }

    return this.prisma.needCategory.update({
      where: { id: categoryId },
      data: dto,
    });
  }

  async deleteCategory(categoryId: string) {
    const category = await this.prisma.needCategory.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { needs: true, subCategories: true } } },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category._count.needs > 0 || category._count.subCategories > 0) {
      throw new BadRequestException(
        'Cannot delete category with existing needs or sub-categories',
      );
    }

    await this.prisma.needCategory.delete({
      where: { id: categoryId },
    });

    return { message: 'Category deleted successfully' };
  }

  async getAllCategories(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };

    return this.prisma.needCategory.findMany({
      where,
      include: {
        subCategories: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { needs: true },
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  async getCategoryById(categoryId: string) {
    const category = await this.prisma.needCategory.findUnique({
      where: { id: categoryId },
      include: {
        subCategories: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { needs: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  // ==========================================
  // SUB-CATEGORY OPERATIONS
  // ==========================================

  async createSubCategory(categoryId: string, dto: CreateSubCategoryDto) {
    const category = await this.prisma.needCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const existing = await this.prisma.needSubCategory.findFirst({
      where: { name: dto.name, categoryId },
    });

    if (existing) {
      throw new BadRequestException('Sub-category with this name already exists in this category');
    }

    return this.prisma.needSubCategory.create({
      data: {
        categoryId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        order: dto.order || 0,
      },
    });
  }

  async updateSubCategory(subCategoryId: string, dto: UpdateSubCategoryDto) {
    const subCategory = await this.prisma.needSubCategory.findUnique({
      where: { id: subCategoryId },
    });

    if (!subCategory) {
      throw new NotFoundException('Sub-category not found');
    }

    return this.prisma.needSubCategory.update({
      where: { id: subCategoryId },
      data: dto,
    });
  }

  async deleteSubCategory(subCategoryId: string) {
    const subCategory = await this.prisma.needSubCategory.findUnique({
      where: { id: subCategoryId },
      include: { _count: { select: { needs: true } } },
    });

    if (!subCategory) {
      throw new NotFoundException('Sub-category not found');
    }

    if (subCategory._count.needs > 0) {
      throw new BadRequestException('Cannot delete sub-category with existing needs');
    }

    await this.prisma.needSubCategory.delete({
      where: { id: subCategoryId },
    });

    return { message: 'Sub-category deleted successfully' };
  }

  // ==========================================
  // NEED CRUD OPERATIONS
  // ==========================================

  async createNeed(clientId: string, dto: CreateNeedDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: clientId },
      include: { clientProfile: true },
    });

    if (!user || user.role !== 'CLIENT') {
      throw new BadRequestException('Only clients can create needs');
    }

    const category = await this.prisma.needCategory.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || !category.isActive) {
      throw new BadRequestException('Invalid or inactive category');
    }

    if (dto.subCategoryId) {
      const subCategory = await this.prisma.needSubCategory.findUnique({
        where: { id: dto.subCategoryId },
      });
      if (!subCategory || subCategory.categoryId !== dto.categoryId) {
        throw new BadRequestException('Invalid sub-category');
      }
    }

    const need = await this.prisma.need.create({
      data: {
        clientId,
        categoryId: dto.categoryId,
        subCategoryId: dto.subCategoryId,
        title: dto.title,
        description: dto.description,
        urgency: dto.urgency || 'NORMAL',
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : null,
        preferredTimeSlot: dto.preferredTimeSlot,
        budgetMin: dto.budgetMin,
        budgetMax: dto.budgetMax,
        address: dto.address || user.clientProfile?.address,
        city: dto.city || user.clientProfile?.city,
        neighborhood: dto.neighborhood || user.clientProfile?.neighborhood,
        latitude: dto.latitude || user.clientProfile?.latitude,
        longitude: dto.longitude || user.clientProfile?.longitude,
        images: dto.images ? JSON.stringify(dto.images) : null,
        status: 'OPEN',
      },
      include: {
        category: true,
        subCategory: true,
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

    return this.formatNeed(need);
  }

  async updateNeed(needId: string, clientId: string, dto: UpdateNeedDto) {
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    if (need.clientId !== clientId) {
      throw new ForbiddenException('Not authorized to update this need');
    }

    if (need.status !== 'OPEN') {
      throw new BadRequestException('Can only update needs with OPEN status');
    }

    if (dto.categoryId) {
      const category = await this.prisma.needCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category || !category.isActive) {
        throw new BadRequestException('Invalid or inactive category');
      }
    }

    const updated = await this.prisma.need.update({
      where: { id: needId },
      data: {
        categoryId: dto.categoryId,
        subCategoryId: dto.subCategoryId,
        title: dto.title,
        description: dto.description,
        urgency: dto.urgency,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : undefined,
        preferredTimeSlot: dto.preferredTimeSlot,
        budgetMin: dto.budgetMin,
        budgetMax: dto.budgetMax,
        address: dto.address,
        city: dto.city,
        neighborhood: dto.neighborhood,
        latitude: dto.latitude,
        longitude: dto.longitude,
        images: dto.images ? JSON.stringify(dto.images) : undefined,
      },
      include: {
        category: true,
        subCategory: true,
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

    return this.formatNeed(updated);
  }

  async deleteNeed(needId: string, clientId: string) {
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
      include: { _count: { select: { candidatures: true } } },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    if (need.clientId !== clientId) {
      throw new ForbiddenException('Not authorized to delete this need');
    }

    if (need.status !== 'OPEN' && need.status !== 'CANCELLED') {
      throw new BadRequestException('Cannot delete need in current status');
    }

    if (need._count.candidatures > 0) {
      // Soft delete - just cancel the need
      await this.prisma.need.update({
        where: { id: needId },
        data: { status: 'CANCELLED' },
      });
      return { message: 'Need cancelled successfully' };
    }

    await this.prisma.need.delete({
      where: { id: needId },
    });

    return { message: 'Need deleted successfully' };
  }

  async getNeedById(needId: string) {
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
      include: {
        category: true,
        subCategory: true,
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            clientProfile: {
              select: {
                city: true,
                neighborhood: true,
              },
            },
          },
        },
        candidatures: {
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
                    totalJobs: true,
                    isVerified: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { candidatures: true },
        },
      },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    return this.formatNeed(need);
  }

  // ==========================================
  // CLIENT NEED OPERATIONS
  // ==========================================

  async getClientNeeds(clientId: string, query: QueryClientNeedsDto) {
    const where: any = { clientId };

    if (query.status) {
      where.status = query.status;
    }

    if (!query.includeArchived) {
      where.status = { not: 'CANCELLED' };
    }

    const [needs, total] = await Promise.all([
      this.prisma.need.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          subCategory: true,
          _count: {
            select: { candidatures: true },
          },
        },
      }),
      this.prisma.need.count({ where }),
    ]);

    return createPaginatedResult(
      needs.map((n) => this.formatNeed(n)),
      total,
      query,
    );
  }

  async cancelNeed(needId: string, clientId: string) {
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    if (need.clientId !== clientId) {
      throw new ForbiddenException('Not authorized to cancel this need');
    }

    if (need.status !== 'OPEN' && need.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Cannot cancel need in current status');
    }

    await this.prisma.need.update({
      where: { id: needId },
      data: { status: 'CANCELLED' },
    });

    // Cancel all pending candidatures
    await this.prisma.candidature.updateMany({
      where: { needId, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });

    return { message: 'Need cancelled successfully' };
  }

  async reopenNeed(needId: string, clientId: string) {
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    if (need.clientId !== clientId) {
      throw new ForbiddenException('Not authorized to reopen this need');
    }

    if (need.status !== 'CANCELLED') {
      throw new BadRequestException('Can only reopen cancelled needs');
    }

    await this.prisma.need.update({
      where: { id: needId },
      data: { status: 'OPEN' },
    });

    return { message: 'Need reopened successfully' };
  }

  // ==========================================
  // TECHNICIAN NEED OPERATIONS
  // ==========================================

  async getAvailableNeeds(technicianId: string, query: QueryNeedsDto) {
    const technician = await this.prisma.user.findUnique({
      where: { id: technicianId },
      include: { technicianProfile: true },
    });

    if (!technician || technician.role !== 'TECHNICIAN') {
      throw new BadRequestException('User is not a technician');
    }

    const where: any = {
      status: 'OPEN',
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.subCategoryId) {
      where.subCategoryId = query.subCategoryId;
    }

    if (query.urgency) {
      where.urgency = query.urgency;
    }

    if (query.city) {
      where.city = { contains: query.city };
    }

    if (query.neighborhood) {
      where.neighborhood = { contains: query.neighborhood };
    }

    if (query.budgetMin) {
      where.budgetMax = { gte: query.budgetMin };
    }

    if (query.budgetMax) {
      where.budgetMin = { lte: query.budgetMax };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search } },
        { description: { contains: query.search } },
      ];
    }

    // Filter out needs where technician already applied
    const appliedNeedIds = await this.prisma.candidature.findMany({
      where: { technicianId },
      select: { needId: true },
    });

    where.id = { notIn: appliedNeedIds.map((c) => c.needId) };

    const [needs, total] = await Promise.all([
      this.prisma.need.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: query.sortBy
          ? { [query.sortBy]: query.sortOrder || 'desc' }
          : { createdAt: 'desc' },
        include: {
          category: true,
          subCategory: true,
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
          _count: {
            select: { candidatures: true },
          },
        },
      }),
      this.prisma.need.count({ where }),
    ]);

    return createPaginatedResult(
      needs.map((n) => this.formatNeed(n)),
      total,
      query,
    );
  }

  async getNearbyNeeds(technicianId: string, query: QueryNeedsDto) {
    const technician = await this.prisma.user.findUnique({
      where: { id: technicianId },
      include: { technicianProfile: true },
    });

    if (!technician || !technician.technicianProfile) {
      throw new BadRequestException('Technician profile not found');
    }

    const lat = query.latitude || technician.technicianProfile.latitude;
    const lng = query.longitude || technician.technicianProfile.longitude;
    const radius = query.radius || technician.technicianProfile.serviceRadius || 10;

    if (!lat || !lng) {
      throw new BadRequestException('Location not available');
    }

    // Get all open needs and filter by distance
    const allNeeds = await this.prisma.need.findMany({
      where: {
        status: 'OPEN',
        latitude: { not: null },
        longitude: { not: null },
      },
      include: {
        category: true,
        subCategory: true,
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
          },
        },
        _count: {
          select: { candidatures: true },
        },
      },
    });

    // Filter by distance using Haversine formula
    const nearbyNeeds = allNeeds
      .map((need) => {
        const distance = this.calculateDistance(
          lat,
          lng,
          need.latitude!,
          need.longitude!,
        );
        return { ...need, distance };
      })
      .filter((need) => need.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    const paginated = nearbyNeeds.slice(query.skip, query.skip + query.take);

    return createPaginatedResult(
      paginated.map((n) => ({
        ...this.formatNeed(n),
        distance: Math.round(n.distance * 10) / 10,
      })),
      nearbyNeeds.length,
      query,
    );
  }

  // ==========================================
  // NEED IMAGE OPERATIONS
  // ==========================================

  async addNeedImage(needId: string, clientId: string, dto: AddNeedImageDto) {
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    if (need.clientId !== clientId) {
      throw new ForbiddenException('Not authorized to add images to this need');
    }

    const currentImages = need.images ? JSON.parse(need.images) : [];
    if (currentImages.length >= 5) {
      throw new BadRequestException('Maximum 5 images allowed per need');
    }

    currentImages.push(dto.imageUrl);

    await this.prisma.need.update({
      where: { id: needId },
      data: { images: JSON.stringify(currentImages) },
    });

    return { message: 'Image added successfully', images: currentImages };
  }

  async removeNeedImage(needId: string, clientId: string, imageUrl: string) {
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    if (need.clientId !== clientId) {
      throw new ForbiddenException('Not authorized to remove images from this need');
    }

    const currentImages = need.images ? JSON.parse(need.images) : [];
    const updatedImages = currentImages.filter((img: string) => img !== imageUrl);

    await this.prisma.need.update({
      where: { id: needId },
      data: { images: JSON.stringify(updatedImages) },
    });

    return { message: 'Image removed successfully', images: updatedImages };
  }

  // ==========================================
  // STATUS UPDATES
  // ==========================================

  async updateNeedStatus(needId: string, status: NeedStatus, userId: string) {
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
    });

    if (!need) {
      throw new NotFoundException('Need not found');
    }

    // Validate status transitions
    const validTransitions: Record<NeedStatus, NeedStatus[]> = {
      OPEN: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: ['OPEN'],
    };

    if (!validTransitions[need.status].includes(status)) {
      throw new BadRequestException(`Cannot transition from ${need.status} to ${status}`);
    }

    await this.prisma.need.update({
      where: { id: needId },
      data: { status },
    });

    return { message: `Need status updated to ${status}` };
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private formatNeed(need: any) {
    return {
      ...need,
      images: need.images ? JSON.parse(need.images) : [],
    };
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
