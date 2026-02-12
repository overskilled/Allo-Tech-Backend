import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UpdateUserDto,
  UpdateLocationDto,
  UpdateClientProfileDto,
  UpdateTechnicianProfileDto,
} from './dto/update-user.dto';
import { QueryUsersDto, QueryTechniciansDto } from './dto/query-users.dto';
import { PaginationDto, createPaginatedResult } from '../../common/dto/pagination.dto';
import { UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // USER PROFILE OPERATIONS
  // ==========================================

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        clientProfile: true,
        technicianProfile: true,
        license: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        clientProfile: true,
        technicianProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
      include: {
        clientProfile: true,
        technicianProfile: true,
      },
    });

    return this.sanitizeUser(updated);
  }

  async updateProfileImage(userId: string, imageUrl: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { profileImage: imageUrl },
    });

    return this.sanitizeUser(user);
  }

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        clientProfile: true,
        technicianProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'CLIENT' && user.clientProfile) {
      await this.prisma.clientProfile.update({
        where: { userId },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          address: dto.address,
          neighborhood: dto.neighborhood,
          city: dto.city,
        },
      });
    } else if (user.role === 'TECHNICIAN' && user.technicianProfile) {
      await this.prisma.technicianProfile.update({
        where: { userId },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          address: dto.address,
          neighborhood: dto.neighborhood,
          city: dto.city,
        },
      });
    }

    return this.findById(userId);
  }

  // ==========================================
  // CLIENT PROFILE OPERATIONS
  // ==========================================

  async updateClientProfile(userId: string, dto: UpdateClientProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { clientProfile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== 'CLIENT') {
      throw new BadRequestException('User is not a client');
    }

    if (!user.clientProfile) {
      throw new BadRequestException('Client profile not found');
    }

    const profile = await this.prisma.clientProfile.update({
      where: { userId },
      data: {
        neighborhood: dto.neighborhood,
        city: dto.city,
        address: dto.address,
        preferredLanguage: dto.preferredLanguage,
        notificationsEnabled: dto.notificationsEnabled,
      },
    });

    return profile;
  }

  async getFavorites(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { clientId: userId },
      include: {
        technician: {
          include: {
            technicianProfile: true,
          },
        },
      },
    });

    return favorites.map((f) => ({
      id: f.id,
      technician: {
        id: f.technician.id,
        firstName: f.technician.firstName,
        lastName: f.technician.lastName,
        profileImage: f.technician.profileImage,
        profile: this.formatTechnicianProfile(f.technician.technicianProfile),
      },
      addedAt: f.createdAt,
    }));
  }

  async addFavorite(userId: string, technicianUserId: string) {
    const technician = await this.prisma.user.findUnique({
      where: { id: technicianUserId },
    });

    if (!technician || technician.role !== 'TECHNICIAN') {
      throw new BadRequestException('Invalid technician');
    }

    const existing = await this.prisma.favorite.findUnique({
      where: {
        clientId_technicianId: {
          clientId: userId,
          technicianId: technicianUserId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Already in favorites');
    }

    await this.prisma.favorite.create({
      data: {
        clientId: userId,
        technicianId: technicianUserId,
      },
    });

    return { message: 'Favorite added successfully' };
  }

  async removeFavorite(userId: string, technicianUserId: string) {
    await this.prisma.favorite.deleteMany({
      where: {
        clientId: userId,
        technicianId: technicianUserId,
      },
    });

    return { message: 'Favorite removed successfully' };
  }

  async getClientStatistics(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { clientProfile: true },
    });

    if (!user || user.role !== 'CLIENT') {
      throw new BadRequestException('User is not a client');
    }

    const [
      totalNeeds,
      activeNeeds,
      completedNeeds,
      totalAppointments,
      completedAppointments,
      totalSpent,
      favoritesCount,
      ratingsGiven,
    ] = await Promise.all([
      this.prisma.need.count({ where: { clientId: userId } }),
      this.prisma.need.count({
        where: { clientId: userId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      this.prisma.need.count({
        where: { clientId: userId, status: 'COMPLETED' },
      }),
      this.prisma.appointment.count({ where: { clientId: userId } }),
      this.prisma.appointment.count({
        where: { clientId: userId, status: 'COMPLETED' },
      }),
      this.prisma.payment.aggregate({
        where: { clientId: userId, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      this.prisma.favorite.count({ where: { clientId: userId } }),
      this.prisma.rating.count({ where: { clientId: userId } }),
    ]);

    return {
      needs: {
        total: totalNeeds,
        active: activeNeeds,
        completed: completedNeeds,
      },
      appointments: {
        total: totalAppointments,
        completed: completedAppointments,
      },
      totalSpent: totalSpent._sum.amount || 0,
      favoritesCount,
      ratingsGiven,
      memberSince: user.createdAt,
    };
  }

  // ==========================================
  // TECHNICIAN PROFILE OPERATIONS
  // ==========================================

  async updateTechnicianProfile(userId: string, dto: UpdateTechnicianProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { technicianProfile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== 'TECHNICIAN') {
      throw new BadRequestException('User is not a technician');
    }

    if (!user.technicianProfile) {
      throw new BadRequestException('Technician profile not found');
    }

    const profile = await this.prisma.technicianProfile.update({
      where: { userId },
      data: {
        profession: dto.profession,
        specialties: dto.specialties ? JSON.stringify(dto.specialties) : undefined,
        studies: dto.studies,
        certifications: dto.certifications ? JSON.stringify(dto.certifications) : undefined,
        yearsExperience: dto.yearsExperience,
        bio: dto.bio,
        neighborhood: dto.neighborhood,
        city: dto.city,
        address: dto.address,
        serviceRadius: dto.serviceRadius,
        isAvailable: dto.isAvailable,
        availableFrom: dto.availableFrom,
        availableTo: dto.availableTo,
        workDays: dto.workDays ? JSON.stringify(dto.workDays) : undefined,
      },
    });

    return this.formatTechnicianProfile(profile);
  }

  async getTechnicianProfile(userId: string) {
    const profile = await this.prisma.technicianProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            profileImage: true,
            createdAt: true,
            realizations: {
              take: 6,
              orderBy: { createdAt: 'desc' },
            },
            ratingsReceived: {
              take: 10,
              orderBy: { createdAt: 'desc' },
              include: {
                client: {
                  select: {
                    firstName: true,
                    lastName: true,
                    profileImage: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Technician profile not found');
    }

    return this.formatTechnicianProfile(profile);
  }

  async getTechnicianStatistics(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { technicianProfile: true },
    });

    if (!user || user.role !== 'TECHNICIAN') {
      throw new BadRequestException('User is not a technician');
    }

    const [
      totalCandidatures,
      acceptedCandidatures,
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      totalEarnings,
      ratingsCount,
      avgRating,
      realizationsCount,
    ] = await Promise.all([
      this.prisma.candidature.count({ where: { technicianId: userId } }),
      this.prisma.candidature.count({
        where: { technicianId: userId, status: 'ACCEPTED' },
      }),
      this.prisma.appointment.count({ where: { technicianId: userId } }),
      this.prisma.appointment.count({
        where: { technicianId: userId, status: 'COMPLETED' },
      }),
      this.prisma.appointment.count({
        where: { technicianId: userId, status: 'CANCELLED' },
      }),
      this.prisma.payment.aggregate({
        where: { technicianId: userId, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      this.prisma.rating.count({ where: { technicianId: userId } }),
      this.prisma.rating.aggregate({
        where: { technicianId: userId },
        _avg: { score: true },
      }),
      this.prisma.realization.count({ where: { technicianId: userId } }),
    ]);

    const completionRate =
      totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0;

    const acceptanceRate =
      totalCandidatures > 0 ? Math.round((acceptedCandidatures / totalCandidatures) * 100) : 0;

    return {
      candidatures: {
        total: totalCandidatures,
        accepted: acceptedCandidatures,
        acceptanceRate,
      },
      appointments: {
        total: totalAppointments,
        completed: completedAppointments,
        cancelled: cancelledAppointments,
        completionRate,
      },
      earnings: {
        total: totalEarnings._sum.amount || 0,
      },
      ratings: {
        count: ratingsCount,
        average: avgRating._avg.score || 0,
      },
      realizationsCount,
      isVerified: user.technicianProfile?.isVerified || false,
      memberSince: user.createdAt,
    };
  }

  async getRecommendedTechnicians(userId: string, limit = 10) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { clientProfile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const where: any = {
      user: {
        role: 'TECHNICIAN',
        status: 'ACTIVE',
      },
      isVerified: true,
      isAvailable: true,
    };

    if (user.clientProfile?.city) {
      where.city = { contains: user.clientProfile.city };
    }

    const technicians = await this.prisma.technicianProfile.findMany({
      where,
      take: limit,
      orderBy: [{ avgRating: 'desc' }, { totalJobs: 'desc' }],
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
          },
        },
      },
    });

    return technicians.map((t) => this.formatTechnicianProfile(t));
  }

  async addRealization(
    userId: string,
    data: { title: string; description?: string; imageUrl: string }
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { technicianProfile: true },
    });

    if (!user || user.role !== 'TECHNICIAN') {
      throw new BadRequestException('User is not a technician');
    }

    const realization = await this.prisma.realization.create({
      data: {
        technicianId: userId,
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl,
      },
    });

    return realization;
  }

  async deleteRealization(userId: string, realizationId: string) {
    const realization = await this.prisma.realization.findUnique({
      where: { id: realizationId },
    });

    if (!realization || realization.technicianId !== userId) {
      throw new ForbiddenException('Not authorized to delete this realization');
    }

    await this.prisma.realization.delete({
      where: { id: realizationId },
    });

    return { message: 'Realization deleted successfully' };
  }

  async getRealizations(userId: string) {
    const realizations = await this.prisma.realization.findMany({
      where: { technicianId: userId },
      orderBy: { createdAt: 'desc' },
    });

    return realizations;
  }

  // ==========================================
  // SEARCH & LIST OPERATIONS
  // ==========================================

  async findAllUsers(query: QueryUsersDto) {
    const where: any = {};

    if (query.role) {
      where.role = query.role;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.emailVerified !== undefined) {
      where.emailVerified = query.emailVerified;
    }

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
        { email: { contains: query.search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: query.sortBy ? { [query.sortBy]: query.sortOrder } : { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          profileImage: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return createPaginatedResult(users, total, query);
  }

  async findAllTechnicians(query: QueryTechniciansDto) {
    const where: any = {
      user: {
        role: 'TECHNICIAN',
        status: { not: 'SUSPENDED' },
      },
    };

    if (query.city) {
      where.city = { contains: query.city };
    }

    if (query.isVerified !== undefined) {
      where.isVerified = query.isVerified;
    }

    if (query.isAvailable !== undefined) {
      where.isAvailable = query.isAvailable;
    }

    if (query.minRating) {
      where.avgRating = { gte: query.minRating };
    }

    if (query.specialty) {
      where.specialties = { contains: query.specialty };
    }

    if (query.search) {
      where.OR = [
        { profession: { contains: query.search } },
        { specialties: { contains: query.search } },
        { user: { firstName: { contains: query.search } } },
        { user: { lastName: { contains: query.search } } },
      ];
    }

    const [technicians, total] = await Promise.all([
      this.prisma.technicianProfile.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: query.sortBy ? { [query.sortBy]: query.sortOrder } : { avgRating: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
        },
      }),
      this.prisma.technicianProfile.count({ where }),
    ]);

    return createPaginatedResult(
      technicians.map((t) => this.formatTechnicianProfile(t)),
      total,
      query
    );
  }

  // ==========================================
  // ADMIN OPERATIONS
  // ==========================================

  async updateUserStatus(userId: string, status: UserStatus) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    return this.sanitizeUser(user);
  }

  async verifyTechnician(technicianUserId: string) {
    const profile = await this.prisma.technicianProfile.update({
      where: { userId: technicianUserId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    return profile;
  }

  async deactivateAccount(userId: string, currentUserId: string) {
    if (userId !== currentUserId) {
      // Check if current user is admin
      const currentUser = await this.prisma.user.findUnique({
        where: { id: currentUserId },
      });

      if (currentUser?.role !== 'ADMIN') {
        throw new ForbiddenException('Not authorized to deactivate this account');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.INACTIVE },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Account deactivated successfully' };
  }

  async deleteAccount(userId: string, currentUserId: string) {
    if (userId !== currentUserId) {
      const currentUser = await this.prisma.user.findUnique({
        where: { id: currentUserId },
      });

      if (currentUser?.role !== 'ADMIN') {
        throw new ForbiddenException('Not authorized to delete this account');
      }
    }

    // Soft delete - just mark as inactive and anonymize
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.INACTIVE,
        email: `deleted_${userId}@allotech.local`,
        firstName: 'Deleted',
        lastName: 'User',
        phone: null,
        profileImage: null,
      },
    });

    return { message: 'Account deleted successfully' };
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private sanitizeUser(user: any) {
    const {
      passwordHash,
      emailVerifyToken,
      emailVerifyExpires,
      passwordResetToken,
      passwordResetExpires,
      ...sanitized
    } = user;

    // Parse JSON fields in profiles
    if (sanitized.technicianProfile) {
      sanitized.technicianProfile = this.formatTechnicianProfile(sanitized.technicianProfile);
    }

    return sanitized;
  }

  private formatTechnicianProfile(profile: any) {
    if (!profile) return null;

    return {
      ...profile,
      specialties: this.parseJsonField(profile.specialties),
      certifications: this.parseJsonField(profile.certifications),
      workDays: this.parseJsonField(profile.workDays),
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
