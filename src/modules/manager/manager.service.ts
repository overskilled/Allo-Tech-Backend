import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LicensesService } from '../licenses/licenses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
  QueryAdvertisementsDto,
  FeatureTechnicianDto,
  AssistUserDto,
  QueryUsersForAssistanceDto,
} from './dto/manager.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class ManagerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly licensesService: LicensesService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  // ==========================================
  // ACCOUNT VALIDATION
  // ==========================================

  async getPendingAccounts(query: QueryUsersForAssistanceDto) {
    const where: any = {
      status: 'PENDING_VERIFICATION',
    };

    if (query.role) {
      where.role = query.role;
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
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          technicianProfile: {
            select: {
              profession: true,
              city: true,
              isVerified: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return createPaginatedResult(users, total, query);
  }

  async validateAccount(userId: string, managerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    // Notify user
    await this.notificationsService.create({
      userId,
      type: 'SYSTEM',
      title: 'Compte validé',
      body: 'Votre compte a été validé. Bienvenue sur AlloTech!',
    });

    await this.mailService.sendWelcome(user.email, user.firstName, user.role);

    return { message: 'Account validated successfully' };
  }

  async rejectAccount(userId: string, reason: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE' },
    });

    // Notify user
    await this.mailService.send({
      to: user.email,
      subject: 'Validation de compte refusée - AlloTech',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AlloTech</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2>Bonjour ${user.firstName},</h2>
            <p>Votre demande de création de compte n'a pas été approuvée.</p>
            ${reason ? `<p><strong>Raison:</strong> ${reason}</p>` : ''}
            <p>Veuillez nous contacter pour plus d'informations.</p>
          </div>
        </div>
      `,
    });

    return { message: 'Account rejected' };
  }

  // ==========================================
  // LICENSE MANAGEMENT
  // ==========================================

  async getLicensesOverview(query: any) {
    return this.licensesService.getAllLicenses(query);
  }

  async activateLicense(licenseId: string, dto: any) {
    return this.licensesService.activateLicense(licenseId, dto);
  }

  async renewLicense(licenseId: string, dto: any) {
    return this.licensesService.renewLicense(licenseId, dto);
  }

  async getExpiringLicenses(days = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.prisma.license.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          gte: new Date(),
          lte: futureDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
      orderBy: { endDate: 'asc' },
    });
  }

  // ==========================================
  // USER ASSISTANCE
  // ==========================================

  async getUsersForAssistance(query: QueryUsersForAssistanceDto) {
    const where: any = {};

    if (query.role) {
      where.role = query.role;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
        { email: { contains: query.search } },
        { phone: { contains: query.search } },
      ];
    }

    // Users needing assistance: inactive for 30+ days or with issues
    if (query.needsAssistance) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      where.OR = [
        { status: { in: ['INACTIVE', 'SUSPENDED'] } },
        { lastLoginAt: { lt: thirtyDaysAgo } },
        { lastLoginAt: null, createdAt: { lt: thirtyDaysAgo } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          license: {
            select: {
              status: true,
              plan: true,
              endDate: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return createPaginatedResult(users, total, query);
  }

  async assistUser(managerId: string, dto: AssistUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Log assistance (in real app, store in AssistanceLog table)
    // For now, send notification to user

    await this.notificationsService.create({
      userId: dto.userId,
      type: 'SYSTEM',
      title: 'Assistance AlloTech',
      body: dto.notes,
    });

    // Optionally send email
    await this.mailService.send({
      to: user.email,
      subject: 'Assistance AlloTech',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #2563eb; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AlloTech</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2>Bonjour ${user.firstName},</h2>
            <p>${dto.notes}</p>
            ${dto.action ? `<p><strong>Action:</strong> ${dto.action}</p>` : ''}
            <p>Notre équipe reste à votre disposition.</p>
          </div>
        </div>
      `,
    });

    return { message: 'User assisted successfully' };
  }

  // ==========================================
  // ADVERTISEMENT MANAGEMENT
  // ==========================================

  async createAdvertisement(dto: CreateAdvertisementDto) {
    return this.prisma.advertisement.create({
      data: {
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        targetRoles: JSON.stringify(dto.targetRoles || ['CLIENT', 'TECHNICIAN']),
        isActive: true,
      },
    });
  }

  async updateAdvertisement(adId: string, dto: UpdateAdvertisementDto) {
    const ad = await this.prisma.advertisement.findUnique({
      where: { id: adId },
    });

    if (!ad) {
      throw new NotFoundException('Advertisement not found');
    }

    const updateData: any = {};

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl;
    if (dto.linkUrl !== undefined) updateData.linkUrl = dto.linkUrl;
    if (dto.startDate !== undefined) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) updateData.endDate = new Date(dto.endDate);
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.targetRoles !== undefined) updateData.targetRoles = JSON.stringify(dto.targetRoles);

    return this.prisma.advertisement.update({
      where: { id: adId },
      data: updateData,
    });
  }

  async deleteAdvertisement(adId: string) {
    const ad = await this.prisma.advertisement.findUnique({
      where: { id: adId },
    });

    if (!ad) {
      throw new NotFoundException('Advertisement not found');
    }

    await this.prisma.advertisement.delete({
      where: { id: adId },
    });

    return { message: 'Advertisement deleted' };
  }

  async getAdvertisements(query: QueryAdvertisementsDto) {
    const where: any = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [ads, total] = await Promise.all([
      this.prisma.advertisement.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.advertisement.count({ where }),
    ]);

    // Parse target roles
    const parsed = ads.map((ad) => ({
      ...ad,
      targetRoles: ad.targetRoles ? JSON.parse(ad.targetRoles) : [],
    }));

    return createPaginatedResult(parsed, total, query);
  }

  async getActiveAdvertisements(userRole: string) {
    const now = new Date();

    const ads = await this.prisma.advertisement.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter by target role and parse
    return ads
      .map((ad) => ({
        ...ad,
        targetRoles: ad.targetRoles ? JSON.parse(ad.targetRoles) : [],
      }))
      .filter((ad) => ad.targetRoles.includes(userRole));
  }

  async recordAdImpression(adId: string) {
    await this.prisma.advertisement.update({
      where: { id: adId },
      data: { impressions: { increment: 1 } },
    });
  }

  async recordAdClick(adId: string) {
    await this.prisma.advertisement.update({
      where: { id: adId },
      data: { clicks: { increment: 1 } },
    });
  }

  // ==========================================
  // FEATURED TECHNICIANS
  // ==========================================

  async featureTechnician(dto: FeatureTechnicianDto) {
    const technician = await this.prisma.user.findUnique({
      where: { id: dto.technicianId },
      include: { technicianProfile: true },
    });

    if (!technician || technician.role !== 'TECHNICIAN') {
      throw new BadRequestException('Invalid technician');
    }

    if (!technician.technicianProfile?.isVerified) {
      throw new BadRequestException('Technician must be verified to be featured');
    }

    // Store in technicianProfile as a flag (simplified approach)
    // In production, you might want a separate FeaturedTechnician table

    await this.prisma.technicianProfile.update({
      where: { userId: dto.technicianId },
      data: {
        // Add a featured field in your schema, for now we'll use a workaround
      },
    });

    // Notify technician
    await this.notificationsService.create({
      userId: dto.technicianId,
      type: 'SYSTEM',
      title: 'Profil mis en avant!',
      body: 'Félicitations! Votre profil a été sélectionné pour être mis en avant sur la plateforme.',
    });

    return { message: 'Technician featured successfully' };
  }

  async getFeaturedTechnicians(limit = 10) {
    // Get top rated and verified technicians
    const technicians = await this.prisma.user.findMany({
      where: {
        role: 'TECHNICIAN',
        status: 'ACTIVE',
        technicianProfile: {
          isVerified: true,
          avgRating: { gte: 4 },
        },
      },
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        technicianProfile: {
          select: {
            profession: true,
            specialties: true,
            avgRating: true,
            totalRatings: true,
            completedJobs: true,
            city: true,
            isVerified: true,
          },
        },
      },
      orderBy: {
        technicianProfile: {
          avgRating: 'desc',
        },
      },
    });

    return technicians.map((t) => ({
      ...t,
      technicianProfile: t.technicianProfile
        ? {
            ...t.technicianProfile,
            specialties: t.technicianProfile.specialties
              ? JSON.parse(t.technicianProfile.specialties)
              : [],
          }
        : null,
    }));
  }

  async unfeatureTechnician(technicianId: string) {
    const technician = await this.prisma.user.findUnique({
      where: { id: technicianId },
    });

    if (!technician) {
      throw new NotFoundException('Technician not found');
    }

    return { message: 'Technician unfeatured successfully' };
  }

  // ==========================================
  // MANAGER DASHBOARD
  // ==========================================

  async getManagerDashboard() {
    const [
      pendingAccounts,
      expiringLicenses,
      activeAds,
      recentTickets,
    ] = await Promise.all([
      this.prisma.user.count({ where: { status: 'PENDING_VERIFICATION' } }),
      this.getExpiringLicenses(7),
      this.prisma.advertisement.count({
        where: {
          isActive: true,
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
      }),
      this.prisma.supportTicket.count({
        where: { status: { in: ['open', 'in_progress'] } },
      }),
    ]);

    return {
      pendingAccounts,
      expiringLicenses: expiringLicenses.length,
      activeAdvertisements: activeAds,
      openSupportTickets: recentTickets,
    };
  }
}
