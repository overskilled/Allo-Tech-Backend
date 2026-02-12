import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  CreateLicenseDto,
  ActivateLicenseDto,
  RenewLicenseDto,
  UpdateLicenseDto,
  LicensePlan,
  LICENSE_PRICING,
  TRIAL_DURATION_DAYS,
} from './dto/license.dto';

@Injectable()
export class LicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  // ==========================================
  // LICENSE MANAGEMENT
  // ==========================================

  async createTrialLicense(userId: string) {
    // Check if user already has a license
    const existing = await this.prisma.license.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new BadRequestException('User already has a license');
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DURATION_DAYS);

    const license = await this.prisma.license.create({
      data: {
        userId,
        status: 'TRIAL',
        plan: LicensePlan.BASIC,
        trialStartDate: now,
        trialEndDate: trialEnd,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Update user status to TRIAL
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'TRIAL' },
    });

    return license;
  }

  async activateLicense(licenseId: string, dto: ActivateLicenseDto) {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!license) {
      throw new NotFoundException('License not found');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = new Date(dto.endDate);

    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const updated = await this.prisma.license.update({
      where: { id: licenseId },
      data: {
        status: 'ACTIVE',
        plan: dto.plan,
        startDate,
        endDate,
        autoRenew: dto.autoRenew ?? false,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Update user status
    await this.prisma.user.update({
      where: { id: license.userId },
      data: { status: 'ACTIVE' },
    });

    // Send activation email
    await this.mailService.sendLicenseActivated(updated.user.email, {
      name: `${updated.user.firstName} ${updated.user.lastName}`,
      plan: dto.plan,
      startDate: startDate.toLocaleDateString('fr-FR'),
      endDate: endDate.toLocaleDateString('fr-FR'),
    });

    return updated;
  }

  async renewLicense(licenseId: string, dto: RenewLicenseDto) {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!license) {
      throw new NotFoundException('License not found');
    }

    const newEndDate = new Date(dto.endDate);
    const newStartDate = license.endDate && license.endDate > new Date()
      ? license.endDate
      : new Date();

    if (newEndDate <= newStartDate) {
      throw new BadRequestException('End date must be after current end date');
    }

    const updated = await this.prisma.license.update({
      where: { id: licenseId },
      data: {
        status: 'ACTIVE',
        plan: dto.plan ?? license.plan,
        startDate: newStartDate,
        endDate: newEndDate,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Update user status if it was expired
    await this.prisma.user.update({
      where: { id: license.userId },
      data: { status: 'ACTIVE' },
    });

    // Send activation email
    await this.mailService.sendLicenseActivated(updated.user.email, {
      name: `${updated.user.firstName} ${updated.user.lastName}`,
      plan: updated.plan,
      startDate: newStartDate.toLocaleDateString('fr-FR'),
      endDate: newEndDate.toLocaleDateString('fr-FR'),
    });

    return updated;
  }

  async cancelLicense(licenseId: string, userId: string) {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!license) {
      throw new NotFoundException('License not found');
    }

    if (license.userId !== userId) {
      throw new ForbiddenException('Not authorized to cancel this license');
    }

    return this.prisma.license.update({
      where: { id: licenseId },
      data: {
        status: 'CANCELLED',
        autoRenew: false,
      },
    });
  }

  async updateLicense(licenseId: string, userId: string, dto: UpdateLicenseDto) {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!license) {
      throw new NotFoundException('License not found');
    }

    if (license.userId !== userId) {
      throw new ForbiddenException('Not authorized to update this license');
    }

    const updateData: any = {};
    if (dto.autoRenew !== undefined) updateData.autoRenew = dto.autoRenew;

    return this.prisma.license.update({
      where: { id: licenseId },
      data: updateData,
    });
  }

  // ==========================================
  // QUERIES
  // ==========================================

  async getMyLicense(userId: string) {
    const license = await this.prisma.license.findUnique({
      where: { userId },
      include: {
        payments: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!license) {
      throw new NotFoundException('No license found');
    }

    return {
      ...license,
      isActive: this.isLicenseActive(license),
      daysRemaining: this.getDaysRemaining(license),
      planDetails: LICENSE_PRICING[license.plan as LicensePlan],
    };
  }

  async getLicenseByUserId(userId: string) {
    return this.prisma.license.findUnique({
      where: { userId },
    });
  }

  async getLicenseById(licenseId: string) {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!license) {
      throw new NotFoundException('License not found');
    }

    return {
      ...license,
      isActive: this.isLicenseActive(license),
      daysRemaining: this.getDaysRemaining(license),
    };
  }

  async getAllLicenses(query: {
    status?: string;
    plan?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.plan) {
      where.plan = query.plan;
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [licenses, total] = await Promise.all([
      this.prisma.license.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.license.count({ where }),
    ]);

    return {
      data: licenses.map((l) => ({
        ...l,
        isActive: this.isLicenseActive(l),
        daysRemaining: this.getDaysRemaining(l),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================
  // LICENSE CHECKING (Called by other services)
  // ==========================================

  async checkLicenseStatus(userId: string): Promise<{
    hasLicense: boolean;
    isActive: boolean;
    status: string;
    plan: string;
    daysRemaining: number;
  }> {
    const license = await this.prisma.license.findUnique({
      where: { userId },
    });

    if (!license) {
      return {
        hasLicense: false,
        isActive: false,
        status: 'NONE',
        plan: 'none',
        daysRemaining: 0,
      };
    }

    return {
      hasLicense: true,
      isActive: this.isLicenseActive(license),
      status: license.status,
      plan: license.plan,
      daysRemaining: this.getDaysRemaining(license),
    };
  }

  async requireActiveLicense(userId: string) {
    const status = await this.checkLicenseStatus(userId);

    if (!status.hasLicense) {
      throw new ForbiddenException('No license found. Please subscribe to continue.');
    }

    if (!status.isActive) {
      throw new ForbiddenException(
        `Your license has ${status.status.toLowerCase()}. Please renew to continue.`,
      );
    }

    return status;
  }

  // ==========================================
  // EXPIRATION HANDLING (Cron job)
  // ==========================================

  async processExpiringLicenses() {
    const now = new Date();
    const warningDate = new Date(now);
    warningDate.setDate(warningDate.getDate() + 7); // 7 days warning

    // Find licenses expiring within 7 days
    const expiringLicenses = await this.prisma.license.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          gte: now,
          lte: warningDate,
        },
      },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Send warning emails
    for (const license of expiringLicenses) {
      const daysRemaining = this.getDaysRemaining(license);
      await this.mailService.sendLicenseExpiring(license.user.email, {
        name: `${license.user.firstName} ${license.user.lastName}`,
        plan: license.plan,
        expiryDate: license.endDate!.toLocaleDateString('fr-FR'),
        daysRemaining,
      });
    }

    return { warned: expiringLicenses.length };
  }

  async processExpiredLicenses() {
    const now = new Date();

    // Find expired licenses
    const expiredLicenses = await this.prisma.license.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          lt: now,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Also check trial licenses
    const expiredTrials = await this.prisma.license.findMany({
      where: {
        status: 'TRIAL',
        trialEndDate: {
          lt: now,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const allExpired = [...expiredLicenses, ...expiredTrials];

    // Update status and send emails
    for (const license of allExpired) {
      await this.prisma.license.update({
        where: { id: license.id },
        data: { status: 'EXPIRED' },
      });

      await this.prisma.user.update({
        where: { id: license.userId },
        data: { status: 'INACTIVE' },
      });

      await this.mailService.sendLicenseExpired(license.user.email, {
        name: `${license.user.firstName} ${license.user.lastName}`,
        plan: license.plan,
      });
    }

    return { expired: allExpired.length };
  }

  // ==========================================
  // PRICING
  // ==========================================

  getPricing() {
    return {
      plans: LICENSE_PRICING,
      trialDays: TRIAL_DURATION_DAYS,
      currency: 'XAF',
    };
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private isLicenseActive(license: any): boolean {
    const now = new Date();

    if (license.status === 'TRIAL') {
      return license.trialEndDate && license.trialEndDate > now;
    }

    if (license.status === 'ACTIVE') {
      return license.endDate && license.endDate > now;
    }

    return false;
  }

  private getDaysRemaining(license: any): number {
    const now = new Date();
    let endDate: Date | null = null;

    if (license.status === 'TRIAL') {
      endDate = license.trialEndDate;
    } else if (license.status === 'ACTIVE') {
      endDate = license.endDate;
    }

    if (!endDate) return 0;

    const diff = endDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
}
