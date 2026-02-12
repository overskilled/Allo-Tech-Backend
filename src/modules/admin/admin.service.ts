import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  QueryUsersDto,
  UpdateUserStatusDto,
  VerifyTechnicianDto,
  SuspendUserDto,
  UserFilterRole,
  UserFilterStatus,
  DateRangeDto,
} from './dto/admin.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==========================================
  // DASHBOARD STATISTICS
  // ==========================================

  async getDashboardStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsers,
      totalClients,
      totalTechnicians,
      verifiedTechnicians,
      pendingVerifications,
      activeUsers,
      newUsersThisMonth,
      totalNeeds,
      openNeeds,
      completedNeeds,
      totalAppointments,
      completedAppointments,
      totalPayments,
      revenue,
      openTickets,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'CLIENT' } }),
      this.prisma.user.count({ where: { role: 'TECHNICIAN' } }),
      this.prisma.technicianProfile.count({ where: { isVerified: true } }),
      this.prisma.technicianProfile.count({ where: { isVerified: false } }),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.need.count(),
      this.prisma.need.count({ where: { status: 'OPEN' } }),
      this.prisma.need.count({ where: { status: 'COMPLETED' } }),
      this.prisma.appointment.count(),
      this.prisma.appointment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      this.prisma.supportTicket.count({
        where: { status: { in: ['open', 'in_progress'] } },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        clients: totalClients,
        technicians: totalTechnicians,
        verifiedTechnicians,
        pendingVerifications,
        activeUsers,
        newThisMonth: newUsersThisMonth,
      },
      needs: {
        total: totalNeeds,
        open: openNeeds,
        completed: completedNeeds,
        completionRate: totalNeeds > 0 ? Math.round((completedNeeds / totalNeeds) * 100) : 0,
      },
      appointments: {
        total: totalAppointments,
        completed: completedAppointments,
        completionRate: totalAppointments > 0
          ? Math.round((completedAppointments / totalAppointments) * 100)
          : 0,
      },
      payments: {
        totalTransactions: totalPayments,
        totalRevenue: revenue._sum.amount || 0,
      },
      support: {
        openTickets,
      },
    };
  }

  async getGrowthStats(range: DateRangeDto) {
    const endDate = range.endDate ? new Date(range.endDate) : new Date();
    const startDate = range.startDate
      ? new Date(range.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get daily signups
    const users = await this.prisma.user.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        createdAt: true,
        role: true,
      },
    });

    // Group by date
    const dailyStats: Record<string, { clients: number; technicians: number }> = {};

    users.forEach((user) => {
      const date = user.createdAt.toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { clients: 0, technicians: 0 };
      }
      if (user.role === 'CLIENT') {
        dailyStats[date].clients++;
      } else if (user.role === 'TECHNICIAN') {
        dailyStats[date].technicians++;
      }
    });

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      dailyStats,
      totalNewUsers: users.length,
    };
  }

  async getRevenueStats(range: DateRangeDto) {
    const endDate = range.endDate ? new Date(range.endDate) : new Date();
    const startDate = range.startDate
      ? new Date(range.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'COMPLETED',
        paidAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        amount: true,
        paidAt: true,
        paymentMethod: true,
      },
    });

    // Group by date
    const dailyRevenue: Record<string, number> = {};
    const byMethod: Record<string, number> = {};

    payments.forEach((payment) => {
      const date = payment.paidAt!.toISOString().split('T')[0];
      dailyRevenue[date] = (dailyRevenue[date] || 0) + Number(payment.amount);

      const method = payment.paymentMethod || 'unknown';
      byMethod[method] = (byMethod[method] || 0) + Number(payment.amount);
    });

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalRevenue,
      totalTransactions: payments.length,
      dailyRevenue,
      byPaymentMethod: byMethod,
    };
  }

  // ==========================================
  // USER MANAGEMENT
  // ==========================================

  async getUsers(query: QueryUsersDto) {
    const where: any = {};

    if (query.role && query.role !== UserFilterRole.ALL) {
      where.role = query.role;
    }

    if (query.status && query.status !== UserFilterStatus.ALL) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
        { email: { contains: query.search } },
      ];
    }

    if (query.fromDate) {
      where.createdAt = { ...where.createdAt, gte: new Date(query.fromDate) };
    }

    if (query.toDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(query.toDate) };
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
          profileImage: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          technicianProfile: {
            select: {
              isVerified: true,
              profession: true,
              avgRating: true,
              totalRatings: true,
              completedJobs: true,
            },
          },
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

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        clientProfile: true,
        technicianProfile: true,
        license: {
          include: {
            payments: {
              take: 10,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        _count: {
          select: {
            needsCreated: true,
            appointmentsAsClient: true,
            ratingsGiven: true,
            ratingsReceived: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Remove sensitive data
    const { passwordHash, passwordResetToken, emailVerifyToken, ...safeUser } = user;

    return safeUser;
  }

  async updateUserStatus(userId: string, dto: UpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { status: dto.status as any },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });
  }

  async suspendUser(userId: string, dto: SuspendUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'ADMIN') {
      throw new BadRequestException('Cannot suspend admin users');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });

    // Send notification
    await this.mailService.send({
      to: user.email,
      subject: 'Compte suspendu - AlloTech',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AlloTech</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2>Bonjour ${user.firstName},</h2>
            <p>Votre compte a été suspendu.</p>
            ${dto.reason ? `<p><strong>Raison:</strong> ${dto.reason}</p>` : ''}
            <p>Pour plus d'informations, veuillez contacter notre support.</p>
          </div>
        </div>
      `,
    });

    return { message: 'User suspended successfully' };
  }

  async reactivateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'ADMIN') {
      throw new BadRequestException('Cannot delete admin users');
    }

    // Soft delete: just mark as inactive
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE' },
    });

    return { message: 'User deleted successfully' };
  }

  // ==========================================
  // TECHNICIAN VERIFICATION
  // ==========================================

  async getPendingVerifications(query: QueryUsersDto) {
    const where: any = {
      role: 'TECHNICIAN',
      technicianProfile: {
        isVerified: false,
      },
    };

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
          profileImage: true,
          createdAt: true,
          technicianProfile: {
            select: {
              profession: true,
              specialties: true,
              studies: true,
              certifications: true,
              yearsExperience: true,
              identityDocumentUrl: true,
              city: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return createPaginatedResult(users, total, query);
  }

  async verifyTechnician(userId: string, dto: VerifyTechnicianDto) {
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

    if (user.technicianProfile.isVerified) {
      throw new BadRequestException('Technician is already verified');
    }

    await this.prisma.technicianProfile.update({
      where: { userId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    // Send notification
    await this.notificationsService.create({
      userId,
      type: 'SYSTEM',
      title: 'Profil vérifié!',
      body: 'Félicitations! Votre profil technicien a été vérifié. Vous pouvez maintenant recevoir des demandes.',
    });

    await this.mailService.send({
      to: user.email,
      subject: 'Profil vérifié - AlloTech',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #16a34a; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AlloTech</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2>Félicitations ${user.firstName}!</h2>
            <p>Votre profil technicien a été vérifié avec succès.</p>
            <p>Vous pouvez maintenant:</p>
            <ul>
              <li>Recevoir des demandes de clients</li>
              <li>Soumettre des candidatures</li>
              <li>Afficher le badge vérifié sur votre profil</li>
            </ul>
          </div>
        </div>
      `,
    });

    return { message: 'Technician verified successfully' };
  }

  async rejectVerification(userId: string, reason: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Notify user
    await this.notificationsService.create({
      userId,
      type: 'SYSTEM',
      title: 'Vérification refusée',
      body: reason || 'Votre demande de vérification a été refusée. Veuillez compléter votre profil.',
    });

    await this.mailService.send({
      to: user.email,
      subject: 'Vérification refusée - AlloTech',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AlloTech</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2>Bonjour ${user.firstName},</h2>
            <p>Votre demande de vérification a été refusée.</p>
            ${reason ? `<p><strong>Raison:</strong> ${reason}</p>` : ''}
            <p>Veuillez compléter votre profil et soumettre à nouveau les documents requis.</p>
          </div>
        </div>
      `,
    });

    return { message: 'Verification rejected' };
  }

  // ==========================================
  // ACTIVITY LOGS
  // ==========================================

  async getRecentActivity(limit = 50) {
    const [recentUsers, recentNeeds, recentAppointments, recentPayments] = await Promise.all([
      this.prisma.user.findMany({
        take: limit / 4,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      }),
      this.prisma.need.findMany({
        take: limit / 4,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          client: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.appointment.findMany({
        take: limit / 4,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          scheduledDate: true,
          createdAt: true,
        },
      }),
      this.prisma.payment.findMany({
        take: limit / 4,
        orderBy: { createdAt: 'desc' },
        where: { status: 'COMPLETED' },
        select: {
          id: true,
          amount: true,
          currency: true,
          createdAt: true,
        },
      }),
    ]);

    // Combine and sort by date
    const activities = [
      ...recentUsers.map((u) => ({
        type: 'user_registered',
        data: u,
        timestamp: u.createdAt,
      })),
      ...recentNeeds.map((n) => ({
        type: 'need_created',
        data: n,
        timestamp: n.createdAt,
      })),
      ...recentAppointments.map((a) => ({
        type: 'appointment_created',
        data: a,
        timestamp: a.createdAt,
      })),
      ...recentPayments.map((p) => ({
        type: 'payment_received',
        data: p,
        timestamp: p.createdAt,
      })),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return activities.slice(0, limit);
  }
}
