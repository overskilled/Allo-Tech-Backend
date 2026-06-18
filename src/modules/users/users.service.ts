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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalNeeds,
      activeNeeds,
      completedNeeds,
      totalAppointments,
      upcomingAppointments,
      totalSpentAgg,
      favoriteCount,
      totalReviews,
      avgRatingAgg,
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
        where: {
          clientId: userId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          scheduledDate: { gte: today },
        },
      }),
      this.prisma.payment.aggregate({
        where: { clientId: userId, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      this.prisma.favorite.count({ where: { clientId: userId } }),
      this.prisma.rating.count({ where: { clientId: userId } }),
      this.prisma.rating.aggregate({
        where: { clientId: userId },
        _avg: { score: true },
      }),
    ]);

    const totalSpent = Number(totalSpentAgg._sum.amount || 0);

    return {
      totalNeeds,
      activeNeeds,
      completedNeeds,
      totalAppointments,
      upcomingAppointments,
      totalSpent,
      averageSpent: totalAppointments > 0 ? Math.round(totalSpent / totalAppointments) : 0,
      totalReviews,
      averageRating: avgRatingAgg._avg.score || 0,
      favoriteCount,
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
        latitude: dto.latitude,
        longitude: dto.longitude,
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

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      pendingCandidatures,
      acceptedCandidatures,
      completedAppointments,
      totalClientsAgg,
      totalEarningsAgg,
      monthlyEarningsAgg,
      totalRatings,
      avgRatingAgg,
      quotationsSent,
      quotationsAccepted,
    ] = await Promise.all([
      this.prisma.candidature.count({
        where: { technicianId: userId, status: 'PENDING' },
      }),
      this.prisma.candidature.count({
        where: { technicianId: userId, status: 'ACCEPTED' },
      }),
      this.prisma.appointment.count({
        where: { technicianId: userId, status: 'COMPLETED' },
      }),
      this.prisma.appointment.groupBy({
        by: ['clientId'],
        where: { technicianId: userId },
      }),
      this.prisma.payment.aggregate({
        where: { technicianId: userId, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          technicianId: userId,
          status: 'COMPLETED',
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.rating.count({ where: { technicianId: userId } }),
      this.prisma.rating.aggregate({
        where: { technicianId: userId },
        _avg: { score: true },
      }),
      this.prisma.quotation.count({
        where: { technicianId: userId, status: { in: ['SENT', 'ACCEPTED', 'REJECTED'] } },
      }),
      this.prisma.quotation.count({
        where: { technicianId: userId, status: 'ACCEPTED' },
      }),
    ]);

    return {
      completedAppointments,
      totalClients: totalClientsAgg.length,
      totalRatings,
      averageRating: avgRatingAgg._avg.score || 0,
      totalEarnings: Number(totalEarningsAgg._sum.amount || 0),
      monthlyEarnings: Number(monthlyEarningsAgg._sum.amount || 0),
      pendingCandidatures,
      acceptedCandidatures,
      quotationsSent,
      quotationsAccepted,
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

  /**
   * Builds a ~radiusKm bounding box around a latitude/longitude centre for
   * "near me" technician filtering. Returns null when no valid centre is given.
   * A box (not a true circle) keeps this working on plain Postgres without
   * PostGIS — close enough for a discovery map. Default radius is 10km.
   */
  private computeGeoBox(query: QueryTechniciansDto): {
    latMin: number;
    latMax: number;
    lngMin: number;
    lngMax: number;
  } | null {
    if (
      typeof query.latitude !== 'number' ||
      Number.isNaN(query.latitude) ||
      typeof query.longitude !== 'number' ||
      Number.isNaN(query.longitude)
    ) {
      return null;
    }
    const radiusKm = query.radiusKm && query.radiusKm > 0 ? query.radiusKm : 10;
    const latDelta = radiusKm / 111; // ~111km per degree of latitude
    const cosLat = Math.cos((query.latitude * Math.PI) / 180);
    const lngDelta =
      radiusKm / (111 * (Math.abs(cosLat) < 0.01 ? 0.01 : Math.abs(cosLat)));
    return {
      latMin: query.latitude - latDelta,
      latMax: query.latitude + latDelta,
      lngMin: query.longitude - lngDelta,
      lngMax: query.longitude + lngDelta,
    };
  }

  async findAllTechnicians(query: QueryTechniciansDto) {
    const where: any = {
      user: {
        role: 'TECHNICIAN',
        status: { not: 'SUSPENDED' },
      },
    };

    // "Near me": when a centre is provided, only return technicians whose
    // location falls within ~radiusKm (default 10km) of the client. Without
    // this, the list ranked by rating returns technicians from other cities.
    const geoBox = this.computeGeoBox(query);
    if (geoBox) {
      where.latitude = { gte: geoBox.latMin, lte: geoBox.latMax };
      where.longitude = { gte: geoBox.lngMin, lte: geoBox.lngMax };
    }

    if (query.city) {
      where.city = { contains: query.city };
    }

    // Clients only ever see verified technicians — unverified profiles are
    // never listed, regardless of any client-supplied filter.
    where.isVerified = true;

    if (query.isAvailable !== undefined) {
      where.isAvailable = query.isAvailable;
    }

    if (query.minRating) {
      where.avgRating = { gte: query.minRating };
    }

    if (query.specialty) {
      where.specialties = { contains: query.specialty };
    }

    // Category filter: technicians have no category FK, so match the category
    // name against profession/specialties. ANDed with any text search.
    if (query.category) {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { profession: { contains: query.category, mode: 'insensitive' } },
            { specialties: { contains: query.category, mode: 'insensitive' } },
          ],
        },
      ];
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

  /**
   * Public technician directory powering the client discovery map/list.
   * Lists ONLY registered technicians whose profile is verified
   * (TechnicianProfile.isVerified = true), sorted by rating DESC. Agent-onboarded
   * leads (TechnicianOnboarding) are intentionally excluded — they carry no
   * verification, so clients never see unverified technicians.
   */
  async findTechnicianDirectory(query: QueryTechniciansDto) {
    const { skip, take } = query;
    const search = query.search?.trim();
    const city = query.city?.trim();

    // ── 0. "Near me" bounding box ──────────────────────────────────────────
    // When the caller passes a centre (latitude/longitude), restrict results to
    // a bounding box of ~radiusKm (default 10km) around it.
    const geoBox = this.computeGeoBox(query);

    // ── 1. Build WHERE for registered technicians ──────────────────────────
    const regWhere: any = {
      user: { role: 'TECHNICIAN', status: { not: 'SUSPENDED' } },
    };
    if (geoBox) {
      regWhere.latitude = { gte: geoBox.latMin, lte: geoBox.latMax };
      regWhere.longitude = { gte: geoBox.lngMin, lte: geoBox.lngMax };
    }
    if (city) regWhere.city = { contains: city, mode: 'insensitive' };
    // Verified technicians only — never expose unverified profiles to clients.
    regWhere.isVerified = true;
    if (query.isAvailable !== undefined) regWhere.isAvailable = query.isAvailable;
    if (query.minRating) regWhere.avgRating = { gte: query.minRating };
    if (query.specialty) regWhere.specialties = { contains: query.specialty };
    if (query.category) {
      regWhere.AND = [
        ...(regWhere.AND ?? []),
        {
          OR: [
            { profession: { contains: query.category, mode: 'insensitive' } },
            { specialties: { contains: query.category, mode: 'insensitive' } },
          ],
        },
      ];
    }
    if (search) {
      regWhere.OR = [
        { profession: { contains: search, mode: 'insensitive' } },
        { specialties: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // ── 2. Count + fetch verified registered technicians ───────────────────
    const total = await this.prisma.technicianProfile.count({ where: regWhere });

    const registered = await this.prisma.technicianProfile.findMany({
      where: regWhere,
      skip,
      take,
      orderBy: { avgRating: 'desc' },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, profileImage: true,
          },
        },
      },
    });

    // ── 3. Map to public shape ─────────────────────────────────────────────
    // NOTE: technician phone is intentionally omitted from this public-facing
    // listing to protect technician contact details from anonymous clients.
    const data = registered.map((t) => ({
      id: t.user.id,
      firstName: t.user.firstName,
      lastName: t.user.lastName,
      profileImage: t.user.profileImage ?? null,
      profession: t.profession,
      specialties: this.parseJsonField(t.specialties),
      city: t.city,
      neighborhood: t.neighborhood,
      address: t.address,
      latitude: t.latitude,
      longitude: t.longitude,
      isAvailable: t.isAvailable,
      isVerified: t.isVerified,
      rating: t.avgRating,
      totalRatings: t.totalRatings,
      completedJobs: t.completedJobs,
      yearsExperience: t.yearsExperience,
      registered: true,
    }));

    return {
      data,
      total,
      page: query.page || 1,
      limit: take,
      totalPages: Math.ceil(total / take),
      hasNextPage: (query.page || 1) < Math.ceil(total / take),
      hasPreviousPage: (query.page || 1) > 1,
    };
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

    // Strip the technician's phone from any public/client-facing payload.
    // The owner can still read their own phone from GET /users/me (top-level
    // User.phone), which never goes through this formatter.
    const { user, ...rest } = profile;
    const sanitizedUser = user ? (() => {
      const { phone: _phone, ...safeUser } = user;
      return safeUser;
    })() : undefined;

    return {
      ...rest,
      ...(sanitizedUser ? { user: sanitizedUser } : {}),
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
